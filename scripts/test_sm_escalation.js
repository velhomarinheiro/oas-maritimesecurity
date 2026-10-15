'use strict';
/**
 * test_sm_escalation.js — Testes da Fase SM-2 (escada de escalada e ROE).
 *
 * Critérios de aceitação cobertos (Conceito v1.6 §13; Desenho v1.3 §8):
 *   - transições reproduzíveis (mesma sequência de eventos ⇒ mesma história);
 *   - N3 aciona o motor de salva sem alterar sua física: o resultado é
 *     idêntico ao de combat_engine.resolveEngagement chamado direto, e abaixo
 *     de N3 nada é resolvido nem sorteado;
 *   - ROE por nível limita o motor de encontro (SM-1).
 *
 * Uso: node scripts/test_sm_escalation.js
 */

const assert = require('assert');
const { mulberry32 } = require('../shared/rng');
const { PARAMS: P } = require('../shared/sm/params');
const ES = require('../shared/sm/escalation');
const EN = require('../shared/sm/encounter');
const A  = require('../shared/sm/attribution');
const CE = require('../shared/combat_engine');

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

// Roda uma sequência de turnos (lista de listas de eventos).
function rodar(turnos, { inicial = 0, decidir } = {}) {
  let e = ES.criarEstadoEscalada(inicial);
  const niveis = [];
  for (const ev of turnos) {
    e = ES.avancarTurno(e, ev, decidir).estado;
    niveis.push(e.nivel);
  }
  return { e, niveis };
}
const inc  = (atribuicao = 10) => ({ tipo: 'incidente_hibrido', atribuicao });
const dano = (atribuicao) => ({ tipo: 'dano_infra', atribuicao });
const atq  = (atribuicao) => ({ tipo: 'ataque_armado', atribuicao });

// ─── ROE por nível ───────────────────────────────────────────────────────────
eq([0, 1, 2, 3].map(n => ES.tetoRoe(n)), ['identificacao', 'inspecao', 'apresamento', 'apresamento'],
   'teto do motor de encontro por nível (N0 vigilância … N2 apresamento)');
eq([0, 1, 2, 3].map(n => ES.acaoPermitida(n, 'abordagem_coercitiva')), [false, false, true, true],
   'abordagem coercitiva só a partir de N2');
eq([0, 1, 2, 3].map(n => ES.acaoPermitida(n, 'abordagem_consentida')), [false, true, true, true],
   'abordagem consentida a partir de N1');
eq([0, 1, 2, 3].map(n => ES.acaoPermitida(n, 'emprego_forca')), [false, false, false, true],
   'emprego de força só em N3');
ok([0, 1, 2].every(n => P.NIVEIS[n].acoes.every(a => P.NIVEIS[n + 1].acoes.includes(a))),
   'cada nível autoriza tudo o que o anterior autoriza');
ok(P.ACOES.every(a => ES.nivelMinimoDaAcao(a) !== null), 'toda ação do catálogo é autorizada em algum nível');
eq([ES.excessoDeForca(0, 'apresamento'), ES.excessoDeForca(1, 'emprego_forca'), ES.excessoDeForca(2, 'apresamento')],
   [2, 2, 0], 'excesso de força = níveis acima do autorizado');
ok((() => { try { ES.tetoRoe(4); return false; } catch { return true; } })(), 'nível inexistente é recusado');

// ─── ROE limita o motor de encontro ──────────────────────────────────────────
{
  let alemN0 = false, apresouN2 = false;
  for (let s = 1; s <= 300; s++) {
    for (const nivel of [0, 2]) {
      const r = EN.resolverEncontro({ unidade: { type: 'patrulha_oc' }, contato: {}, fusao: 1,
        etapaAlvo: 'apresamento', tetoRoe: ES.tetoRoe(nivel), rng: mulberry32(s) });
      if (nivel === 0 && r.etapas.some(e => A.indiceEtapa(e.etapa) > A.indiceEtapa('identificacao'))) alemN0 = true;
      if (nivel === 2 && r.apresado) apresouN2 = true;
    }
  }
  ok(!alemN0, 'em N0 o encontro nunca passa da identificação');
  ok(apresouN2, 'em N2 o encontro pode chegar ao apresamento');
}

// ─── Transições ──────────────────────────────────────────────────────────────
eq(rodar([[], [], [], []]).niveis, [0, 0, 0, 0], 'sem eventos a postura fica em Rotina');
eq(rodar([[inc()], [inc()], [inc()]]).niveis, [0, 0, 1], 'padrão de incidentes (3 em 3 turnos) ⇒ N1 no 3º');
eq(rodar([[inc()], [], [], [inc()], [inc()]]).niveis, [0, 0, 0, 0, 0], 'incidentes fora da janela não somam');
eq(rodar([[inc(45)]]).niveis, [1], 'um incidente com atribuição parcial ⇒ N1');
eq(rodar([[dano(60)]], { inicial: 1 }).niveis, [1], 'dano a infraestrutura com atribuição frágil não leva a N2');
eq(rodar([[dano(75)]], { inicial: 1 }).niveis, [2], 'dano a infraestrutura com atribuição robusta ⇒ N2');
eq(rodar([[atq(80)]]).niveis, [3], 'ataque armado atribuído em Rotina ⇒ salto direto a N3');
eq(rodar([[{ tipo: 'emprego_aberto' }]], { inicial: 1 }).niveis, [3], 'emprego aberto de meios ⇒ N3');
eq(rodar([[atq(50)]]).niveis, [1], 'ataque sem atribuição robusta conta só como incidente (N1)');
eq(rodar([[{ tipo: 'pesca_iuu', atribuicao: 90 }]]).niveis, [0], 'ocorrência não híbrida não escala');

{
  const nega = () => ({ autorizado: false, por: 'COMPAAz' });
  const comemch = () => ({ autorizado: true, por: 'ComemCh' });
  eq(rodar([[atq(90)]], { decidir: nega }).niveis, [0], 'COMPAAz nega ⇒ a postura não muda');
  eq(rodar([[atq(90)]], { decidir: comemch }).niveis, [0], 'só a autorização do COMPAAz vale (ComemCh conduz, não autoriza)');
  const { e } = rodar([[inc(45)]]);
  eq(e.historico, [{ turno: 1, de: 0, para: 1, direcao: 'subida', gatilho: 'gatilho_N1',
                     conduzidaPor: 'ComemCh', autorizadaPor: 'COMPAAz' }],
     'transição registrada com turno, gatilho, condução e autorização');
}

{
  const T = P.TURNOS_PARA_DESESCALAR;
  const calmos = Array.from({ length: T }, () => []);
  const r = rodar(calmos, { inicial: 2 });
  eq(r.niveis, [...Array(T - 1).fill(2), 1], `${T} turnos sem gatilho ⇒ desce um nível`);
  const r2 = rodar([[], [], [dano(80)], [], [], []], { inicial: 2 });
  ok(r2.niveis.every(n => n === 2), 'gatilho do nível corrente zera a contagem de calmaria');
  const r3 = rodar(Array.from({ length: 3 * T }, () => []), { inicial: 3 });
  eq(r3.e.nivel, 0, 'calmaria prolongada desce um nível por vez até a Rotina');
  eq(r3.e.historico.map(h => h.para), [2, 1, 0], 'descida passa por todos os níveis');
  eq(r3.e.nivelMax, 3, 'nível máximo atingido é preservado');
}

{
  const turnos = [[inc(45)], [dano(75)], [], [atq(85)], [], [], [], [], [], []];
  const { e } = rodar(turnos);
  eq(e.turnosPorNivel.reduce((a, b) => a + b, 0), turnos.length, 'cada turno conta em exatamente um nível');
  eq(ES.turnosAbaixoDoLimiar(e), e.turnosPorNivel[0] + e.turnosPorNivel[1] + e.turnosPorNivel[2],
     'E3_escalada = turnos em N0–N2');
  eq(e.turnosPorNivel, [1, 1, 4, 4], 'turno conta no nível em vigor durante ele (sobe a N3 no 4º, desce a N2 após 4 calmos)');
}

{
  const e0 = ES.criarEstadoEscalada(1);
  const copia = JSON.parse(JSON.stringify(e0));
  ES.avancarTurno(e0, [atq(90)]);
  eq(e0, copia, 'avancarTurno não muda o estado recebido');
}

// ─── Reprodutibilidade ───────────────────────────────────────────────────────
function campanha(seed, n = 60) {
  const rng = mulberry32(seed);
  const tipos = ['incidente_hibrido', 'dano_infra', 'ataque_armado', 'pesca_iuu'];
  const turnos = [];
  for (let t = 0; t < n; t++) {
    const k = Math.floor(rng() * 3);
    turnos.push(Array.from({ length: k }, () => ({
      tipo: tipos[Math.floor(rng() * tipos.length)], atribuicao: Math.floor(rng() * 100) })));
  }
  return rodar(turnos).e;
}
eq(campanha(911), campanha(911), 'mesma semente de eventos ⇒ mesma história de escalada');
ok(JSON.stringify(campanha(911).historico) !== JSON.stringify(campanha(912).historico),
   'sementes diferentes ⇒ histórias diferentes');

// ─── N3: o motor de salva, sem alteração de física ───────────────────────────
function cena() {
  const atacante = { id: 'RED-X', team: 'red', category: 'surface', hp: 10,
                     weapons: { ascm: { quantity: 8, range: 6 } } };
  const defensor = { id: 'BLUE-X', team: 'blue', category: 'surface', hp: 9,
                     weapons: {}, capabilities: { airDefense: 3 } };
  return { attacker: atacante, defender: defensor, weaponType: 'ascm', amount: 6, distance: 3 };
}
{
  let identicos = true, algumDano = false;
  for (let s = 1; s <= 200; s++) {
    const viaN3 = cena(), direto = cena();
    const r1 = ES.resolverSalvaN3(ES.criarEstadoEscalada(3), viaN3, mulberry32(s));
    const anterior = CE.getRng();
    CE.setRng(mulberry32(s));
    const r2 = CE.resolveEngagement(direto);
    CE.setRng(anterior);
    if (JSON.stringify([r1, viaN3]) !== JSON.stringify([r2, direto])) identicos = false;
    if (r1.totalDamage > 0) algumDano = true;
  }
  ok(identicos, 'N3: resultado e unidades idênticos aos do motor de salva chamado direto (200 sementes)');
  ok(algumDano, 'N3: a salva de fato resolve dano');
  ok(CE.getRng() === Math.random, 'N3: o gerador do motor de salva é restaurado depois');
}
for (const nivel of [0, 1, 2]) {
  const c = cena();
  const antes = JSON.stringify(c);
  let sorteios = 0;
  const rng = () => { sorteios++; return 0.5; };
  const r = ES.resolverSalvaN3(ES.criarEstadoEscalada(nivel), c, rng);
  ok(r.ok === false && sorteios === 0 && JSON.stringify(c) === antes,
     `N${nivel}: sem salva — nada resolvido, nenhum sorteio, unidades intactas`);
}
ok((() => { try { ES.resolverSalvaN3(ES.criarEstadoEscalada(3), cena()); return false; } catch { return true; } })(),
   'N3 sem rng semeado é recusado');

console.log(`\nSM-2: ${pass} verificações — ALL PASS`);
