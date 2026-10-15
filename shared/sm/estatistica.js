'use strict';

/**
 * estatistica.js — Pipeline estatístico da OAS-SM sem dependências externas
 * (Desenho Experimental v1.3 §7), para rodar onde não há Jamovi nem R.
 *
 * O CSV do lote continua no esquema da Tabela 6.1 e importável no Jamovi/R;
 * este módulo reproduz as análises previstas para que o lote possa ser lido
 * já no repositório:
 *   - ablação: contraste pareado (pela semente) C0 × Ci, com correção de Holm;
 *   - fatorial 2⁵: ANOVA dos efeitos principais e das interações de 2ª ordem,
 *     com η² parcial (delineamento balanceado, contrastes ±1 ortogonais);
 *   - regressão logística (IRLS) sobre desfechos binários;
 *   - fronteira de Pareto no plano custo × efeito;
 *   - teste pareado para o contraste de apoio externo, com tamanho de efeito.
 *
 * As distribuições t, F e normal saem da função beta incompleta regularizada
 * (Numerical Recipes, 2ª ed., §6.1–6.4).
 */

// ─── Funções especiais ────────────────────────────────────────────────────────

const LANCZOS = [76.18009172947146, -86.50532032941677, 24.01409824083091,
  -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];

/** ln Γ(x), x > 0. */
function lnGama(x) {
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of LANCZOS) ser += c / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function fracaoContinuaBeta(a, b, x) {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
function betaIncompleta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGama(a + b) - lnGama(a) - lnGama(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? bt * fracaoContinuaBeta(a, b, x) / a
    : 1 - bt * fracaoContinuaBeta(b, a, 1 - x) / b;
}

/** p bilateral da estatística t com `gl` graus de liberdade. */
function pT(t, gl) {
  if (!Number.isFinite(t)) return Number.isNaN(t) ? NaN : 0;
  return betaIncompleta(gl / (gl + t * t), gl / 2, 0.5);
}

/** p (cauda superior) da estatística F(gl1, gl2). */
function pF(f, gl1, gl2) {
  if (!(f > 0)) return f === 0 ? 1 : NaN;
  if (!Number.isFinite(f)) return 0;
  return betaIncompleta(gl2 / (gl2 + gl1 * f), gl2 / 2, gl1 / 2);
}

/** Função complementar do erro (erro relativo < 1,2e-7). */
function erfc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/** p bilateral da normal padrão. */
function pNormal(z) { return Number.isFinite(z) ? erfc(Math.abs(z) / Math.SQRT2) : 0; }

// ─── Descritivas ──────────────────────────────────────────────────────────────

function media(v) { return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN; }
function variancia(v) {
  if (v.length < 2) return NaN;
  const m = media(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
}
function dp(v) { return Math.sqrt(variancia(v)); }
function correlacao(x, y) {
  const mx = media(x), my = media(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

// ─── Testes ───────────────────────────────────────────────────────────────────

/**
 * Teste t pareado de a − b (mesma semente em cada par).
 * @returns {{ n, dif, dp, t, gl, p, dz }}  dz = d de Cohen para pares.
 */
function tPareado(a, b) {
  if (a.length !== b.length) throw new Error('tPareado: amostras de tamanhos diferentes.');
  const d = a.map((x, i) => x - b[i]);
  const n = d.length, m = media(d), s = dp(d), gl = n - 1;
  if (s === 0) return { n, dif: m, dp: 0, t: m === 0 ? 0 : Math.sign(m) * Infinity, gl, p: m === 0 ? 1 : 0, dz: m === 0 ? 0 : Math.sign(m) * Infinity };
  const t = m / (s / Math.sqrt(n));
  return { n, dif: m, dp: s, t, gl, p: pT(t, gl), dz: m / s };
}

/** Correção de Holm (step-down) — p ajustados, na ordem de entrada. */
function holm(ps) {
  const k = ps.length;
  const ordem = ps.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]);
  const aj = new Array(k);
  let maximo = 0;
  ordem.forEach(([p, i], r) => { maximo = Math.max(maximo, Math.min(1, (k - r) * p)); aj[i] = maximo; });
  return aj;
}

/** Todos os subconjuntos de `fatores` com 1..ordem elementos, na ordem padrão. */
function termos(fatores, ordem) {
  const out = [];
  const rec = (ini, atual) => {
    if (atual.length) out.push(atual.slice());
    if (atual.length === ordem) return;
    for (let i = ini; i < fatores.length; i++) { atual.push(fatores[i]); rec(i + 1, atual); atual.pop(); }
  };
  rec(0, []);
  return out.sort((x, y) => x.length - y.length);
}

/**
 * ANOVA de um fatorial 2^k balanceado com fatores codificados em ±1.
 * Modelo: efeitos principais + interações até `ordem`; o resíduo absorve as
 * interações de ordem superior e a variação entre réplicas.
 * @returns {{ n, glErro, qmErro, termos: [{ termo, efeito, ss, f, p, eta2p }] }}
 *   `efeito` = média em +1 − média em −1 do contraste do termo.
 */
function anovaFatorial(linhas, fatores, y, { ordem = 2 } = {}) {
  const n = linhas.length;
  const ys = linhas.map(l => Number(l[y]));
  const my = media(ys);
  const ssTotal = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  const ts = termos(fatores, ordem).map(t => {
    const x = linhas.map(l => t.reduce((p, f) => p * Number(l[f]), 1));
    if (x.some(v => v !== 1 && v !== -1)) throw new Error(`anovaFatorial: fator fora de ±1 em ${t.join('×')}.`);
    if (x.reduce((s, v) => s + v, 0) !== 0) throw new Error(`anovaFatorial: delineamento desbalanceado em ${t.join('×')}.`);
    const sxy = x.reduce((s, v, i) => s + v * ys[i], 0);
    return { termo: t.join('×'), efeito: 2 * sxy / n, ss: sxy * sxy / n };
  });
  const ssModelo = ts.reduce((s, t) => s + t.ss, 0);
  const glErro = n - 1 - ts.length;
  const ssErro = Math.max(0, ssTotal - ssModelo);
  const qmErro = ssErro / glErro;
  for (const t of ts) {
    t.f = qmErro > 0 ? t.ss / qmErro : (t.ss > 0 ? Infinity : 0);
    t.p = pF(t.f, 1, glErro);
    t.eta2p = t.ss + ssErro > 0 ? t.ss / (t.ss + ssErro) : 0;
  }
  return { n, glErro, qmErro, ssTotal, termos: ts };
}

// ─── Álgebra mínima ───────────────────────────────────────────────────────────

/** Inversa de matriz quadrada (Gauss–Jordan com pivotamento parcial). */
function inversa(A) {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) throw new Error('inversa: matriz singular.');
    [M[c], M[piv]] = [M[piv], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c || M[r][c] === 0) continue;
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map(r => r.slice(n));
}

/**
 * Regressão logística por mínimos quadrados reponderados (IRLS), com uma
 * penalização de crista mínima (`crista`) que evita a divergência quando um
 * preditor separa os desfechos.
 * @param {number[][]} X  preditores (sem intercepto)
 * @param {number[]} y    0/1
 * @returns {{ coef, ep, z, p, nomes, iteracoes, convergiu, logVeross, n, eventos }}
 */
function logistica(X, y, { nomes = null, crista = 1e-4, maxIter = 100, tol = 1e-9 } = {}) {
  const n = X.length, k = X[0].length + 1;
  const Z = X.map(r => [1, ...r]);
  let b = new Array(k).fill(0);
  let convergiu = false, it = 0, H;
  for (; it < maxIter; it++) {
    const g = new Array(k).fill(0);
    H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < n; i++) {
      const eta = Z[i].reduce((s, v, j) => s + v * b[j], 0);
      const pr = 1 / (1 + Math.exp(-eta));
      const w = pr * (1 - pr);
      for (let j = 0; j < k; j++) {
        g[j] += Z[i][j] * (y[i] - pr);
        for (let l = 0; l < k; l++) H[j][l] += w * Z[i][j] * Z[i][l];
      }
    }
    for (let j = 1; j < k; j++) { H[j][j] += crista; g[j] -= crista * b[j]; }
    const Hi = inversa(H);
    const passo = Hi.map(r => r.reduce((s, v, j) => s + v * g[j], 0));
    b = b.map((v, j) => v + passo[j]);
    if (Math.max(...passo.map(Math.abs)) < tol) { convergiu = true; it++; break; }
  }
  const Hi = inversa(H);
  const ep = Hi.map((r, j) => Math.sqrt(r[j]));
  const z = b.map((v, j) => v / ep[j]);
  let ll = 0;
  for (let i = 0; i < n; i++) {
    const eta = Z[i].reduce((s, v, j) => s + v * b[j], 0);
    ll += y[i] * eta - Math.log1p(Math.exp(eta));
  }
  return {
    nomes: ['(intercepto)', ...(nomes ?? X[0].map((_, j) => `x${j + 1}`))],
    coef: b, ep, z, p: z.map(pNormal), iteracoes: it, convergiu, logVeross: ll,
    n, eventos: y.reduce((s, v) => s + v, 0),
  };
}

/**
 * Fronteira de Pareto: pontos não dominados com custo menor e efeito maior
 * (ou menor, se `maior = false`). Devolve os pontos da fronteira por custo.
 */
function pareto(pontos, { custo = 'custo', efeito = 'efeito', maior = true } = {}) {
  const melhor = (a, b) => (maior ? a >= b : a <= b);
  const estrito = (a, b) => (maior ? a > b : a < b);
  return pontos
    .filter(p => !pontos.some(q => q !== p && q[custo] <= p[custo] && melhor(q[efeito], p[efeito]) &&
      (q[custo] < p[custo] || estrito(q[efeito], p[efeito]))))
    .sort((a, b) => a[custo] - b[custo]);
}

// ─── Leitura do CSV do lote ───────────────────────────────────────────────────

/** Lê o CSV do runner (sem aspas; vazio = null; números convertidos). */
function lerCsv(texto) {
  const [cab, ...linhas] = texto.trim().split(/\r?\n/);
  const cols = cab.split(',');
  return linhas.map(l => {
    const v = l.split(',');
    return Object.fromEntries(cols.map((c, i) => {
      const s = v[i] ?? '';
      if (s === '') return [c, null];
      const x = Number(s);
      return [c, Number.isNaN(x) ? s : x];
    }));
  });
}

module.exports = {
  lnGama, betaIncompleta, pT, pF, pNormal, erfc,
  media, variancia, dp, correlacao,
  tPareado, holm, termos, anovaFatorial, inversa, logistica, pareto, lerCsv,
};
