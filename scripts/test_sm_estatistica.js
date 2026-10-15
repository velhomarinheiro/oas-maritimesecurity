'use strict';
/**
 * test_sm_estatistica.js — Testes do pipeline estatístico da SM-10
 * (shared/sm/estatistica.js), contra valores de tabela conhecidos e dados
 * sintéticos com parâmetros conhecidos.
 *
 * Uso: node scripts/test_sm_estatistica.js
 */

const assert = require('assert');
const ES = require('../shared/sm/estatistica');
const { mulberry32 } = require('../shared/rng');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}
function perto(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, `${msg} — esperado ${b} ± ${tol}, veio ${a}`);
  console.log('✅ ' + msg);
  pass++;
}

// ─── Distribuições (valores críticos de tabela) ───────────────────────────────
perto(ES.lnGama(5), Math.log(24), 1e-10, 'ln Γ(5) = ln 24');
perto(ES.lnGama(0.5), Math.log(Math.sqrt(Math.PI)), 1e-10, 'ln Γ(½) = ln √π');
perto(ES.betaIncompleta(0.5, 2, 2), 0.5, 1e-12, 'I₀,₅(2,2) = ½ (simetria)');
perto(ES.pT(2.228139, 10), 0.05, 1e-5, 't(10) = 2,228 ⇒ p bilateral 0,05');
perto(ES.pT(2.008559, 50), 0.05, 1e-5, 't(50) = 2,010 ⇒ p bilateral 0,05');
perto(ES.pT(0, 7), 1, 1e-12, 't = 0 ⇒ p = 1');
perto(ES.pF(4.964603, 1, 10), 0.05, 1e-5, 'F(1,10) = 4,965 ⇒ p 0,05');
perto(ES.pF(3.098391, 3, 20), 0.05, 1e-5, 'F(3,20) = 3,098 ⇒ p 0,05');
perto(ES.pF(6.634897, 1, 1e6), 0.01, 1e-4, 'F(1,∞) = 6,635 ⇒ p 0,01 (χ²₁)');
perto(ES.pNormal(1.959964), 0.05, 1e-6, 'z = 1,96 ⇒ p bilateral 0,05');
perto(ES.pNormal(2.575829), 0.01, 1e-6, 'z = 2,576 ⇒ p bilateral 0,01');

// ─── Descritivas e testes ─────────────────────────────────────────────────────
perto(ES.media([1, 2, 3, 4]), 2.5, 1e-12, 'média');
perto(ES.variancia([2, 4, 4, 4, 5, 5, 7, 9]), 32 / 7, 1e-12, 'variância amostral (n − 1)');
perto(ES.correlacao([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-12, 'correlação perfeita = 1');
{
  // Exemplo clássico de Student (sono, 10 pares): t = 4,062, gl = 9, p ≈ 0,00283.
  const a = [1.9, 0.8, 1.1, 0.1, -0.1, 4.4, 5.5, 1.6, 4.6, 3.4];
  const b = [0.7, -1.6, -0.2, -1.2, -0.1, 3.4, 3.7, 0.8, 0.0, 2.0];
  const r = ES.tPareado(a, b);
  perto(r.t, 4.062128, 1e-5, 't pareado do exemplo de Student');
  perto(r.p, 0.002833, 1e-5, 'p do exemplo de Student');
  ok(r.gl === 9 && Math.abs(r.dz - r.dif / r.dp) < 1e-12, 'gl = n − 1 e dz = média/dp das diferenças');
  const nulo = ES.tPareado([1, 2, 3], [1, 2, 3]);
  ok(nulo.p === 1 && nulo.t === 0, 'diferenças todas nulas ⇒ t = 0, p = 1');
}
{
  const aj = ES.holm([0.01, 0.04, 0.03, 0.005]);
  ok(JSON.stringify(aj.map(v => +v.toFixed(6))) === JSON.stringify([0.03, 0.06, 0.06, 0.02]),
     'Holm: ajuste step-down monotônico, na ordem de entrada');
  ok(ES.holm([0.6, 0.9]).every(v => v <= 1), 'Holm: p ajustado limitado a 1');
}

// ─── ANOVA fatorial 2^k ───────────────────────────────────────────────────────
{
  ok(ES.termos(['A', 'B', 'C'], 2).map(t => t.join('')).join(' ') === 'A B C AB AC BC', 'termos até a 2ª ordem');
  ok(ES.termos(['A', 'B', 'C', 'D', 'E'], 2).length === 15, '2⁵: 5 efeitos principais + 10 interações');
  // y = 10 + 2A − 1B + 0,5AB (+ ruído) num 2³ com 4 réplicas.
  const rng = mulberry32(42);
  const linhas = [];
  for (let r = 0; r < 4; r++) for (const A of [-1, 1]) for (const B of [-1, 1]) for (const C of [-1, 1]) {
    linhas.push({ A, B, C, y: 10 + 2 * A - B + 0.5 * A * B, yr: 10 + 2 * A - B + 0.5 * A * B + (rng() - 0.5) });
  }
  const exato = ES.anovaFatorial(linhas, ['A', 'B', 'C'], 'y');
  const T = Object.fromEntries(exato.termos.map(t => [t.termo, t]));
  ok(T.A.efeito === 4 && T.B.efeito === -2 && T['A×B'].efeito === 1 && T.C.efeito === 0,
     'efeito = 2 × coeficiente (média em +1 − média em −1)');
  ok(exato.glErro === 32 - 1 - 6, 'gl do erro = n − 1 − nº de termos');
  ok(T.A.ss === 32 * 4, 'SS do termo = n × (efeito/2)²');
  const ruido = ES.anovaFatorial(linhas, ['A', 'B', 'C'], 'yr');
  const R = Object.fromEntries(ruido.termos.map(t => [t.termo, t]));
  ok(R.A.p < 1e-10 && R.A.eta2p > 0.95, 'efeito forte: p ínfimo e η² parcial alto');
  ok(R.C.p > 0.01 && R.C.eta2p < 0.3, 'efeito nulo: não significativo, η² parcial baixo');
  // A soma dos SS dos termos com o do erro fecha o SS total.
  const soma = ruido.termos.reduce((s, t) => s + t.ss, 0) + ruido.qmErro * ruido.glErro;
  perto(soma, ruido.ssTotal, 1e-9, 'decomposição: Σ SS termos + SS erro = SS total');
  assert.throws(() => ES.anovaFatorial(linhas.slice(1), ['A', 'B', 'C'], 'y'), /desbalanceado/);
  ok(true, 'delineamento desbalanceado é recusado');
}

// ─── Regressão logística ──────────────────────────────────────────────────────
{
  // logit p = −0,5 + 1,2 x₁ − 0,8 x₂, com x em ±1, n = 8000.
  const rng = mulberry32(7);
  const X = [], y = [];
  for (let i = 0; i < 8000; i++) {
    const x1 = rng() < 0.5 ? -1 : 1, x2 = rng() < 0.5 ? -1 : 1;
    const p = 1 / (1 + Math.exp(-(-0.5 + 1.2 * x1 - 0.8 * x2)));
    X.push([x1, x2]); y.push(rng() < p ? 1 : 0);
  }
  const m = ES.logistica(X, y, { nomes: ['x1', 'x2'] });
  ok(m.convergiu, 'IRLS converge');
  perto(m.coef[0], -0.5, 0.1, 'recupera o intercepto');
  perto(m.coef[1], 1.2, 0.1, 'recupera o coeficiente de x1');
  perto(m.coef[2], -0.8, 0.1, 'recupera o coeficiente de x2');
  ok(m.p[1] < 1e-10 && m.ep.every(v => v > 0), 'erros-padrão positivos e efeito forte significativo');
  // Separação completa: a crista mantém a estimativa finita.
  const sep = ES.logistica([[-1], [-1], [1], [1]], [0, 0, 1, 1]);
  ok(sep.coef.every(Number.isFinite), 'separação completa não diverge (crista)');
}

// ─── Pareto e CSV ─────────────────────────────────────────────────────────────
{
  const pts = [
    { id: 'a', custo: 0, efeito: 1 }, { id: 'b', custo: 50, efeito: 3 }, { id: 'c', custo: 60, efeito: 2 },
    { id: 'd', custo: 100, efeito: 3 }, { id: 'e', custo: 120, efeito: 5 },
  ];
  ok(ES.pareto(pts).map(p => p.id).join('') === 'abe', 'fronteira: não dominados por custo e efeito');
  ok(ES.pareto(pts, { maior: false }).map(p => p.id).join('') === 'a', 'fronteira com efeito a minimizar');
  const l = ES.lerCsv('a,b,c\n1,x,\n2.5,y,3\n');
  ok(l.length === 2 && l[0].a === 1 && l[0].b === 'x' && l[0].c === null && l[1].a === 2.5, 'leitura do CSV do lote');
}

console.log(`\nSM-10 (estatística): ${pass} verificações — ALL PASS`);
