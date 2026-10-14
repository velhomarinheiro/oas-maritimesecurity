'use strict';
/**
 * test_constructive.js — Testes do simulador construtivo (PBC).
 *
 * Cobre as invariantes que fazem o dataset valer alguma coisa: custos e
 * remoção de unidades por fator, cobertura da taxonomia, semântica das
 * métricas, delineamento experimental, reprodutibilidade por semente e
 * estabilidade do motor ao longo de muitas partidas no mesmo processo.
 *
 * Uso: node scripts/test_constructive.js
 */

const assert = require('assert');
const { ORDER_OF_BATTLE } = require('../shared/order_of_battle');
const CF   = require('../shared/capability_factors');
const TAX  = require('../shared/force_taxonomy');
const M    = require('../shared/metrics');
const COND = require('../shared/conditions');
const SIM  = require('../shared/constructive_sim');
const ENGINE = require('../server');

SIM.useEngine(ENGINE);

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

// ─── Fatores de capacidade ───────────────────────────────────────────────────
const TODAS = Object.fromEntries(CF.FACTOR_KEYS.map(k => [k, 1]));
eq(CF.totalCost(TODAS), 248, 'custo com as 5 capacidades = 248 EAC');
eq(CF.countActive(TODAS), 5, 'contagem de capacidades ativas');
eq(CF.totalCost(Object.fromEntries(CF.FACTOR_KEYS.map(k => [k, -1]))), 0, 'custo sem capacidade alguma = 0');

// Retirar um fator retira suas unidades e também os dependentes que o motor
// afundaria junto com elas (server.js: a morte do hospedeiro mata aeronaves
// embarcadas e forças especiais hospedadas). Sem isso o pacote entraria em
// campo com referências penduradas — e com uma unidade que a regra de combate
// não deixaria existir. Ex.: sem os SSK não há como a equipe de OpEsp operar.
const obBase = ORDER_OF_BATTLE.forces.blue.length;
const dependentesDe = ids => ORDER_OF_BATTLE.forces.blue
  .filter(u => ids.includes(u.hostId) || ids.includes(u.embarked)).map(u => u.id);
for (const key of CF.FACTOR_KEYS) {
  const ids = CF.CAPABILITY_FACTORS[key].unitIds;
  const ob  = CF.applyCapabilityConfig(ORDER_OF_BATTLE, { ...TODAS, [key]: -1 });
  const dep = dependentesDe(ids);
  eq(ob.forces.blue.length, obBase - ids.length - dep.length,
    `desligar ${key} retira ${ids.length} unidade(s)${dep.length ? ` + ${dep.length} dependente(s)` : ''} da OB azul`);
  ok([...ids, ...dep].every(id => !ob.forces.blue.some(u => u.id === id)),
    `  unidades de ${key} e seus dependentes ausentes da OB resultante`);
  const vivos = new Set(ob.forces.blue.map(u => u.id));
  ok(ob.forces.blue.every(u => (!u.hostId || vivos.has(u.hostId)) && (!u.embarked || vivos.has(u.embarked))),
    `  OB sem ${key} não tem dependente órfão`);
}
eq(dependentesDe(CF.CAPABILITY_FACTORS.B_SSK.unitIds), ['BLUE-SEOP'],
  'a equipe de OpEsp azul depende dos SSK (é o seu meio de inserção)');
ok(CF.applyCapabilityConfig(ORDER_OF_BATTLE, TODAS).forces.red.length === ORDER_OF_BATTLE.forces.red.length,
  'a força Vermelha nunca é alterada pelos fatores');
const antesOB = JSON.stringify(ORDER_OF_BATTLE);
CF.applyCapabilityConfig(ORDER_OF_BATTLE, { ...TODAS, A_SSN: -1 });
eq(JSON.stringify(ORDER_OF_BATTLE), antesOB, 'applyCapabilityConfig não muta a OB original');

// ─── Taxonomia ───────────────────────────────────────────────────────────────
const todosIds = [...ORDER_OF_BATTLE.forces.blue, ...ORDER_OF_BATTLE.forces.red].map(u => u.id);
ok(todosIds.every(id => !!TAX.classifyUnit(id, id.startsWith('BLUE') ? 'blue' : 'red').sigla),
  'toda unidade da OB classifica em algum grupo de capacidade');
eq(TAX.classifyUnit('BLUE-FPSO1', 'blue').sigla, 'INFRA', 'ativo protegido cai em INFRA (fallback)');
eq(TAX.classifyUnit('BLUE-SAG-P', 'blue').sigla, 'INTERV', 'decisão de cenário preservada: SAG-P em INTERV');
eq(TAX.classifyUnit('RED-GE-1', 'red').sigla, 'INTERV', 'decisão de cenário preservada: ESCCSG em INTERV');

// ─── Métricas ────────────────────────────────────────────────────────────────
const st = ENGINE.newGame(undefined, { seed: 1 });
eq(M.attrition(st, 'red'), 0, 'atrito inicial é zero');
eq(M.redForceCombatIneffective(st), 0, 'no início o Vermelho é combativo');
ok(M.offensiveStock(st, 'red') > 0, 'estoque ofensivo Vermelho inicial > 0');
ok(M.slocSecurityIndex(st) === 1, 'índice SLOC inicial = 1 (portos intactos)');

const alvo = st.units.find(u => u.id === 'RED-GE-3');
alvo.hp -= 3;
eq(M.attrition(st, 'red'), 3, 'atrito acompanha a perda de SP');

// hasOffensiveMeans: interceptador puro não conta como meio ofensivo
ok(!M.hasOffensiveMeans({ weapons: {}, capabilities: { airDefense: 6, bmd: 2 } }),
  'bateria só de interceptação não conta como meio ofensivo');
ok(M.hasOffensiveMeans({ weapons: {}, capabilities: { asw: 2 } }), 'capacidade ASW conta como ofensiva');
ok(M.hasOffensiveMeans({ weapons: { mss: { quantity: 1 } }, capabilities: {} }), 'arma com estoque conta');
ok(!M.hasOffensiveMeans({ weapons: { mss: { quantity: 0 } }, capabilities: {} }), 'arma esgotada não conta');

// Pesos ofensivos derivados das tabelas d6 deste projeto
ok(M.weaponOffensiveWeight('airDefense') === 0, 'interceptador tem peso ofensivo zero');
ok(M.weaponOffensiveWeight('ascm') > M.weaponOffensiveWeight('navalGun'),
  'ASCM pesa mais que canhão no estoque ofensivo');

// Vermelho sem meios ofensivos → kcv = 1
const st2 = ENGINE.newGame(undefined, { seed: 2 });
for (const u of st2.units.filter(x => x.team === 'red')) {
  for (const w of Object.values(u.weapons || {})) w.quantity = 0;
  u.capabilities = { airDefense: 4 };
}
eq(M.redForceCombatIneffective(st2), 1, 'Vermelho sem armas nem capacidade ofensiva → E1_kcv = 1');

// Grupos: chaves só para grupos presentes
const g = M.groupLossMetrics(st);
ok(Object.keys(g).every(k => /^grp_(blue|red)_[A-Z]+$/.test(k)), 'chaves de grupo no formato grp_<lado>_<SIGLA>');
ok(Object.values(g).every(v => v >= 0 && v <= 100), 'perda por grupo fica em [0,100]%');
const semSub = ENGINE.newGame(CF.applyCapabilityConfig(ORDER_OF_BATTLE, { ...TODAS, A_SSN: -1, B_SSK: -1 }), { seed: 3 });
ok(!('grp_blue_DISS' in M.groupLossMetrics(semSub)), 'grupo ausente da força não gera chave');

// ─── Delineamento ────────────────────────────────────────────────────────────
eq(COND.FACTORIAL_CONDITIONS.length, 32, 'fatorial 2^5 tem 32 condições');
eq(COND.ABLATION_CONDITIONS.length, 6, 'ablação tem C0 + 5 condições');
eq(COND.ABLATION_CONDITIONS[0].custo_total, 248, 'C0 custa 248 (linha de base)');
ok(COND.ABLATION_CONDITIONS.slice(1).every(c => c.n_capacidades === 4),
  'cada condição de ablação retira exatamente uma capacidade');
const assinaturas = new Set(COND.FACTORIAL_CONDITIONS.map(c => JSON.stringify(c.factors)));
eq(assinaturas.size, 32, 'as 32 condições do fatorial são todas distintas');
ok(COND.FACTORIAL_CONDITIONS.every(c => c.seeds.length === 20), 'fatorial: 20 réplicas por condição');

// ─── Reprodutibilidade ───────────────────────────────────────────────────────
const r1 = SIM.runGame(TODAS, 4242, 8);
const r2 = SIM.runGame(TODAS, 4242, 8);
const r3 = SIM.runGame(TODAS, 9999, 8);
eq(JSON.stringify(r1), JSON.stringify(r2), 'mesma semente → partida idêntica');
ok(JSON.stringify(r1) !== JSON.stringify(r3), 'sementes distintas → partidas distintas');

// O motor não pode acumular estado entre partidas no mesmo processo: se a OB
// global fosse corrompida, esta repetição divergiria da primeira execução.
const obAntes = JSON.stringify(ORDER_OF_BATTLE);
for (let i = 0; i < 25; i++) SIM.runGame(TODAS, 5000 + i, 6);
eq(JSON.stringify(ORDER_OF_BATTLE), obAntes, 'ORDER_OF_BATTLE intacta após 25 partidas');
eq(JSON.stringify(SIM.runGame(TODAS, 4242, 8)), JSON.stringify(r1),
  'partida com a mesma semente continua idêntica após 25 outras no mesmo processo');

// ─── Regra de vitória (opção de cenário) ─────────────────────────────────────
// Padrão: objetivos do cenário — comportamento histórico, inalterado.
eq(ENGINE.newGame().victoryRule, 'objectives', 'sem opção, a regra é a de objetivos');
eq(ENGINE.newGame(undefined, { victoryRule: 'exhaustion' }).victoryRule, 'exhaustion', 'regra de exaustão é aceita');
eq(ENGINE.newGame(undefined, { victoryRule: 'bogus' }).victoryRule, 'objectives', 'valor inválido cai no padrão');

// Exaustão: um lado sem meios ofensivos entrega a vitória ao outro.
function semMeios(state, team) {
  for (const u of state.units.filter(x => x.team === team)) {
    for (const w of Object.values(u.weapons || {})) w.quantity = 0;
    u.capabilities = { airDefense: 4 };   // só interceptação
  }
}
const stEx = ENGINE.newGame(undefined, { seed: 7, victoryRule: 'exhaustion' });
eq(ENGINE.checkWinner(stEx), null, 'exaustão: no início ninguém venceu');
semMeios(stEx, 'red');
eq(ENGINE.checkWinner(stEx), 'blue', 'exaustão: Vermelho sem meios ofensivos → Azul vence');

const stEx2 = ENGINE.newGame(undefined, { seed: 8, victoryRule: 'exhaustion' });
semMeios(stEx2, 'blue');
eq(ENGINE.checkWinner(stEx2), 'red', 'exaustão: Azul sem meios ofensivos → Vermelho vence');

const stEx3 = ENGINE.newGame(undefined, { seed: 9, victoryRule: 'exhaustion' });
semMeios(stEx3, 'blue'); semMeios(stEx3, 'red');
eq(ENGINE.checkWinner(stEx3), 'blue', 'exaustão mútua → empate para Azul (convenção da plataforma)');

// A mesma situação sob a regra de objetivos NÃO decide a partida: as duas
// regras são de fato distintas, e não um rótulo sobre o mesmo comportamento.
const stObj = ENGINE.newGame(undefined, { seed: 7 });
semMeios(stObj, 'red');
eq(ENGINE.checkWinner(stObj), null, 'objetivos: ficar sem meios ofensivos não decide a partida');

// Estoque ofensivo remanescente (base da adjudicação por tempo sob exaustão)
const stR = ENGINE.newGame(undefined, { seed: 11 });
ok(Math.abs(M.offensiveStockRatio(stR, 'red') - 1) < 1e-9, 'no início, o lado retém 100% do potencial ofensivo');
semMeios(stR, 'red');
eq(M.offensiveStockRatio(stR, 'red'), 0, 'sem armas nem capacidade ofensiva, a fração é 0');

// Efeito no lote: sob exaustão a métrica E1_kcv volta a discriminar.
const loteObj = SIM.runBatch({ factors: TODAS, replicas: 4, maxTurns: 20, victoryRule: 'objectives' });
const loteExa = SIM.runBatch({ factors: TODAS, replicas: 4, maxTurns: 20, victoryRule: 'exhaustion' });
eq(loteObj.victoryRule, 'objectives', 'o lote registra a regra usada (objetivos)');
eq(loteExa.victoryRule, 'exhaustion', 'o lote registra a regra usada (exaustão)');
ok(loteObj.rows.every(r => r.regra_vitoria === 'objectives'), 'cada partida carrega a regra no seu registro');
const turnosObj = loteObj.rows.reduce((a, r) => a + r.turnos, 0) / loteObj.rows.length;
const turnosExa = loteExa.rows.reduce((a, r) => a + r.turnos, 0) / loteExa.rows.length;
ok(turnosExa > turnosObj, `exaustão alonga as partidas (${turnosExa.toFixed(1)} vs ${turnosObj.toFixed(1)} turnos)`);
ok(SIM.toCsv(loteExa.rows).split('\n')[0].includes('regra_vitoria'), 'CSV traz a coluna regra_vitoria');

// ─── Quantidades e composição da Força Vermelha ──────────────────────────────
// A quantidade é o estado do fator: 0 retira, 1 é a ordem de batalha, N>1
// acrescenta cópias. O que precisa valer: custo proporcional, OB de origem
// intocada, dependentes (aeronaves embarcadas, opesp hospedados) acompanhando
// a cópia do hospedeiro, e objetivos que não se cumprem por duplicata.
eq(CF.MAX_QUANTITY, 4, 'teto de quantidade por fator/grupo');
eq(CF.quantityOf(undefined), 1, 'quantidade ausente = 1 (ordem de batalha)');
eq(CF.quantityOf(true), 1, 'legado true = 1');
eq(CF.quantityOf(false), 0, 'legado false = 0');
eq(CF.quantityOf(-1), 0, 'legado -1 (capacidade ausente) = 0');
eq(CF.quantityOf(99), CF.MAX_QUANTITY, 'quantidade acima do teto é limitada');
eq(CF.quantityOf(2.4), 2, 'quantidade fracionária é arredondada');
eq(CF.baseUnitId('BLUE-SUB-N~3'), 'BLUE-SUB-N', 'o id base ignora o sufixo de cópia');
eq(CF.baseUnitId('BLUE-SUB-N'), 'BLUE-SUB-N', 'id sem sufixo é o próprio id base');

const dobro = { ...TODAS, A_SSN: 2 };
eq(CF.totalCost(dobro), 248 + CF.CAPABILITY_FACTORS.A_SSN.cost, 'duplicar um fator soma outro custo dele');
eq(CF.countActive(dobro), 5, 'duplicar não muda a contagem de capacidades presentes');

// Quantidade 1 em tudo tem de devolver exatamente a ordem de batalha original.
const neutro = CF.applyForceConfig(ORDER_OF_BATTLE, {
  factors: TODAS,
  redGroups: Object.fromEntries(CF.RED_GROUP_KEYS.map(k => [k, 1])),
});
eq(neutro.forces.blue.map(u => u.id), ORDER_OF_BATTLE.forces.blue.map(u => u.id),
  'quantidade 1 preserva a Força Azul da OB');
eq(neutro.forces.red.map(u => u.id), ORDER_OF_BATTLE.forces.red.map(u => u.id),
  'quantidade 1 preserva a Força Vermelha da OB');

// A OB global é compartilhada pelo servidor: compor força nunca pode mutá-la.
const antesBlue = ORDER_OF_BATTLE.forces.blue.length;
const antesRed  = ORDER_OF_BATTLE.forces.red.length;
const reforcado = CF.applyForceConfig(ORDER_OF_BATTLE, { factors: dobro, redGroups: { INTERV: 2 } });
eq(ORDER_OF_BATTLE.forces.blue.length, antesBlue, 'compor força não altera a OB global (Azul)');
eq(ORDER_OF_BATTLE.forces.red.length, antesRed, 'compor força não altera a OB global (Vermelha)');

const ssn = CF.CAPABILITY_FACTORS.A_SSN.unitIds;
const copiasSsn = reforcado.forces.blue.filter(u => ssn.includes(CF.baseUnitId(u.id)));
eq(copiasSsn.length, ssn.length * 2, 'A_SSN×2 coloca duas vezes as unidades do fator em campo');
ok(copiasSsn.some(u => u.id.includes('~2')), 'a cópia recebe sufixo próprio de id');
eq(new Set(reforcado.forces.blue.map(u => u.id)).size, reforcado.forces.blue.length,
  'não há ids duplicados após a expansão');

// Dependentes: um segundo porta-aviões chega com a ala aérea repontada.
const anf = reforcado.forces.red.filter(u => u.id.includes('~2'));
ok(anf.length > CF.RED_GROUPS.INTERV.unitIds.length,
  'duplicar INTERV leva junto os dependentes (aeronaves embarcadas)');
const hostes = new Set(reforcado.forces.red.map(u => u.id));
ok(reforcado.forces.red.every(u => !u.hostId || hostes.has(u.hostId)),
  'nenhum dependente aponta para hospedeiro inexistente');
ok(reforcado.forces.red.every(u => !u.embarked || hostes.has(u.embarked)),
  'toda aeronave embarcada aponta para um navio presente');

// Zerar um grupo tem de levar os dependentes embora — não deixa aeronave órfã.
const semInterv = CF.applyForceConfig(ORDER_OF_BATTLE, { redGroups: { INTERV: 0 } });
ok(semInterv.forces.red.length < antesRed, 'INTERV=0 reduz a Força Vermelha');
ok(semInterv.forces.red.every(u => TAX.classifyUnit(u.id, 'red').sigla !== 'INTERV'),
  'nenhuma unidade do grupo zerado sobrevive');
const idsSem = new Set(semInterv.forces.red.map(u => u.id));
ok(semInterv.forces.red.every(u => (!u.hostId || idsSem.has(u.hostId)) && (!u.embarked || idsSem.has(u.embarked))),
  'zerar um grupo não deixa dependente órfão');
// O corte atravessa grupos quando a dependência atravessa: sem porta-aviões,
// a ala aérea embarcada nele também sai, ainda que pertença a DAE/PATMAR.
ok(!semInterv.forces.red.some(u => u.embarked === 'RED-GBPA'),
  'sem o porta-aviões, sua ala aérea não entra em campo');

// A taxonomia precisa reconhecer a cópia como sendo do mesmo grupo.
const umId = ssn[0];
eq(TAX.classifyUnit(umId + '~2', 'blue').sigla, TAX.classifyUnit(umId, 'blue').sigla,
  'a cópia é classificada no mesmo grupo de capacidade do original');

// Aritmética do efetivo: é o número que a tela do simulador mostra ao usuário,
// e o que torna a cascata visível (INTERV×2 traz 8 unidades, não 2).
const efetivo = cfg => CF.applyForceConfig(ORDER_OF_BATTLE, cfg);
eq(efetivo({}).forces.red.length, ORDER_OF_BATTLE.forces.red.length,
  'sem composição, o efetivo Vermelho é o da OB');
eq(efetivo({ redGroups: { INTERV: 2 } }).forces.red.length - ORDER_OF_BATTLE.forces.red.length, 8,
  'INTERV×2 traz 8 unidades (navios do grupo + ala aérea + OpEsp hospedada)');
eq(ORDER_OF_BATTLE.forces.red.length - efetivo({ redGroups: { LOG: 0 } }).forces.red.length, 3,
  'LOG×0 retira as 3 unidades logísticas, que não têm dependentes');
eq(efetivo({ factors: { A_SSN: 2, B_SSK: 0 } }).forces.blue.length,
   ORDER_OF_BATTLE.forces.blue.length + 1 - 3 - 1,
  'A_SSN×2 com B_SSK×0: +1 SSN, −3 SSK e −1 OpEsp dependente');

// Sem alteração, a composição Vermelha se descreve como padrão.
eq(CF.describeRedConfig({}), 'padrão', 'composição Vermelha sem alteração é "padrão"');
ok(CF.describeRedConfig({ INTERV: 2 }).includes('INTERV'), 'composição alterada é descrita por grupo');

// Lote com quantidades e Vermelho alterado: o registro carrega a configuração.
const loteQtd = SIM.runBatch({
  factors: dobro, redGroups: { INTERV: 2 }, replicas: 2, maxTurns: 6, nome: 'Reforçado',
});
eq(loteQtd.porCondicao[0].custo_total, CF.totalCost(dobro), 'o custo do lote segue a quantidade');
ok(loteQtd.rows.every(r => r.forca_vermelha && r.forca_vermelha.includes('INTERV')),
  'cada partida registra a composição Vermelha usada');
ok(loteQtd.forcaVermelha.includes('INTERV'), 'o resultado do lote expõe a composição Vermelha');
ok(SIM.toCsv(loteQtd.rows).split('\n')[0].includes('forca_vermelha'), 'CSV traz a coluna forca_vermelha');

// Sinal de validade: reforçar a Força Azul contra a MESMA ameaça tem de
// melhorar o desfecho, senão a quantidade não informa planejamento nenhum.
// Qual medida responde depende da regra de vitória, e isso não é defeito:
//  · objetivos — a partida termina em poucos turnos, e E1_atrito é a foto do
//    fim; reforçar encurta a partida, então E1 satura. O que responde é a
//    própria economia de força (atrito_azul) e o tempo até a decisão.
//  · exaustão — a partida vai até a incapacitação; aí E1 e E1_kcv respondem.
const DOBRO = Object.fromEntries(CF.FACTOR_KEYS.map(k => [k, 2]));
const turnoMedio = r => r.rows.reduce((a, x) => a + x.turnos, 0) / r.rows.length;

const objBase = SIM.runBatch({ factors: TODAS, replicas: 12, maxTurns: 12 });
const objMais = SIM.runBatch({ factors: DOBRO, replicas: 12, maxTurns: 12 });
ok(objMais.porCondicao[0].resumo.atrito_azul.media < objBase.porCondicao[0].resumo.atrito_azul.media,
  'objetivos: reforçar a Força Azul reduz o atrito sofrido por ela');
ok(turnoMedio(objMais) < turnoMedio(objBase),
  `objetivos: reforçar encurta o caminho até a decisão (${turnoMedio(objMais).toFixed(1)} vs ${turnoMedio(objBase).toFixed(1)} turnos)`);

const exaBase = SIM.runBatch({ factors: TODAS, replicas: 12, maxTurns: 30, victoryRule: 'exhaustion' });
const exaMais = SIM.runBatch({ factors: DOBRO, replicas: 12, maxTurns: 30, victoryRule: 'exhaustion' });
ok(exaMais.porCondicao[0].resumo.E1_atrito.media > exaBase.porCondicao[0].resumo.E1_atrito.media,
  'exaustão: reforçar a Força Azul aumenta o atrito imposto ao Vermelho');
ok(exaMais.porCondicao[0].resumo.atrito_azul.media < exaBase.porCondicao[0].resumo.atrito_azul.media,
  'exaustão: reforçar a Força Azul reduz o atrito sofrido por ela');

// E reduzir a ameaça, a Força Azul fixa, tem de puxar na direção oposta.
const redFraco = SIM.runBatch({ factors: TODAS, redGroups: { INTERV: 0 }, replicas: 12, maxTurns: 12 });
ok(redFraco.porCondicao[0].resumo.atrito_azul.media < objBase.porCondicao[0].resumo.atrito_azul.media,
  'retirar o grupo de intervenção Vermelho reduz o atrito sofrido pela Força Azul');

// Reprodutibilidade continua valendo com quantidades.
const q1 = SIM.runBatch({ factors: dobro, redGroups: { INTERV: 2 }, replicas: 3, maxTurns: 6 });
const q2 = SIM.runBatch({ factors: dobro, redGroups: { INTERV: 2 }, replicas: 3, maxTurns: 6 });
eq(q1.rows.map(r => `${r.semente}:${r.vencedor}:${r.turnos}`),
   q2.rows.map(r => `${r.semente}:${r.vencedor}:${r.turnos}`),
  'lote com quantidades é reprodutível por semente');

// ─── Traço de replay ─────────────────────────────────────────────────────────
// A funcionalidade inteira repousa sobre duas garantias: gravar a partida não
// pode alterá-la, e re-rodar pela semente tem de dar a mesma partida que o lote
// registrou. Tudo o mais é apresentação.
const TRACE = require('../shared/replay_trace');
const SNAP  = require('../shared/state_snapshot');

// Gravar não pode mudar o que aconteceu — é o que protege o lote.
const semTraco = SIM.runGame(TODAS, 4242, 8);
const t = SIM.traceGame({ factors: TODAS, seed: 4242, maxTurns: 8 });
eq(JSON.stringify(t.resultado), JSON.stringify(semTraco),
  'gravar o traço não altera o resultado da partida');

// Abertura e fecho
eq(t.passos[0].kind, 'game_start', 'o traço começa em game_start');
const fim = t.passos[t.passos.length - 1];
eq(fim.kind, 'game_over', 'o traço termina em game_over');
eq(fim.winner, semTraco.winner, 'game_over registra o mesmo vencedor');
eq(fim.turns,  semTraco.turns,  'game_over registra o mesmo total de turnos');
ok(TRACE.STEP_KINDS.includes(fim.kind), 'vocabulário de passos é fechado');
ok(t.passos.every(p => TRACE.STEP_KINDS.includes(p.kind)), 'todo passo tem tipo conhecido');
ok(!t.truncado, 'partida de 8 turnos não estoura o orçamento do traço');

// Estrutura do laço: duas movimentações e duas declarações por fase.
const fases = t.passos.filter(p => p.kind === 'phase_start').length;
eq(t.passos.filter(p => p.kind === 'movement_committed').length, fases * 2,
  'duas movimentações (Azul e Vermelha) por fase');
eq(t.passos.filter(p => p.kind === 'attacks_declared').length, fases * 2,
  'duas declarações de ataque por fase');
eq(t.passos.filter(p => p.kind === 'combat_queue_built').length, fases,
  'uma fila de combate por fase');

// A fila tem de ser gravada ANTES da resolução. resolveBattleRound muta os
// MESMOS objetos (empilha em results, muda status): guardar a referência faria
// o passo mostrar a fila já resolvida — justamente o que ele existe para negar.
const fila = t.passos.find(p => p.kind === 'combat_queue_built' && p.queue.length);
ok(fila.queue.every(e => e.results.length === 0), 'a fila é copiada antes da resolução (results vazio)');
ok(fila.queue.every(e => e.status === 'pending'), 'a fila é copiada antes da resolução (status pendente)');
ok(fila.queue.every(e => e.weaponType && e.amount >= 1),
  'a fila registra a arma e a salva de cada engajamento');

// O engajamento resolvido traz o que explica o dano.
const eng = t.passos.find(p => p.kind === 'engagement_resolved' && p.engagement.results[0]?.result?.ok);
eq(eng.engagement.results.length, 1, 'o laço construtivo resolve só a 1ª rodada de batalha');
const res = eng.engagement.results[0].result;
ok(Array.isArray(res.attackRolls), 'o resultado traz as rolagens de ataque');
ok(res.interception !== undefined,  'o resultado traz a interceptação');
ok(typeof res.totalDamage === 'number', 'o resultado traz o dano total');

// A invariante central do formato: os deltas reconstroem os quadros.
const quadros = TRACE.materialize(t);
eq(quadros.length, t.passos.length, 'um quadro materializado por passo');
const estadoFinal = SIM.runGame(TODAS, 4242, 8);   // mesma partida, sem traço
void estadoFinal;
{
  // Reconstrói à mão a mesma partida e compara o quadro final unidade a unidade.
  const ob = CF.applyForceConfig(ORDER_OF_BATTLE, { factors: TODAS });
  const st = ENGINE.newGame(ob, { seed: 4242 });
  let w = null;
  for (let ph = 0; ph < 16 && !w && st.turn <= 8; ph++) {
    for (const tm of ['blue', 'red']) ENGINE.applyBotMovesToState(st, tm, ENGINE.computeBotMoves(st, tm));
    st.phase = 'combat';
    st.blueAttacks = ENGINE.computeBotAttacks(st, 'blue');
    st.redAttacks  = ENGINE.computeBotAttacks(st, 'red');
    st.combatQueue = ENGINE.buildCombatQueue(st);
    for (const e of st.combatQueue) { e.battleRound = 1; ENGINE.resolveBattleRound(st, e); }
    st.combatQueue = []; st.currentEngagementIndex = 0;
    w = ENGINE.checkWinner(st); if (w) break; ENGINE.nextTurn(st);
  }
  const ultimo = quadros[quadros.length - 1];
  const divergentes = st.units.filter(u =>
    JSON.stringify(ultimo.get(u.id)) !== JSON.stringify(SNAP.frameUnit(u)));
  eq(divergentes.map(u => u.id), [],
    'os deltas reconstroem exatamente o estado final, unidade a unidade');
}

// O traço é estável entre execuções — é o que torna o link compartilhável.
const t2 = SIM.traceGame({ factors: TODAS, seed: 4242, maxTurns: 8 });
eq(JSON.stringify(t2), JSON.stringify(t), 'o traço é idêntico entre duas execuções da mesma semente');

// Reprodutibilidade LOTE × ISOLADO: a garantia sobre a qual a tela se apoia.
// A partida original correu como a N-ésima de um lote no mesmo processo; o
// replay a roda sozinha. Se isto quebrar, o visualizador mostra outra partida.
{
  const lote = SIM.runBatch({ factors: TODAS, replicas: 5, maxTurns: 10 });
  for (const row of lote.rows) {
    const g = SIM.traceGame({ factors: TODAS, seed: row.semente, maxTurns: 10 });
    eq([g.resultado.winner || 'censurado', g.resultado.turns], [row.vencedor, row.turnos],
      `replay isolado da semente ${row.semente} reproduz o desfecho do lote`);
  }
}

// Condição de bloco: os fatores da própria LINHA bastam para reproduzir, sem
// consultar shared/conditions.js. É o que o relatório usa para montar a URL.
{
  const fat = SIM.runBatch({ bloco: 'fatorial', replicas: 1, maxTurns: 6 });
  for (const row of fat.rows.slice(0, 4)) {
    const fx = Object.fromEntries(CF.FACTOR_KEYS.map(k => [k, row[k]]));
    const g = SIM.traceGame({ factors: fx, seed: row.semente, maxTurns: 6 });
    eq([g.resultado.winner || 'censurado', g.resultado.turns], [row.vencedor, row.turnos],
      `${row.condicao}: os fatores da linha bastam para reproduzir a partida`);
  }
}

// Composição Vermelha também viaja na URL e tem de reproduzir.
{
  const comRed = { INTERV: 2, LOG: 0 };
  const lote = SIM.runBatch({ factors: TODAS, redGroups: comRed, replicas: 2, maxTurns: 8 });
  eq(lote.redGroupsUsados, comRed, 'o lote expõe a composição Vermelha usada (para montar o link)');
  for (const row of lote.rows) {
    const g = SIM.traceGame({ factors: TODAS, seed: row.semente, maxTurns: 8, redGroups: comRed });
    eq([g.resultado.winner || 'censurado', g.resultado.turns], [row.vencedor, row.turnos],
      `replay com Força Vermelha composta reproduz a semente ${row.semente}`);
  }
}

// Partida sem decisão registra maxTurns+1 — o laço vira o turno antes de sair
// pela contagem de fases. Documentado porque a tela precisa dizer o turno certo.
{
  const cens = SIM.runBatch({ factors: TODAS, replicas: 6, maxTurns: 2 });
  const semDecisao = cens.rows.filter(r => r.vencedor === 'censurado');
  ok(semDecisao.length > 0 && semDecisao.every(r => r.turnos === 3),
    'partida sem decisão registra maxTurns+1 em "turnos"');
  const g = SIM.traceGame({ factors: TODAS, seed: semDecisao[0].semente, maxTurns: 2 });
  const fimG = g.passos[g.passos.length - 1];
  eq(fimG.lastPlayedTurn, 2, 'game_over informa o último turno efetivamente jogado');
  eq(fimG.reason, 'timeout', 'game_over classifica a partida sem decisão como timeout');
}

// Orçamento: o traço precisa caber numa resposta HTTP.
{
  const longo = SIM.traceGame({ factors: TODAS, seed: 7003, maxTurns: 40, victoryRule: 'exhaustion' });
  const kb = JSON.stringify(longo).length / 1024;
  ok(kb < 1500, `traço do pior caso cabe em 1,5 MB (${kb.toFixed(0)} KB, ${longo.passos.length} passos)`);
}

// O coletor desligado não pode custar nada ao lote.
{
  const N = 40;
  for (let k = 0; k < 10; k++) SIM.runGame(TODAS, 9500 + k, 8);   // aquecimento
  const t0 = Date.now(); for (let k = 0; k < N; k++) SIM.runGame(TODAS, 6000 + k, 8);
  const ms = (Date.now() - t0) / N;
  console.log(`   ℹ ${ms.toFixed(2)} ms/partida sem captura`);
  ok(ms < 15, `lote sem captura continua abaixo de 15 ms/partida (${ms.toFixed(1)} ms)`);
}

// ─── Lote ────────────────────────────────────────────────────────────────────
const lote = SIM.runBatch({ bloco: 'ablacao', replicas: 3, maxTurns: 8 });
eq(lote.rows.length, 18, 'lote de ablação: 6 condições × 3 réplicas = 18 partidas');
eq(lote.porCondicao.length, 6, 'resumo por condição cobre as 6 condições');
ok(lote.porCondicao.every(c => c.resumo.E1_atrito.media !== null), 'todas as condições têm média de E1');
ok(lote.rows.every(r => ['blue', 'red', 'censurado'].includes(r.vencedor)), 'desfecho sempre classificado');
ok(lote.gruposPresentes.length > 0 && lote.gruposPresentes[0].sigla, 'grupos presentes vêm rotulados');

const ordem = lote.gruposPresentes.filter(g => g.side === 'blue').map(g => g.sigla);
const ordemTax = TAX.groupLabels('blue').map(g => g.sigla).filter(s => ordem.includes(s));
eq(ordem, ordemTax, 'grupos saem na ordem doutrinária da taxonomia');

const csv = SIM.toCsv(lote.rows);
const linhas = csv.trim().split('\n');
eq(linhas.length, 19, 'CSV tem cabeçalho + uma linha por partida');
ok(linhas[0].includes('E1_atrito') && linhas[0].includes('custo_total') && linhas[0].includes('grp_blue_'),
  'CSV traz métricas, custo e colunas de grupo');

// Um pacote avulso respeita a seleção enviada
const avulso = SIM.runBatch({ factors: { A_SSN: -1, B_SSK: -1, C_Azuis: -1, D_MSS: -1, E_Terra: -1 }, replicas: 2, maxTurns: 6 });
eq(avulso.porCondicao[0].custo_total, 0, 'pacote vazio custa 0');
eq(avulso.porCondicao[0].n_capacidades, 0, 'pacote vazio tem 0 capacidades');

// ─── Ordem de batalha em planilha ────────────────────────────────────────────
// O que precisa valer: (1) a OB padrão anotada é exatamente o que as
// constantes dizem — senão carregar a planilha padrão mudaria resultados; (2) a
// planilha vai e volta sem perda; (3) uma unidade nova classificada num pacote
// se comporta como as do pacote; (4) erro aponta a célula; (5) nada vaza.
const SC  = require('../shared/scenario');
const XL  = require('../shared/ob_spreadsheet');
const ExcelJS = require('exceljs');

async function testesPlanilha() {
  const A = SC.DEFAULT_ANOTADA;

  // (1) A OB padrão anotada reproduz as constantes.
  for (const k of CF.FACTOR_KEYS) {
    eq(CF.factorUnitIds(A, k), CF.CAPABILITY_FACTORS[k].unitIds, `OB anotada: pacote ${k} igual à constante`);
  }
  for (const s of CF.RED_GROUP_KEYS) {
    eq(CF.redGroupUnitIds(A, s), CF.RED_GROUPS[s].unitIds, `OB anotada: grupo vermelho ${s} igual à taxonomia`);
  }
  const cen = SC.cenarioDe(A);
  const lista = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [].concat(v)]));
  eq(cen.objectiveIds.blueTargets, lista(ENGINE.OBJECTIVE_IDS.blueTargets), 'OB anotada: alvos do Azul iguais a OBJECTIVE_IDS');
  eq(cen.objectiveIds.redTargets,  lista(ENGINE.OBJECTIVE_IDS.redTargets),  'OB anotada: alvos do Vermelho iguais a OBJECTIVE_IDS');
  eq(cen.thresholds, ENGINE.OBJECTIVE_THRESHOLDS, 'OB anotada: limiares iguais a OBJECTIVE_THRESHOLDS');
  ok([...ORDER_OF_BATTLE.forces.blue.map(u => ['blue', u]), ...ORDER_OF_BATTLE.forces.red.map(u => ['red', u])]
       .every(([s, u]) => cen.grupos[s][u.id] === TAX.classifyUnit(u.id, s).sigla),
     'OB anotada: grupo de cada unidade igual à taxonomia');
  const vPadrao = SC.validarOB(A);
  eq([vPadrao.erros.length, vPadrao.avisos.length], [0, 0], 'a OB padrão valida sem erros nem avisos');
  eq(SC.obHash(SC.canonOB(A)), SC.DEFAULT_HASH, 'forma canônica é idempotente (mesmo hash)');

  // (1b) O caminho anotado dá os MESMOS resultados que o caminho das constantes.
  const semOB = (spec) => SIM.toCsv(SIM.runBatch(spec).rows);
  const comOB = (spec) => SIM.toCsv(SIM.runBatch({ ...spec, ob: A, obId: 'teste' }).rows
    .map(({ ob_id, ...resto }) => { void ob_id; return resto; }));
  for (const spec of [
    { bloco: 'ablacao', replicas: 2, maxTurns: 8 },
    { factors: { ...TODAS, A_SSN: 2, B_SSK: 0 }, redGroups: { INTERV: 2, LOG: 0 }, replicas: 3, maxTurns: 10 },
    { factors: TODAS, replicas: 3, maxTurns: 16, victoryRule: 'exhaustion' },
  ]) {
    eq(comOB(spec), semOB(spec), `OB anotada joga igual à padrão (${spec.bloco || JSON.stringify(spec.redGroups || spec.victoryRule || 'pacote')})`);
  }

  // (2) Ida e volta pela planilha.
  const buf = await XL.exportarPlanilha(A);
  ok(buf.equals(await XL.exportarPlanilha(A)), 'exportação é determinística (mesmo arquivo)');
  const lida = await XL.lerPlanilha(buf);
  eq([lida.erros.length, lida.avisos.length], [0, 0], 'planilha padrão lida sem erros nem avisos');
  const v = SC.validarOB(lida.rascunho);
  eq(SC.obHash(v.ob), SC.DEFAULT_HASH, 'ida e volta da planilha padrão devolve a mesma OB (mesmo hash)');
  ok(SC.ehPadrao(v.ob), 'planilha padrão sem edição é reconhecida como a padrão');

  // Editar como o usuário faria (exceljs no lugar do Excel).
  async function editar(fn) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const u = wb.getWorksheet('Unidades'), c = wb.getWorksheet('Composição');
    const col = {};
    u.getRow(1).eachCell((cell, n) => { col[cell.value] = n; });
    const linha = id => { let r = null; u.eachRow((row, n) => { if (row.getCell(col.id).value === id) r = n; }); return r; };
    const set = (id, campo, val) => { u.getCell(linha(id), col[campo]).value = val; };
    fn({ wb, u, c, col, linha, set });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const lerEValidar = async b => {
    const l = await XL.lerPlanilha(b);
    const vv = l.rascunho ? SC.validarOB(l.rascunho) : { ob: null, erros: [], avisos: [] };
    return { ob: vv.ob, erros: [...l.erros, ...vv.erros], avisos: [...l.avisos, ...vv.avisos] };
  };

  // (3) Unidade nova num pacote, característica alterada, unidade removida.
  const editada = await lerEValidar(await editar(({ u, c, col, linha, set }) => {
    set('BLUE-SAG-S1', 'SP', 12);
    const r = u.rowCount + 1;
    const novo = { lado: 'azul', id: 'BLUE-FRAG-N1', nome: 'Fragata Nova', categoria: 'superficie', pacote: 'C_Azuis',
                   grupo: 'VIG', SP: 4, movimento: 4, coluna: 'L', linha: 11, mss_qtd: 8, mss_alc: 2,
                   det_superficie: 2, det_aereo: 2, alc_superficie: 2, defesa_aerea: 2 };
    for (const [k, val] of Object.entries(novo)) u.getCell(r, col[k]).value = val;
    c.addRow(['BLUE-FRAG-N1', 'fragata', 1]);
    u.spliceRows(linha('RED-AKE'), 1);
    c.eachRow((row, n) => { if (row.getCell(1).value === 'RED-AKE') row.getCell(1).value = null; });
    for (let n = c.rowCount; n > 1; n--) if (c.getCell(n, 1).value === null) c.spliceRows(n, 1);
  }));
  eq(editada.erros, [], 'OB editada (unidade nova, SP alterado, unidade removida) é aceita');
  ok(editada.avisos.some(a => a.includes('BLUE-FRAG-N1')), 'a unidade nova é apontada nos avisos para conferência');
  const OBE = editada.ob;
  const azuisCom = cfg => CF.applyForceConfig(OBE, cfg).forces.blue.map(u => u.id);
  ok(azuisCom({ factors: TODAS }).includes('BLUE-FRAG-N1'), 'fragata nova presente com C_Azuis=1');
  ok(!azuisCom({ factors: { ...TODAS, C_Azuis: 0 } }).includes('BLUE-FRAG-N1'), 'fragata nova sai junto com C_Azuis=0');
  ok(azuisCom({ factors: { ...TODAS, C_Azuis: 2 } }).includes('BLUE-FRAG-N1~2'), 'fragata nova é duplicada com C_Azuis=2');
  const stE = ENGINE.newGame(CF.applyForceConfig(OBE, { factors: TODAS }), { seed: 1, obId: 'x' });
  eq(stE.units.find(u => u.id === 'BLUE-SAG-S1').hp, 12, 'característica editada (SP do SAG-1) vale em partida');
  eq(stE.units.find(u => u.id === 'BLUE-FRAG-N1').type, 'fragata', 'tipo da unidade nova vem da composição (comportamento de fragata)');
  ok(ENGINE.computeObjectives(stE).blue.conditions.find(c => c.id === 'logistics').label.includes('2 de 2'),
     'remover um logístico ajusta a condição para "2 de 2"');
  ok(!JSON.stringify(ENGINE.stateFor(stE, 'blue')).includes('"cenario"'), 'a classificação da OB não vai para o cliente');
  eq(JSON.stringify(ORDER_OF_BATTLE), obAntes, 'OB global intacta depois de tudo');
  const loteE = SIM.runBatch({ factors: TODAS, replicas: 2, maxTurns: 6, ob: OBE, obId: SC.obHash(OBE) });
  ok(loteE.rows.every(r => r.ob_id === SC.obHash(OBE)), 'linhas do lote carregam ob_id da OB usada');
  ok(loteE.rows.every(r => 'grp_blue_VIG' in r), 'a unidade nova entra no grupo VIG dos relatórios');
  const tr = SIM.traceGame({ factors: TODAS, seed: loteE.rows[0].semente, maxTurns: 6, ob: OBE, obId: 'x' });
  eq([tr.resultado.winner || 'censurado', tr.resultado.turns], [loteE.rows[0].vencedor, loteE.rows[0].turnos],
     'replay com OB carregada reproduz a partida do lote');

  // Segundo porta-aviões vermelho: a condição passa a exigir os dois.
  const doisPA = await lerEValidar(await editar(({ set }) => set('RED-GANF', 'alvo_porta_avioes', 'x')));
  eq(doisPA.erros, [], 'marcar um segundo navio como porta-aviões é aceito');
  eq(SC.cenarioDe(doisPA.ob).objectiveIds.blueTargets.carrier, ['RED-GBPA', 'RED-GANF'], 'condição do porta-aviões lista os dois');
  const stP = ENGINE.newGame(doisPA.ob, { seed: 1 });
  stP.units.find(u => u.id === 'RED-GBPA').hp = 0;
  ok(!ENGINE.computeObjectives(stP).blue.conditions.find(c => c.id === 'carrier').met, 'afundar só um não cumpre a condição');
  stP.units.find(u => u.id === 'RED-GANF').hp = 0;
  ok(ENGINE.computeObjectives(stP).blue.conditions.find(c => c.id === 'carrier').met, 'afundar os dois cumpre');

  // (4) Cada erro aponta a célula certa.
  const comErros = await lerEValidar(await editar(({ u, c, col, linha, set }) => {
    set('BLUE-SUB-1', 'coluna', 'M'); set('BLUE-SUB-1', 'linha', 6);
    set('RED-GE-2', 'movimento', 'quatro');
    set('RED-GE-3', 'SP', new Date(2026, 0, 1));
    set('RED-GBPA', 'pacote', 'C_Azuis');
    set('RED-GBPA', 'alvo_porta_avioes', null);
    set('BLUE-SEOP', 'nome', '<b>x</b>');
    u.getCell(linha('BLUE-SUB-2'), col.id).value = 'BLUE-SUB-1';
    c.addRow(['BLUE-SAG-P', 'navio_espacial', 1]);
  }));
  const tem = (re, msg) => ok(comErros.erros.some(e => re.test(e)), msg);
  tem(/^Unidades!P\d+: M6 é águas rasas/,         'submarino em águas rasas: erro na célula da coluna');
  tem(/^Unidades!O\d+: movimento — "quatro"/,      'texto em campo numérico: erro na célula');
  tem(/^Unidades!N\d+: a célula virou data/,       'data no lugar de número: erro na célula');
  tem(/^Unidades!E\d+: pacote de capacidade só existe na Força Azul/, 'pacote numa unidade vermelha');
  tem(/^Unidades!C\d+: nome não pode conter/,      'caracteres de HTML no nome são recusados');
  tem(/^Unidades!B\d+: id "BLUE-SUB-1" repetido/,  'id repetido');
  tem(/^Composição!B\d+: tipo de composição "navio_espacial"/, 'tipo de composição desconhecido');
  tem(/alvo "porta-aviões".*cumprida automaticamente/, 'condição de vitória sem alvo é recusada');
  ok(!comErros.erros.some(e => /movimento é obrigatório|SP é obrigatório/.test(e)),
     'célula já recusada na leitura não gera um segundo erro');

  // Limiar impossível
  const impossivel = await lerEValidar(await editar(({ wb }) => { wb.getWorksheet('Cenário').getCell('B4').value = 9; }));
  ok(impossivel.erros.some(e => /^Cenário!B4: pede 9 FPSO/.test(e)), 'limiar maior que o número de alvos é recusado');

  // (5) Arquivos ruins e segurança.
  eq((await XL.lerPlanilha(Buffer.from('nao e planilha'))).erros.length, 1, 'arquivo que não é planilha é recusado');
  const zlib = require('zlib');
  const dado = zlib.deflateRawSync(Buffer.alloc(30 * 1024 * 1024), { level: 9 });
  const nome = Buffer.from('xl/a.xml');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(nome.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt32LE(dado.length, 20);
  cd.writeUInt32LE(30 * 1024 * 1024, 24); cd.writeUInt16LE(nome.length, 28);
  const corpo = Buffer.concat([lh, nome, dado]), dir = Buffer.concat([cd, nome]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(corpo.length, 16);
  ok(XL.checarZip(Buffer.concat([corpo, dir, eocd])) !== null, 'bomba de zip é recusada antes de abrir');
  const csvInj = SIM.toCsv([{ condicao: '=HYPERLINK("x")', replica: 1, semente: 1 }]);
  ok(csvInj.includes("'=HYPERLINK"), 'CSV neutraliza texto que o Excel leria como fórmula');

  // Bug de ids duplicados corrigido: INTERV×2 + DAE×2 copiava as aeronaves
  // embarcadas duas vezes com o mesmo id.
  const dup = CF.applyForceConfig(ORDER_OF_BATTLE, { redGroups: { INTERV: 2, DAE: 2 } }).forces.red.map(u => u.id);
  eq(dup.length, new Set(dup).size, 'INTERV×2 + DAE×2 não gera ids duplicados');
}

testesPlanilha()
  .then(() => console.log(`\nALL PASS (${pass} asserts)`))
  .catch(err => { console.error(err); process.exit(1); });
