'use strict';
/**
 * test_sm_sensibilidade.js — Testes da análise de sensibilidade (SM-10):
 * perturbação por cópia, tetos, determinismo da varredura e coerência
 * estrutural (o teto de fusão sem C_Fusão só age sem C_Fusão).
 *
 * Uso: node scripts/test_sm_sensibilidade.js
 */

const assert = require('assert');
const { PARAMS: P } = require('../shared/sm/params');
const S = require('../shared/sm/sensibilidade');
const SO = require('../shared/sm/sobrescrita');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}
const porId = id => S.CATALOGO.find(e => e.id === id);

// ─── Catálogo e perturbação ───────────────────────────────────────────────────
{
  ok(new Set(S.CATALOGO.map(e => e.id)).size === S.CATALOGO.length, 'ids do catálogo únicos');
  ok(S.CATALOGO.every(e => S.expandir(e.alvo).length > 0), 'todo alvo do catálogo casa com parâmetros numéricos');
  ok(['fusão', 'atribuição', 'custos'].every(g => S.CATALOGO.filter(e => e.grupo === g).length >= 5),
     'fusão, atribuição e custos cobertos (≥ 5 parâmetros cada)');
  ok(S.CATALOGO.every(e => Object.keys(e.esperado).every(k => k === 'condicao' || S.METRICAS.includes(k))),
     'sentidos esperados só sobre métricas acompanhadas');
  ok(S.expandir('FONTES.*.peso').length === Object.keys(P.FONTES).length, 'expansão de "*"');
  const antes = JSON.stringify(P);
  const alto = S.perturbar(porId('F2'), 'alto');
  ok(Object.keys(P.FONTES).every(f => Math.abs(alto.FONTES[f].peso - 1.3 * P.FONTES[f].peso) < 1e-12), 'escala multiplica todas as folhas do alvo');
  ok(JSON.stringify(P) === antes, 'a perturbação não altera o PARAMS original');
  const e1 = S.perturbar(porId('E1'), 'alto');
  ok(Object.values(e1.P_BASE).every(p => p <= 1) && e1.P_BASE.deteccao === 1, 'teto: probabilidade não passa de 1');
  ok(S.saturacao(porId('E1')).alto === Object.values(P.P_BASE).filter(p => p * 1.3 > 1).length && S.saturacao(porId('E1')).baixo === 0,
     'saturação conta as folhas cortadas pelo teto');
  ok(S.perturbar(porId('D1'), 'baixo').DOUTRINA.acoesPorEstacao === 3, 'nível por valor substitui');
  ok(S.perturbar(porId('A4'), 'alto').GATILHOS_ESCALADA.N1.atribuicaoMin === Math.min(100, P.GATILHOS_ESCALADA.N1.atribuicaoMin * 1.3),
     'curinga no meio do caminho (GATILHOS_ESCALADA.*.atribuicaoMin)');
  const so = SO.aplicarSobrescritas({ DOUTRINA: { acoesPorEstacao: 6 } });
  ok(S.perturbar(porId('A7'), 'alto', so).DOUTRINA.acoesPorEstacao === 6, 'perturba em torno de parâmetros já sobrescritos (revisão de especialista)');
}

// ─── Varredura ────────────────────────────────────────────────────────────────
{
  const spec = { replicas: 3, ids: ['F3', 'A7'] };
  const a = S.rodarSensibilidade(spec), b = S.rodarSensibilidade(spec);
  const sem = r => JSON.stringify({ ...r, ms: 0 });
  ok(sem(a) === sem(b), 'determinismo: a mesma varredura dá o mesmo resultado');
  const f3 = a.entradas.find(e => e.id === 'F3');
  ok(Object.values(f3.porCondicao.C0).every(x => x.dif === 0), 'o teto de fusão sem C_Fusão é inerte com C_Fusão (C0)');
  ok(Object.values(f3.porCondicao.C3).some(x => x.dif !== 0), '…e age sem C_Fusão (C3)');
  ok(a.entradas.every(e => e.face.every(f => ['coerente', 'nulo', 'contraintuitivo'].includes(f.situacao) && f.pHolm >= f.p)),
     'cada teste de face é classificado, com p de Holm ≥ p bruto');
  ok(Number.isFinite(a.base.efeitoFusao) && a.entradas.every(e => typeof e.fusao.robusto === 'boolean'), 'robustez do efeito de C_Fusão calculada');
  const csv = S.paraCsv(a).trim().split('\n');
  ok(csv.length === 1 + spec.ids.length * Object.keys(S.CONDICOES).length * S.METRICAS.length, 'CSV longo: entrada × condição × métrica');
  ok(S.ranking(a, 'E1_atrib').length === spec.ids.length, 'ranking por métrica');
}

console.log(`\nSM-10 (sensibilidade): ${pass} verificações — ALL PASS`);
