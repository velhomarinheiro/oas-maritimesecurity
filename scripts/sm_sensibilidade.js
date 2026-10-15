'use strict';
/**
 * sm_sensibilidade.js — Roda a análise de sensibilidade da OAS-SM (SM-10) e
 * grava o CSV longo e o relatório em Markdown.
 *
 * Uso:
 *   node scripts/sm_sensibilidade.js                     # 30 réplicas, catálogo inteiro
 *   node scripts/sm_sensibilidade.js --replicas 10 --ids F1,A1,C1
 *   node scripts/sm_sensibilidade.js --params especialista.json   # em torno de valores revisados
 *   node scripts/sm_sensibilidade.js --relatorio docs/sm/resultados/sensibilidade.md
 * Saídas: data/sm/sensibilidade_oas_sm.csv (fora do git) e o relatório.
 */

const fs = require('fs');
const path = require('path');
const { PARAMS } = require('../shared/sm/params');
const { carregarSobrescritas } = require('../shared/sm/sobrescrita');
const S = require('../shared/sm/sensibilidade');

const args = process.argv.slice(2);
const opt = (nome, padrao) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args[i + 1] : padrao; };
const RAIZ = path.join(__dirname, '..');
const replicas = Number(opt('replicas', 30));
const ids = opt('ids', null)?.split(',') ?? null;
const arqParams = opt('params', null);
const params = arqParams ? carregarSobrescritas(path.resolve(arqParams)) : PARAMS;
const csv = path.resolve(opt('saida', path.join(RAIZ, 'data', 'sm', 'sensibilidade_oas_sm.csv')));
const relatorio = path.resolve(opt('relatorio', path.join(RAIZ, 'data', 'sm', 'sensibilidade_oas_sm.md')));

let ultimo = 0;
const r = S.rodarSensibilidade({
  replicas, ids, params,
  progresso: (i, n) => { const p = Math.floor(100 * i / n); if (p >= ultimo + 10) { ultimo = p; process.stderr.write(`  ${p}% (${i}/${n})\n`); } },
});

const f2 = v => (Number.isFinite(v) ? v.toFixed(2).replace('-0.00', '0.00') : '—');
const f3 = v => (Number.isFinite(v) ? v.toFixed(3) : '—');
const fp = p => (p < 0.001 ? '<0,001' : p.toFixed(3).replace('.', ','));
const sinal = v => (v > 0 ? '+' : '');
const virg = s => s.replace(/(\d)\.(\d)/g, '$1,$2');

const L = [];
L.push('# Sensibilidade da OAS-SM — resultados', '');
L.push(`Gerado por \`node scripts/sm_sensibilidade.js --replicas ${replicas}${arqParams ? ` --params ${path.basename(arqParams)}` : ''}\`. ` +
  `${r.entradas.length} parâmetros (ou grupos) × 2 níveis × 2 condições × ${replicas} réplicas ` +
  `(sementes ${r.semente0}–${r.semente0 + replicas - 1}, espelhadas), ${(r.ms / 1000).toFixed(0)} s. ` +
  'Parâmetros de partida: os placeholders de `params.js`' + (arqParams ? ' com as sobrescritas do arquivo indicado' : '') + '.', '');
L.push('- **C0:** todas as capacidades. **C3:** sem C_Fusão. Configuração de pesquisa: jogador único, intermediário, 45 dias, intensidade 0,5.');
L.push('- **Efeito padronizado (d):** (média no nível alto − média no nível baixo) ÷ desvio-padrão da métrica na linha de base C0.');
L.push('- **Níveis:** −30%/+30% (escala, com teto de 1 nas probabilidades e de 100 nas atribuições) ou os valores indicados.', '');

L.push('## Linha de base', '');
L.push('| Métrica | C0 | C3 (sem C_Fusão) | dp em C0 |', '|---|---|---|---|');
for (const m of S.METRICAS) L.push(`| ${m} | ${virg(f3(r.base.C0[m]))} | ${virg(f3(r.base.C3[m]))} | ${virg(f3(r.base.dp[m]))} |`);
L.push('', `Efeito de C_Fusão sobre E1_atrib (C0 − C3) na linha de base: **${virg(f3(r.base.efeitoFusao))}**.`, '');

L.push('## Parâmetros mais influentes (tornado)', '');
for (const [m, c] of [['E1_atrib', 'C0'], ['E1_atrib', 'C3'], ['E2_infra', 'C0'], ['E4_custopol', 'C0'], ['E5_ordem', 'C0'], ['nivel_max', 'C0']]) {
  const rk = S.ranking(r, m, c).slice(0, 6);
  L.push(`**${m} em ${c}** — ${rk.map(x => `${x.id} ${x.rotulo.toLowerCase()} (d = ${virg(sinal(x.padronizado) + f2(x.padronizado))}${x.p < 0.05 ? '' : ', n.s.'})`).join('; ')}.`, '');
}

L.push('## Efeito padronizado por parâmetro (C0)', '');
const cols = ['E1_atrib', 'E2_infra', 'E3_escalada', 'E4_custopol', 'E5_ordem', 'E6_dispersao', 'nivel_max', 'apoio_publico_final'];
L.push(`| Id | Grupo | Parâmetro | ${cols.join(' | ')} |`, `|---|---|---|${cols.map(() => '---').join('|')}|`);
for (const e of r.entradas) {
  const sat = e.saturadas.alto || e.saturadas.baixo ? ` †${e.saturadas.alto || e.saturadas.baixo}/${e.folhas}` : '';
  L.push(`| ${e.id} | ${e.grupo} | ${e.rotulo}${sat} | ${cols.map(m => { const x = e.porCondicao.C0[m]; const t = virg(sinal(x.padronizado) + f2(x.padronizado)); return x.p < 0.05 && Math.abs(x.padronizado) >= 0.2 ? `**${t}**` : t; }).join(' | ')} |`);
}
L.push('', 'Em negrito: p < 0,05 (pareado, sem correção) e |d| ≥ 0,2. † k/n: k das n folhas do grupo batem no teto (1 ou 100) no nível alto, que fica menor que +30%. ' +
  'Há também saturação que a tabela não marca: a fusão é limitada a 1 (e a TETO_FUSAO_SEM_C em C3), de modo que F2 (peso das fontes, que somam 1) só age no nível baixo em C0 e em nenhum nível em C3.', '');

L.push('## Robustez da conclusão principal: o efeito de C_Fusão', '');
L.push('O lote da SM-8 aponta C_Fusão como o fator mais influente sobre E1_atrib. A conclusão é tida como robusta a um parâmetro quando, nos dois níveis, o efeito (C0 − C3) mantém o sinal e ao menos metade da magnitude da linha de base.', '');
const fragil = r.entradas.filter(e => !e.fusao.robusto);
L.push('| Id | Parâmetro | efeito no nível baixo | efeito no nível alto | robusto |', '|---|---|---|---|---|');
for (const e of r.entradas) L.push(`| ${e.id} | ${e.rotulo} | ${virg(f3(e.fusao.baixo))} | ${virg(f3(e.fusao.alto))} | ${e.fusao.robusto ? 'sim' : '**não**'} |`);
L.push('', fragil.length
  ? `A conclusão depende de ${fragil.length} parâmetro(s): ${fragil.map(e => `${e.id} (${e.rotulo.toLowerCase()})`).join(', ')}. São prioridade na revisão de especialistas.`
  : 'A conclusão é robusta a todos os parâmetros do catálogo.', '');

L.push('## Checagem de face (sentido esperado × observado)', '');
L.push('Para cada parâmetro, o sentido em que se espera que as métricas se movam quando ele sobe (hipótese de projeto). Testes pareados com correção de Holm sobre a família inteira.', '');
L.push('| Id | Métrica | Condição | Esperado | Δ observado | p (Holm) | Situação |', '|---|---|---|---|---|---|---|');
const faces = r.entradas.flatMap(e => e.face);
for (const f of faces) {
  L.push(`| ${f.id} | ${f.metrica} | ${f.condicao} | ${f.esperado > 0 ? 'sobe' : 'desce'} | ${virg(sinal(f.dif) + f3(f.dif))} | ${fp(f.pHolm)} | ${f.situacao === 'contraintuitivo' ? '**contraintuitivo**' : f.situacao} |`);
}
const cont = faces.reduce((a, f) => ({ ...a, [f.situacao]: (a[f.situacao] ?? 0) + 1 }), {});
L.push('', `Resumo: ${cont.coerente ?? 0} coerentes, ${cont.nulo ?? 0} sem efeito detectável, ${cont.contraintuitivo ?? 0} contraintuitivos.`, '');
L.push('"Sem efeito detectável" não confirma nem refuta a hipótese: o parâmetro pode estar saturado nesta configuração ou o efeito pode ser menor do que o lote resolve. "Contraintuitivo" pede exame do mecanismo antes de qualquer uso analítico.', '');

const inertes = r.entradas.filter(e => Object.values(e.porCondicao).every(ms => Object.values(ms).every(x => x.dif === 0)));
if (inertes.length) L.push('## Parâmetros inertes nesta configuração', '', inertes.map(e => `- ${e.id} ${e.rotulo} (\`${e.alvo}\`)`).join('\n'), '');

fs.mkdirSync(path.dirname(csv), { recursive: true });
fs.writeFileSync(csv, S.paraCsv(r), 'utf8');
// Resumo por parâmetro (lido pelo questionário de validação de face).
const resumo = r.entradas.map(e => ({
  id: e.id, grupo: e.grupo, rotulo: e.rotulo, alvo: e.alvo, robustoFusao: e.fusao.robusto,
  maxD: Math.max(...Object.values(e.porCondicao).flatMap(ms => Object.entries(ms).filter(([m]) => m.startsWith('E')).map(([, x]) => Math.abs(x.padronizado)))),
  face: e.face.map(f => ({ metrica: f.metrica, situacao: f.situacao })),
}));
fs.writeFileSync(csv.replace(/\.csv$/, '.json'), JSON.stringify({ replicas, entradas: resumo }, null, 1), 'utf8');
fs.mkdirSync(path.dirname(relatorio), { recursive: true });
fs.writeFileSync(relatorio, L.join('\n') + '\n', 'utf8');
console.log(`${r.entradas.length} parâmetros, ${replicas} réplicas em ${(r.ms / 1000).toFixed(1)} s → ${csv}\nrelatório → ${relatorio}`);
