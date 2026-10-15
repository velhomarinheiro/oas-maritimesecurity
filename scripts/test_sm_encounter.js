'use strict';
/**
 * test_sm_encounter.js — Testes da Fase SM-1 (motor de encontro e atribuição).
 *
 * Critérios de aceitação cobertos (Desenho Experimental v1.3 §8):
 *   - determinismo: mesma semente ⇒ exatamente a mesma sequência de encontros;
 *   - limites: encontro nulo ⇒ sem efeito (e sem consumir a semente);
 *     atribuição plena ⇒ resposta máxima autorizada.
 * Mais a coerência dos moduladores (capacidade, fusão, negabilidade, evasão).
 *
 * Uso: node scripts/test_sm_encounter.js
 */

const assert = require('assert');
const { mulberry32 } = require('../shared/rng');
const { PARAMS: P } = require('../shared/sm/params');
const A = require('../shared/sm/attribution');
const E = require('../shared/sm/encounter');

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

// Gerador que conta os sorteios consumidos.
function contador(seed) {
  const r = mulberry32(seed);
  const fn = () => { fn.n++; return r(); };
  fn.n = 0;
  return fn;
}

const NPAOC   = { type: 'patrulha_oc' };
const MPA     = { type: 'patrulha' };
const ULTIMA  = P.ETAPAS[P.ETAPAS.length - 1];

// Uma campanha sintética: 500 encontros com unidades, contatos, fusão e
// etapas variados, todos sorteados da mesma semente.
function campanha(seed) {
  const rng = mulberry32(seed);
  const tipos = Object.keys(P.CAPACIDADE_POR_TIPO);
  const negs  = Object.keys(P.FATOR_NEGABILIDADE);
  const out = [];
  let atrib = 0;
  for (let k = 0; k < 500; k++) {
    const unidade = { type: tipos[Math.floor(rng() * tipos.length)] };
    const contato = { atribuicao: atrib, negabilidade: negs[Math.floor(rng() * negs.length)], evasao: rng() * 0.5 };
    const r = E.resolverEncontro({
      unidade, contato, fusao: rng(), etapaAlvo: Math.floor(rng() * P.ETAPAS.length), rng,
    });
    atrib = k % 25 === 0 ? 0 : r.atribuicao.depois;  // novo incidente a cada 25
    out.push(r);
  }
  return out;
}

// ─── Determinismo ────────────────────────────────────────────────────────────
const c1 = campanha(4242), c2 = campanha(4242), c3 = campanha(4243);
eq(c1, c2, 'determinismo: mesma semente ⇒ mesmos 500 encontros');
ok(JSON.stringify(c1) !== JSON.stringify(c3), 'sementes diferentes ⇒ encontros diferentes');
ok(c1.some(r => r.apresado) && c1.some(r => r.efetivo && !r.apresado),
   'a campanha sintética exercita sucessos e falhas');

{
  let consistente = true;
  for (let s = 1; s <= 200; s++) {
    const rng = contador(s);
    const r = E.resolverEncontro({ unidade: NPAOC, contato: {}, fusao: 0.7, etapaAlvo: ULTIMA, rng });
    if (rng.n !== r.etapas.length) consistente = false;
    // encadeamento: todas as etapas antes da última tiveram sucesso
    if (r.etapas.slice(0, -1).some(e => !e.sucesso)) consistente = false;
    const ultimaTentada = r.etapas[r.etapas.length - 1];
    if (ultimaTentada.sucesso && r.etapas.length !== P.ETAPAS.length) consistente = false;
  }
  ok(consistente, 'cada etapa tentada consome um sorteio; o encadeamento para na 1ª falha');
}

ok((() => { try { E.resolverEncontro({ unidade: NPAOC, contato: {}, etapaAlvo: 0 }); return false; }
            catch { return true; } })(),
   'sem rng semeado o motor recusa (nunca usa Math.random)');

{
  const contato = { atribuicao: 30 };
  const copia = JSON.parse(JSON.stringify(contato));
  E.resolverEncontro({ unidade: NPAOC, contato, fusao: 1, etapaAlvo: ULTIMA, rng: mulberry32(9) });
  eq(contato, copia, 'o encontro não muda o contato recebido');
}

// ─── Limite: encontro nulo ⇒ sem efeito ──────────────────────────────────────
const nulos = [
  ['sem unidade',            { unidade: null, contato: { atribuicao: 37 }, etapaAlvo: ULTIMA }, 'sem_unidade'],
  ['sem contato',            { unidade: NPAOC, contato: null, etapaAlvo: ULTIMA }, 'sem_contato'],
  ['sem etapa-alvo',         { unidade: NPAOC, contato: { atribuicao: 37 }, etapaAlvo: undefined }, 'sem_etapa'],
  ['etapa inexistente',      { unidade: NPAOC, contato: { atribuicao: 37 }, etapaAlvo: 'bombardeio' }, 'sem_etapa'],
  ['ROE não permite etapa',  { unidade: NPAOC, contato: { atribuicao: 37 }, etapaAlvo: ULTIMA, tetoRoe: 'nenhuma' }, 'roe_impede'],
  ['tipo sem capacidade',    { unidade: { type: 'porto' }, contato: { atribuicao: 37 }, etapaAlvo: ULTIMA }, 'sem_capacidade'],
  ['capacidade zero',        { unidade: { type: 'fragata', capSM: { sensor: 0, gvi: 1 } }, contato: { atribuicao: 37 }, etapaAlvo: ULTIMA }, 'sem_capacidade'],
  ['evasão total',           { unidade: NPAOC, contato: { atribuicao: 37, evasao: 1 }, etapaAlvo: ULTIMA }, 'deteccao_impossivel'],
];
for (const [nome, args, motivo] of nulos) {
  const rng = contador(77);
  const r = E.resolverEncontro({ ...args, fusao: 1, rng });
  const atrib = args.contato?.atribuicao ?? 0;
  ok(!r.efetivo && r.motivo === motivo && rng.n === 0 && r.etapas.length === 0 &&
     r.evidencia === 0 && r.atribuicao.antes === atrib && r.atribuicao.depois === atrib &&
     !r.apresado && r.custoPolitico === 0,
     `encontro nulo (${nome}): sem efeito e sem consumir a semente`);
}

{
  // Encontro nulo no meio de uma campanha não desloca a sequência seguinte.
  const a = mulberry32(31), b = mulberry32(31);
  E.resolverEncontro({ unidade: null, contato: {}, etapaAlvo: 0, rng: a });
  eq(a(), b(), 'encontro nulo não desloca a sequência da semente');
}

{
  // MPA detecta mas não aborda: o encontro para na interrogação por falta de GVI.
  let alem = false;
  for (let s = 1; s <= 300; s++) {
    const r = E.resolverEncontro({ unidade: MPA, contato: {}, fusao: 1, etapaAlvo: ULTIMA, rng: mulberry32(s) });
    if (r.etapaAtingida && A.indiceEtapa(r.etapaAtingida) >= A.indiceEtapa('abordagem')) alem = true;
  }
  ok(!alem, 'aviação de patrulha (gvi 0) nunca passa da interrogação');
}

// ─── Limite: atribuição plena ⇒ resposta máxima autorizada ───────────────────
for (const teto of P.ETAPAS) {
  eq(A.respostaAutorizada(100, teto), teto, `atribuição plena ⇒ resposta = teto da ROE (${teto})`);
}
eq(A.respostaAutorizada(100), ULTIMA, 'atribuição plena sem teto ⇒ apresamento');
eq(A.respostaAutorizada(0), 'identificacao', 'atribuição nula ⇒ só vigilância (detecção/identificação)');
eq(A.respostaAutorizada(50, 'nada'), null, 'teto inválido ⇒ nenhuma resposta');
{
  let monot = true, prev = -1;
  for (let a = 0; a <= 100; a++) {
    const i = A.indiceEtapa(A.respostaAutorizada(a));
    if (i < prev) monot = false;
    prev = i;
  }
  ok(monot, 'resposta autorizada não diminui quando a atribuição cresce');
}
{
  let semCusto = true;
  for (let s = 1; s <= 100; s++) {
    const r = E.resolverEncontro({ unidade: NPAOC, contato: { atribuicao: 100 }, fusao: 0.5,
                                   etapaAlvo: ULTIMA, rng: mulberry32(s) });
    if (r.custoPolitico !== 0 || r.excesso !== null || r.atribuicao.depois !== 100) semCusto = false;
  }
  ok(semCusto, 'com atribuição plena, nenhuma etapa gera risco político nem excesso');
}
{
  // Apresar com atribuição frágil custa; com robusta não.
  ok(A.riscoPolitico(10, 'apresamento') > A.riscoPolitico(50, 'apresamento') &&
     A.riscoPolitico(50, 'apresamento') > 0 && A.riscoPolitico(70, 'apresamento') === 0,
     'risco político cai com a atribuição e zera no limiar');
  ok(A.riscoPolitico(0, 'deteccao') === 0 && A.riscoPolitico(0, 'identificacao') === 0,
     'vigilância não tem risco político');
}

// ─── Coerência dos moduladores ───────────────────────────────────────────────
{
  let dentro = true, monoFusao = true, monoCap = true;
  for (const etapa of P.ETAPAS) {
    let prevF = -1;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const p = E.probabilidadeEtapa(etapa, NPAOC, {}, f);
      if (p < 0 || p > 1) dentro = false;
      if (p < prevF) monoFusao = false;
      prevF = p;
    }
    let prevC = -1;
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const p = E.probabilidadeEtapa(etapa, { capSM: { sensor: c, gvi: c } }, {}, 0.6);
      if (p < prevC) monoCap = false;
      prevC = p;
    }
  }
  ok(dentro, 'probabilidade de toda etapa fica em [0, 1]');
  ok(monoFusao, 'probabilidade não diminui com a fusão');
  ok(monoCap, 'probabilidade não diminui com a capacidade');
  ok(E.probabilidadeEtapa('deteccao', NPAOC, {}, 1) > E.probabilidadeEtapa('deteccao', NPAOC, {}, 0),
     'fusão melhora a detecção');
  ok(E.probabilidadeEtapa('deteccao', NPAOC, { evasao: 0.6 }, 1) < E.probabilidadeEtapa('deteccao', NPAOC, {}, 1) &&
     E.probabilidadeEtapa('abordagem', NPAOC, { evasao: 0.6 }, 1) === E.probabilidadeEtapa('abordagem', NPAOC, {}, 1),
     'evasão afeta só as etapas de percepção');
}
{
  // p = 1 sempre passa; p = 0 nunca passa (sorteio em [0, 1)).
  const certo = { ...P, P_BASE: Object.fromEntries(P.ETAPAS.map(e => [e, 1])) };
  let sempre = true;
  for (let s = 1; s <= 100; s++) {
    const r = E.resolverEncontro({ unidade: { capSM: { sensor: 1, gvi: 1 } }, contato: {}, fusao: 1,
                                   etapaAlvo: ULTIMA, rng: mulberry32(s) }, certo);
    if (!r.apresado) sempre = false;
  }
  ok(sempre, 'p = 1 em todas as etapas ⇒ apresamento sempre');
  const impossivel = { ...P, P_BASE: { ...P.P_BASE, identificacao: 0 } };
  let nunca = true;
  for (let s = 1; s <= 100; s++) {
    const r = E.resolverEncontro({ unidade: NPAOC, contato: {}, fusao: 1, etapaAlvo: ULTIMA, rng: mulberry32(s) }, impossivel);
    if (r.etapaAtingida && r.etapaAtingida !== 'deteccao') nunca = false;
  }
  ok(nunca, 'p = 0 numa etapa ⇒ o encontro nunca a ultrapassa');
}
{
  let limitado = true;
  for (let a = 0; a <= 100; a += 5)
    for (const g of [0, 0.05, 0.3, 1, 2])
      for (const neg of Object.keys(P.FATOR_NEGABILIDADE)) {
        const n = A.acumularEvidencia(a, g, { negabilidade: neg, fusao: 0.5 });
        if (n < a || n > 100) limitado = false;
      }
  ok(limitado, 'atribuição nunca diminui e nunca passa de 100');
  ok(A.acumularEvidencia(20, 0.3, { negabilidade: 'muito_alta' }) < A.acumularEvidencia(20, 0.3, { negabilidade: 'media' }),
     'negabilidade muito alta rende menos evidência que média');
  ok(A.acumularEvidencia(20, 0.3, { fusao: 0 }) < A.acumularEvidencia(20, 0.3, { fusao: 1 }),
     'fusão melhor rende mais evidência');
  ok(A.acumularEvidencia(20, 0.3, { ritmo: 0.5 }) < A.acumularEvidencia(20, 0.3, { ritmo: 1 }) &&
     A.acumularEvidencia(20, 0.3, { ritmo: 0 }) === 20,
     'ritmo de evidência (gancho da dificuldade) desacelera a atribuição');
  eq(A.acumularEvidencia(100, 1), 100, 'atribuição plena é ponto fixo');
}
{
  eq(['nula', 'fragil', 'parcial', 'robusta', 'plena'],
     [0, 10, 40, 70, 100].map(a => A.classificarAtribuicao(a)),
     'classes de atribuição nos limites');
  eq([0.95, 0.9, 0.6, 0.59, 0.3, 0.29, 0].map(p => E.rotuloProbabilidade(p)),
     ['quase certo', 'quase certo', 'provável', 'arriscado', 'arriscado', 'remoto', 'remoto'],
     'rótulos de probabilidade nos limites');
  eq(E.formatarProbabilidade(0.723, true), 'provável (72%)', 'boletim com números');
  eq(E.formatarProbabilidade(0.723, false), 'provável', 'boletim sem números');
}

console.log(`\nSM-1: ${pass} verificações — ALL PASS`);
