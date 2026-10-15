'use strict';
/**
 * sm_analise.js — Pipeline estatístico do lote da OAS-SM (Desenho
 * Experimental v1.3 §7), sem dependências: lê o CSV do runner e escreve um
 * relatório em Markdown.
 *
 *   1. Ablação: C0 × Ci pareado pela semente, correção de Holm por métrica.
 *   2. Fatorial 2⁵: ANOVA (efeitos principais + interações de 2ª ordem), η² parcial.
 *   3. Regressão logística: escalada a N3 e perda do KCV sobre os fatores.
 *   4. Pareto custo EAC × efeito, e sensibilidade da fronteira ao vetor de custo.
 *   5. Contraste de apoio externo: E5, E1, E4, com tamanho de efeito.
 *   6. Compromisso E5_ordem × E1_atrib em função de C_Fusão.
 *   7. Sensibilidade do desfecho aos limiares de DESFECHO.
 *
 * Uso:
 *   node scripts/sm_analise.js                          # data/sm/dataset_oas_sm.csv (gera, se faltar)
 *   node scripts/sm_analise.js --dados arq.csv --relatorio docs/sm/resultados/analise_lote.md
 */

const fs = require('fs');
const path = require('path');
const ES = require('../shared/sm/estatistica');
const R = require('../shared/sm/runner');
const { PARAMS: P } = require('../shared/sm/params');

const args = process.argv.slice(2);
const opt = (nome, padrao) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args[i + 1] : padrao; };
const RAIZ = path.join(__dirname, '..');
const dados = path.resolve(opt('dados', path.join(RAIZ, 'data', 'sm', 'dataset_oas_sm.csv')));
const relatorio = path.resolve(opt('relatorio', path.join(RAIZ, 'data', 'sm', 'analise_lote.md')));

if (!fs.existsSync(dados)) {
  process.stderr.write(`${dados} não existe; rodando o lote…\n`);
  const { linhas } = R.rodarLote();
  fs.mkdirSync(path.dirname(dados), { recursive: true });
  fs.writeFileSync(dados, R.paraCsv(linhas), 'utf8');
}
const linhas = ES.lerCsv(fs.readFileSync(dados, 'utf8'));
const bloco = b => linhas.filter(l => l.bloco === b);
const F = P.FATORES_SM;
const METRICAS = ['E1_atrib', 'E2_infra', 'E3_escalada', 'E4_custopol', 'E5_ordem', 'E6_dispersao', 'sloc_idx'];
const SENTIDO = { E1_atrib: +1, E2_infra: +1, E3_escalada: +1, E4_custopol: -1, E5_ordem: +1, E6_dispersao: -1, sloc_idx: +1 };
const v = (l, m) => (l[m] == null ? 0 : Number(l[m]));

const virg = s => String(s).replace(/(\d)\.(\d)/g, '$1,$2');
const n2 = x => virg(Number.isFinite(x) ? x.toFixed(2) : '—');
const n3 = x => virg(Number.isFinite(x) ? x.toFixed(3) : '—');
const sg = x => (x > 0 ? '+' : '') + n3(x);
const fp = p => (p < 0.001 ? '<0,001' : virg(p.toFixed(3)));
const L = [];
L.push('# Análise do lote da OAS-SM — resultados', '');
L.push(`Gerado por \`node scripts/sm_analise.js\` sobre \`${path.relative(RAIZ, dados)}\` (${linhas.length} partidas). ` +
  'Pipeline do Desenho Experimental v1.3 §7, reproduzido sem dependências (`shared/sm/estatistica.js`); o mesmo CSV segue importável no Jamovi/R. ' +
  'Os números refletem os parâmetros placeholder: servem para verificar o pipeline e orientar a revisão, não para conclusões sobre as capacidades.', '');

// ─── 1. Ablação ───────────────────────────────────────────────────────────────
{
  const ab = bloco('ablacao');
  const porCond = c => ab.filter(l => l.condicao === c).sort((a, b) => a.semente - b.semente);
  const c0 = porCond('C0');
  L.push('## 1. Ablação (contribuição marginal de cada capacidade)', '');
  L.push('Diferença C0 − Ci (todas as capacidades menos a capacidade sem ela), pareada pela semente; p corrigido por Holm entre as cinco capacidades de cada métrica; dz = d de Cohen para pares. Sinal a favor do Azul: E4 e E6 menores são melhores.', '');
  L.push(`| Capacidade retirada | ${METRICAS.join(' | ')} |`, `|---|${METRICAS.map(() => '---').join('|')}|`);
  const res = F.map((f, i) => {
    const ci = porCond(`C${i + 1}`);
    return { f, t: Object.fromEntries(METRICAS.map(m => [m, ES.tPareado(c0.map(l => v(l, m)), ci.map(l => v(l, m)))])) };
  });
  for (const m of METRICAS) { const aj = ES.holm(res.map(r => r.t[m].p)); res.forEach((r, i) => { r.t[m].pHolm = aj[i]; }); }
  for (const r of res) {
    L.push(`| ${r.f} | ${METRICAS.map(m => { const t = r.t[m]; const s = `${sg(t.dif)} (dz ${n2(t.dz)})`; return t.pHolm < 0.05 ? `**${s}**` : s; }).join(' | ')} |`);
  }
  L.push('', 'Em negrito: p de Holm < 0,05.', '');
}

// ─── 2. Fatorial ──────────────────────────────────────────────────────────────
{
  const fa = bloco('fatorial');
  L.push('## 2. Fatorial 2⁵ — ANOVA', '');
  L.push(`Modelo com os 5 efeitos principais e as 10 interações de 2ª ordem; o resíduo absorve as interações de ordem superior e a variação entre réplicas (n = ${fa.length}). Efeito = média em +1 − média em −1.`, '');
  L.push(`| Termo | ${METRICAS.map(m => `${m} efeito (η²p)`).join(' | ')} |`, `|---|${METRICAS.map(() => '---').join('|')}|`);
  const anovas = Object.fromEntries(METRICAS.map(m => [m, ES.anovaFatorial(fa, F, m)]));
  const nomes = anovas.E1_atrib.termos.map(t => t.termo);
  for (const [k, nome] of nomes.entries()) {
    const celulas = METRICAS.map(m => { const t = anovas[m].termos[k]; const s = `${sg(t.efeito)} (${n2(t.eta2p)})`; return t.p < 0.05 && t.eta2p >= 0.01 ? `**${s}**` : s; });
    if (k < F.length || celulas.some(c => c.startsWith('**'))) L.push(`| ${nome} | ${celulas.join(' | ')} |`);
  }
  L.push('', 'Em negrito: p < 0,05 e η²p ≥ 0,01. Interações sem nenhum efeito assim foram omitidas da tabela (estão no cálculo).', '');
}

// ─── 3. Logística ─────────────────────────────────────────────────────────────
{
  const fa = bloco('fatorial');
  const X = fa.map(l => F.map(f => v(l, f)));
  L.push('## 3. Regressão logística', '');
  for (const [rot, y] of [['Escalada a N3 (nivel_max = 3)', fa.map(l => (v(l, 'nivel_max') === 3 ? 1 : 0))], ['Perda do KCV (kcv_perdido)', fa.map(l => v(l, 'kcv_perdido'))]]) {
    const ev = y.reduce((s, x) => s + x, 0);
    L.push(`**${rot}** — ${ev} eventos em ${y.length} partidas.`, '');
    if (ev < 10 || y.length - ev < 10) { L.push('Poucos eventos para estimar o modelo (menos de 10 numa das classes).', ''); continue; }
    // Separação: um nível de algum fator sem nenhum evento (ou só eventos).
    const tab = F.map(f => ({ f, menos: y.filter((_, i) => X[i][F.indexOf(f)] === -1), mais: y.filter((_, i) => X[i][F.indexOf(f)] === 1) }));
    L.push(`Eventos por nível: ${tab.map(t => `${t.f} ${t.menos.reduce((s, x) => s + x, 0)} (−1) / ${t.mais.reduce((s, x) => s + x, 0)} (+1)`).join('; ')}.`, '');
    const separa = tab.filter(t => [t.menos, t.mais].some(g => g.every(x => x === 0) || g.every(x => x === 1))).map(t => t.f);
    const preditores = F.filter(f => !separa.includes(f));
    if (separa.length) {
      L.push(`**Separação:** ${separa.join(', ')} separa os desfechos — num dos níveis não há nenhum evento, e o coeficiente da logística iria ao infinito. ` +
        `O efeito desse fator é a própria tabela acima; o modelo abaixo é ajustado só dentro do nível com eventos, sobre os demais fatores.`, '');
    }
    const dentro = separa.length ? y.map((_, i) => i).filter(i => separa.every(f => { const t = tab.find(x => x.f === f); const nivel = t.mais.some(Boolean) ? 1 : -1; return X[i][F.indexOf(f)] === nivel; })) : y.map((_, i) => i);
    const m = ES.logistica(dentro.map(i => preditores.map(f => X[i][F.indexOf(f)])), dentro.map(i => y[i]), { nomes: preditores });
    L.push(`| Termo | coeficiente (logit) | razão de chances (+1 × −1) | EP | p |`, '|---|---|---|---|---|');
    m.nomes.forEach((nm, j) => L.push(`| ${nm} | ${sg(m.coef[j])} | ${j ? n2(Math.exp(2 * m.coef[j])) : '—'} | ${n3(m.ep[j])} | ${fp(m.p[j])} |`));
    L.push('', `n = ${m.n}, ${m.eventos} eventos. Codificação ±1: a razão de chances de +1 contra −1 é exp(2 × coeficiente). IRLS ${m.convergiu ? 'convergiu' : 'NÃO convergiu'} em ${m.iteracoes} iterações.`, '');
  }
}

// ─── 4. Pareto ────────────────────────────────────────────────────────────────
{
  const fa = bloco('fatorial');
  const conds = [...new Set(fa.map(l => l.condicao))].map(c => {
    const ls = fa.filter(l => l.condicao === c);
    const fat = Object.fromEntries(F.map(f => [f, ls[0][f]]));
    return { condicao: c, fat, rotulo: F.filter(f => fat[f] === 1).map(f => f.split('_')[0]).join('') || '∅',
      ...Object.fromEntries(['E1_atrib', 'E2_infra', 'E5_ordem'].map(m => [m, ES.media(ls.map(l => v(l, m)))])) };
  });
  const custo = (c, eac) => F.reduce((s, f) => s + (c.fat[f] === 1 ? eac[f] : 0), 0);
  const fronteira = (m, eac) => ES.pareto(conds.map(c => ({ ...c, custo: custo(c, eac), efeito: c[m] })));
  L.push('## 4. Pareto: custo EAC × efeito', '');
  L.push(`Médias por condição do fatorial (32). Custo = soma do EAC das capacidades ativas (Tabela 2.2: ${F.map(f => `${f} ${P.CUSTO_EAC[f]}`).join(', ')}). Rótulo = capacidades ativas pela letra (A–E).`, '');
  for (const m of ['E1_atrib', 'E2_infra', 'E5_ordem']) {
    const fr = fronteira(m, P.CUSTO_EAC);
    L.push(`**${m}** — fronteira: ${fr.map(p => `${p.rotulo} (${p.custo}; ${n3(p.efeito)})`).join(' → ')}.`, '');
  }
  L.push('Sensibilidade da fronteira ao vetor de custo: cada custo EAC a −30% e +30% (os demais fixos). Conta as condições que entram ou saem da fronteira.', '');
  L.push('| Custo alterado | E1_atrib −30% | E1_atrib +30% | E2_infra −30% | E2_infra +30% | E5_ordem −30% | E5_ordem +30% |', '|---|---|---|---|---|---|---|');
  for (const f of F) {
    const cel = [];
    for (const m of ['E1_atrib', 'E2_infra', 'E5_ordem']) {
      const base = new Set(fronteira(m, P.CUSTO_EAC).map(p => p.condicao));
      for (const k of [0.7, 1.3]) {
        const nova = new Set(fronteira(m, { ...P.CUSTO_EAC, [f]: P.CUSTO_EAC[f] * k }).map(p => p.condicao));
        const muda = [...base].filter(c => !nova.has(c)).length + [...nova].filter(c => !base.has(c)).length;
        cel.push(muda ? `**${muda}**` : '0');
      }
    }
    L.push(`| ${f} | ${cel.join(' | ')} |`);
  }
  L.push('');
}

// ─── 5. Contraste de apoio externo ────────────────────────────────────────────
{
  const co = bloco('contraste');
  const a1 = co.filter(l => l.apoio_externo === 1).sort((a, b) => a.semente - b.semente);
  const a0 = co.filter(l => l.apoio_externo === 0).sort((a, b) => a.semente - b.semente);
  L.push('## 5. Contraste de apoio externo (C0, disponível × indisponível)', '');
  L.push('| Métrica | com apoio | sem apoio | diferença | dz | p (pareado) |', '|---|---|---|---|---|---|');
  for (const m of ['E5_ordem', 'E1_atrib', 'E4_custopol']) {
    const t = ES.tPareado(a1.map(l => v(l, m)), a0.map(l => v(l, m)));
    L.push(`| ${m} | ${n3(ES.media(a1.map(l => v(l, m))))} | ${n3(ES.media(a0.map(l => v(l, m))))} | ${sg(t.dif)} | ${n2(t.dz)} | ${fp(t.p)} |`);
  }
  L.push('', `Com apoio_externo = 0, apoios concedidos: ${a0.reduce((s, l) => s + v(l, 'n_apoios_concedidos'), 0)} (critério de aceitação: nenhum).`, '');
}

// ─── 6. Compromisso E5 × E1 por C_Fusão ───────────────────────────────────────
{
  const fa = bloco('fatorial');
  L.push('## 6. Compromisso E5_ordem × E1_atrib em função de C_Fusão', '');
  L.push('| C_Fusão | E1_atrib | E5_ordem | E6_dispersao | correlação E5 × E1 (entre partidas) |', '|---|---|---|---|---|');
  for (const nivel of [-1, 1]) {
    const ls = fa.filter(l => l.C_Fusao === nivel);
    L.push(`| ${nivel > 0 ? '+1' : '−1'} | ${n3(ES.media(ls.map(l => v(l, 'E1_atrib'))))} | ${n3(ES.media(ls.map(l => v(l, 'E5_ordem'))))} | ${n3(ES.media(ls.map(l => v(l, 'E6_dispersao'))))} | ${n3(ES.correlacao(ls.map(l => v(l, 'E5_ordem')), ls.map(l => v(l, 'E1_atrib'))))} |`);
  }
  L.push('', 'Um compromisso (Desenho §4) apareceria como correlação negativa entre E5 e E1. Com a doutrina fixa do agente, as duas métricas sobem juntas com a fusão; o compromisso só se exprime quando o decisor escolhe onde gastar as ações — isto é, em partidas com humanos ou com doutrinas alternativas.', '');
}

// ─── 7. Desfecho ──────────────────────────────────────────────────────────────
{
  const finais = linhas.filter(l => ['vitoria_azul', 'vitoria_vermelha', 'indecisa'].includes(l.desfecho));
  const outros = linhas.length - finais.length;
  const D = P.DESFECHO;
  const classif = (l, ordem, infra) => (v(l, 'E2_infra') >= infra && v(l, 'E5_ordem') >= ordem && v(l, 'nivel_max') < 3 ? 'vitoria_azul'
    : v(l, 'E2_infra') < D.infraVitoriaVermelha ? 'vitoria_vermelha' : 'indecisa');
  const conf = linhas.filter(l => finais.includes(l)).every(l => classif(l, D.ordemVitoriaAzul, D.infraVitoriaAzul) === l.desfecho);
  L.push('## 7. Sensibilidade do desfecho aos limiares', '');
  const cont = linhas.reduce((a, l) => ({ ...a, [l.desfecho]: (a[l.desfecho] ?? 0) + 1 }), {});
  L.push(`Desfechos no lote: ${Object.entries(cont).map(([k, n]) => `${k} ${n}`).join(', ')}. ${outros} partidas terminaram por N3 ou derrota estratégica e não dependem destes limiares. ` +
    `Reclassificação das ${finais.length} demais (verificada contra o motor: ${conf ? 'idêntica' : 'DIVERGENTE'}) — % de vitória Azul:`, '');
  const ordens = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4], infras = [70, 75, 80, 85, 90];
  L.push(`| infraVitoriaAzul \\ ordemVitoriaAzul | ${ordens.map(o => n2(o)).join(' | ')} |`, `|---|${ordens.map(() => '---').join('|')}|`);
  for (const inf of infras) {
    L.push(`| ${inf} | ${ordens.map(o => { const p = 100 * finais.filter(l => classif(l, o, inf) === 'vitoria_azul').length / finais.length; const s = `${p.toFixed(0)}%`; return o === D.ordemVitoriaAzul && inf === D.infraVitoriaAzul ? `**${s}**` : s; }).join(' | ')} |`);
  }
  const e5 = finais.map(l => v(l, 'E5_ordem')).sort((a, b) => a - b);
  L.push('', `Em negrito, os limiares atuais (${D.infraVitoriaAzul} / ${D.ordemVitoriaAzul}). E5_ordem nas partidas que chegaram ao fim: mediana ${n3(e5[Math.floor(e5.length / 2)])}, máximo ${n3(e5[e5.length - 1])}. ` +
    'Com o limiar de ordem acima do que o modelo produz, "indecisa" domina por construção — os limiares de DESFECHO e a cadeia de repressão (seis etapas) precisam ser calibrados juntos.', '');
}

fs.mkdirSync(path.dirname(relatorio), { recursive: true });
fs.writeFileSync(relatorio, L.join('\n') + '\n', 'utf8');
console.log(`relatório → ${relatorio}`);
