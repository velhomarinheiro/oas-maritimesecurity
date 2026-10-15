'use strict';
/**
 * test_sm_oob.js — Testes da Fase SM-6 (OOB estendida, interruptores de fator
 * e escalões de prontidão).
 *
 * Critérios de aceitação cobertos (Conceito v1.6 §13; Desenho v1.3 §8):
 *   - ativar/desativar um fator altera apenas as unidades previstas no OOB;
 *   - prazos de prontidão em turnos (SAR imediato, FPE ≤ 24 h, demais 48 h).
 *
 * Uso: node scripts/test_sm_oob.js
 */

const assert = require('assert');
const { PARAMS: P } = require('../shared/sm/params');
const O  = require('../shared/sm/oob_sm');
const CA = require('../shared/sm/campaign');
const EN = require('../shared/sm/encounter');
const { ORDER_OF_BATTLE } = require('../shared/order_of_battle');
const { getTerrain, T_LAND } = require('../shared/board');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}
function eq(a, b, msg) {
  assert.deepStrictEqual(a, b, `${msg} — esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
  console.log('✅ ' + msg);
  pass++;
}
const TODOS = Object.fromEntries(P.FATORES_SM.map(f => [f, 1]));
const oobDe = cfg => O.montarOOB(CA.configurarCampanha({ seed: 1, ...cfg }));

// ─── Composição ──────────────────────────────────────────────────────────────
{
  const az = O.meiosAzuis();
  ok(new Set(az.map(m => m.id)).size === az.length, 'IDs únicos na OOB Azul');
  ok(az.every(m => P.ESTACOES.some(e => e.id === m.estacao)), 'todo meio pertence a uma estação de C2');
  ok(P.FATORES_SM.every(f => az.some(m => m.fator === f)), 'cada fator A–E tem meios na OOB (Tabela 10.3)');
  ok(az.every(m => m.fator === null || P.FATORES_SM.includes(m.fator)), 'cada meio tem no máximo um fator, e válido');
  ok(az.filter(m => m.category === 'surface' || m.category === 'submarine').every(m => getTerrain(m.col, m.row) !== T_LAND),
     'navios começam em hexágono navegável');
  ok(['Com2ºDN', 'Com1ºDN', 'Com8ºDN', 'Com5ºDN'].every(est => az.some(m => m.estacao === est && m.type === 'inspecao_naval')),
     'cada Distrito Naval tem meio de inspeção naval');
  ok(az.filter(m => m.estacao === 'Com1ºDN' && m.type === 'mcm').length === 3, '1º DN com MCM (2 Aratu + Amorim do Valle)');
  eq(az.filter(m => m.type === 'patrulha_oc').map(m => m.nome), ['NPaOc Amazonas', 'NPaOc Apa', 'NPaOc Araguari'],
     'NPaOc Classe Amazonas P120–P122 no conjunto do COMPAAz');
  ok(az.filter(m => m.type === 'patrulha_c' || m.type === 'patrulha_oc').every(m => m.fator === 'B_NPaOc'),
     'B_NPaOc reúne NPaOc e NPa (Tabela 10.3)');
  ok(['inspecao_naval', 'mcm', 'usv', 'uav', 'rov'].every(t => P.CAPACIDADE_POR_TIPO[t]),
     'os tipos de MarSec têm capacidade no motor de encontro');
}

// ─── Interruptores de fator ──────────────────────────────────────────────────
{
  const cheia = O.aplicarFatores(O.meiosAzuis(), TODOS);
  eq(cheia.length, O.meiosAzuis().length, 'todos os fatores ligados ⇒ OOB completa');
  for (const f of P.FATORES_SM) {
    const sem = O.aplicarFatores(O.meiosAzuis(), { ...TODOS, [f]: -1 });
    const removidos = cheia.filter(m => !sem.some(s => s.id === m.id));
    ok(removidos.length > 0 && removidos.every(m => m.fator === f), `${f} desligado retira só os meios de ${f} (${removidos.length})`);
    eq(sem, cheia.filter(m => m.fator !== f), `${f} desligado: os demais meios ficam idênticos`);
  }
  const nenhum = O.aplicarFatores(O.meiosAzuis(), Object.fromEntries(P.FATORES_SM.map(f => [f, -1])));
  ok(nenhum.every(m => m.fator === null) && nenhum.length > 0, 'C0 vazio de fatores: restam só os meios sem fator (Esquadra, inspeção, MCM)');
  ok((() => { try { O.aplicarFatores([], { Z_X: 1 }); return false; } catch { return true; } })(), 'fator desconhecido é recusado');
}
{
  const c = oobDe({});
  ok(O.cFusaoAtiva(c.azul) && !O.cFusaoAtiva(oobDe({ fatores: { C_Fusao: -1 } }).azul), 'C_Fusao liga o centro de fusão (cFusao do barramento)');
  const comGvi = O.unidadeParaEncontro(c.azul.find(m => m.id === '1DN-NPA-1'), c.azul);
  const semOob = oobDe({ fatores: { E_GVI: -1 } }).azul;
  const semGvi = O.unidadeParaEncontro(semOob.find(m => m.id === '1DN-NPA-1'), semOob);
  ok(Math.abs(semGvi.capSM.gvi - comGvi.capSM.gvi * P.FATOR_SEM_GVI) < 1e-12 && semGvi.capSM.sensor === comGvi.capSM.sensor,
     'sem E_GVI a abordagem dos navios da estação cai a FATOR_SEM_GVI; o sensor não muda');
  ok(EN.probabilidadeEtapa('abordagem', semGvi, {}, 1) < EN.probabilidadeEtapa('abordagem', comGvi, {}, 1),
     'sem GptFN embarcado, abordar é menos provável');
  ok(!oobDe({ fatores: { A_MPA: -1 } }).azul.some(m => m.type === 'patrulha'), 'A_MPA desligado ⇒ sem aviação de patrulha');
  ok(CA.iniciarCampanha({ seed: 1, fatores: { A_MPA: -1 } }).apoio.mpaOrganica === false, '…e o COMPAAz não tem MPA a pedir à FAB');
}

// ─── Alocação dos NPaOc pelo COMPAAz ─────────────────────────────────────────
{
  const c = oobDe({});
  const npaoc = c.azul.filter(m => m.type === 'patrulha_oc');
  eq(npaoc.map(m => m.estacao), ['Com2ºDN', 'Com1ºDN', 'Com8ºDN'], 'NPaOc alocados às áreas ativas, na ordem de prioridade (5º DN sazonal)');
  ok(npaoc.every(m => m.col === O.BASES[m.estacao].col && m.row === O.BASES[m.estacao].row && m.alocadoPor === 'COMPAAz'),
     'o NPaOc alocado parte da base do DN');
  const p = O.montarOOB(CA.configurarCampanha({ seed: 1 }), { prioridadeNPaOc: ['5DN', '1DN', '8DN', '2DN'] }).azul.filter(m => m.type === 'patrulha_oc');
  eq(p.map(m => m.estacao), ['Com5ºDN', 'Com1ºDN', 'Com8ºDN'], 'a prioridade do COMPAAz decide a concentração');
  const so1 = oobDe({ areasAtivas: ['1DN'] }).azul.filter(m => m.type === 'patrulha_oc');
  eq(so1.map(m => m.estacao), ['Com1ºDN', 'COMPAAz', 'COMPAAz'], 'com uma área ativa, os NPaOc excedentes ficam com o COMPAAz');
}

// ─── Vermelho e infraestrutura ───────────────────────────────────────────────
{
  const c = oobDe({});
  eq(c.vermelho.reservaEstrategica, ORDER_OF_BATTLE.forces.red.map(r => r.id), 'reserva estratégica = força Vermelha do jogo base (só em N3)');
  ok(c.vermelho.reservaEstrategica.includes('RED-GBPA'), 'o KCV Aurelius Magnus está na reserva estratégica');
  ok(c.vermelho.proxies.every(p => P.VETORES_HIBRIDOS[p.vetor]) && c.vermelho.proxies.length === O.PROXIES_VERMELHOS.length,
     'proxies Vermelhos por vetor da Tabela 4.1');
  eq(oobDe({ vetoresHibridos: ['frota_sombra'] }).vermelho.proxies.map(p => p.vetor), ['frota_sombra', 'frota_sombra'],
     'só os vetores ativos no configurador trazem proxies');
  eq(oobDe({ trilhas: { defesa: false } }).vermelho.proxies, [], 'sem trilha de defesa, sem proxies');
  ok(c.infraestrutura.filter(i => i.tipo === 'fpso').length === 5 && c.infraestrutura.some(i => i.tipo === 'cabo') && c.infraestrutura.some(i => i.tipo === 'duto'),
     'infraestrutura: cinco FPSOs, cabos e dutos');
  const meia = oobDe({ forcaInicial: { plataformas: 0.5, portos: 1 } }).infraestrutura;
  ok(meia.filter(i => i.tipo === 'fpso').every(i => i.sp === Math.round(i.spMax * 0.5)) &&
     meia.filter(i => i.tipo === 'porto').every(i => i.sp === i.spMax), 'força inicial do configurador escala só o tipo indicado');
  eq(O.montarOOB(CA.configurarCampanha({ seed: 3 })), O.montarOOB(CA.configurarCampanha({ seed: 3 })), 'OOB reproduzível pela configuração');
}

// ─── Prontidão ───────────────────────────────────────────────────────────────
{
  const c = oobDe({});
  const d = O.designarProntidao(c.azul);
  const conta = (est, esc) => c.azul.filter(m => m.estacao === est && d[m.id].escalao === esc).length;
  ok(['ComemCh', 'Com2ºDN', 'Com1ºDN', 'Com8ºDN', 'Com5ºDN'].every(est => conta(est, 'sar') === 1), '1 Navio SAR por estação (DN e Esquadra)');
  ok(['Com2ºDN', 'Com1ºDN', 'Com8ºDN', 'Com5ºDN'].every(est => conta(est, 'fpe') === 2) && conta('ComemCh', 'fpe') === 3,
     'FPE: 2 por DN, 3 na Esquadra');
  ok(c.azul.filter(m => d[m.id].escalao === 'sar').every(m => m.sar), 'só meio apto é Navio SAR');
  ok(c.azul.filter(m => ['patrulha', 'uav', 'usv', 'rov', 'gvi', 'centro_fusao'].includes(m.type)).every(m => d[m.id].escalao === null),
     'aeronaves, não tripulados, GptFN e o centro de fusão ficam fora dos escalões');
  ok(Object.entries(d).every(([, x]) => x.escalao === null || x.atraso === P.PRONTIDAO[x.escalao].atraso), 'atraso de cada meio = o do seu escalão');
  eq([P.PRONTIDAO.sar.atraso, P.PRONTIDAO.fpe.atraso, P.PRONTIDAO.demais.atraso], [0, 1, 2], 'prazos em turnos de 24 h: imediato, ≤ 24 h, 48 h');

  const sar = c.azul.find(m => d[m.id].escalao === 'sar' && m.estacao === 'Com1ºDN').id;
  const fpe = c.azul.find(m => d[m.id].escalao === 'fpe' && m.estacao === 'Com1ºDN').id;
  const dem = c.azul.find(m => d[m.id].escalao === 'demais' && m.estacao === 'Com1ºDN').id;
  let e = O.criarEstadoProntidao(c.azul);
  ok(!O.podeMover(e, sar, 10), 'sem acionamento nenhum meio move');
  for (const id of [sar, fpe, dem]) e = O.acionar(e, id, 10);
  eq([sar, fpe, dem].map(id => [O.podeMover(e, id, 10), O.podeMover(e, id, 11), O.podeMover(e, id, 12)]),
     [[true, true, true], [false, true, true], [false, false, true]],
     'acionados no turno 10: SAR move no 10, FPE no 11, demais no 12');
  eq(O.acionar(e, dem, 11), e, 'novo acionamento não reinicia o prazo');
  ok((() => { try { O.acionar(e, 'X', 1); return false; } catch { return true; } })(), 'acionar meio inexistente é recusado');
}
{
  // Fator altera a OOB; a prontidão é derivada dela e se redistribui.
  const sem = oobDe({ fatores: { B_NPaOc: -1 } });
  const d = O.designarProntidao(sem.azul);
  ok(['Com2ºDN', 'Com1ºDN', 'Com8ºDN', 'Com5ºDN'].every(est => sem.azul.filter(m => m.estacao === est && d[m.id].escalao === 'sar').length === 1),
     'sem B_NPaOc cada DN ainda designa um Navio SAR (inspeção naval)');
  ok(sem.azul.every(m => m.type !== 'patrulha_c' && m.type !== 'patrulha_oc'), 'sem B_NPaOc, sem navios-patrulha');
}

console.log(`\nSM-6: ${pass} verificações — ALL PASS`);
