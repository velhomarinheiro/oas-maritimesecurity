'use strict';
/**
 * test_sm_constab.js — Testes da Fase SM-3 (gerador constabular e dupla função).
 *
 * Critérios de aceitação cobertos (Conceito v1.6 §13; Desenho v1.3 §5, §8):
 *   - incidência por área reproduzível: mesma semente ⇒ mesmas ocorrências;
 *   - a sequência de rotina não depende do acoplamento (blocagem entre
 *     condições);
 *   - acoplamento com o híbrido: saturação no flanco oposto, coberturas que
 *     o encontro revela como evento para a escada (SM-2), dispersão medida.
 *
 * Uso: node scripts/test_sm_constab.js
 */

const assert = require('assert');
const { mulberry32 } = require('../shared/rng');
const { PARAMS: P } = require('../shared/sm/params');
const C  = require('../shared/sm/constab');
const EN = require('../shared/sm/encounter');
const ES = require('../shared/sm/escalation');
const { TERRAIN_MAP, T_LAND } = require('../shared/board');

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

function campanha(seed, turnos, acoplamento = {}, cfg = {}) {
  let e = C.criarEstadoConstab({ seed, ...cfg });
  const novas = [];
  for (let t = 0; t < turnos; t++) {
    const r = C.avancarTurno(e, acoplamento);
    e = r.estado;
    novas.push(...r.novas);
  }
  return { e, novas };
}
const rotina = lista => lista.filter(o => !o.instrumentalizada).map(o => { const { cobertura: _c, ...r } = o; return r; });

// ─── Geografia ───────────────────────────────────────────────────────────────
for (const a of P.AREAS_DN) {
  const hs = C.hexesDaArea(a.id);
  ok(hs.length > 0 && hs.every(h => TERRAIN_MAP[h.row][h.col] !== T_LAND && C.areaDoHex(h.col, h.row) === a.id),
     `${a.id}: ${hs.length} hexágonos de mar, todos na faixa da área`);
}
ok(P.AREAS_DN.every((a, i, arr) => i === 0 || a.linhas[0] === arr[i - 1].linhas[1] + 1) &&
   P.AREAS_DN[0].linhas[0] === 0 && P.AREAS_DN[P.AREAS_DN.length - 1].linhas[1] === 19,
   'as quatro áreas de DN cobrem as 20 linhas sem lacuna nem sobreposição');
ok(['2DN', '1DN', '8DN', '5DN'].every(a => C.hexesDaArea(a).every(h => {
     const terra = []; for (let r = 0; r < 20; r++) for (let c = 0; c < 28; c++) if (TERRAIN_MAP[r][c] === T_LAND) terra.push([c, r]);
     return Math.min(...terra.map(([c, r]) => C.distHex(h.col, h.row, c, r))) <= P.DIST_MAX_COSTA; })),
   'ocorrências só surgem a até DIST_MAX_COSTA da costa (≈ ZEE)');

// ─── Reprodutibilidade ───────────────────────────────────────────────────────
{
  const a = campanha(42, 60), b = campanha(42, 60), c = campanha(43, 60);
  eq(a.novas, b.novas, 'mesma semente ⇒ mesmas ocorrências (60 turnos)');
  eq(a.e, b.e, 'mesma semente ⇒ mesmo estado final');
  ok(JSON.stringify(a.novas) !== JSON.stringify(c.novas), 'sementes diferentes ⇒ ocorrências diferentes');
  ok(a.novas.every(o => P.TIPOS_OCORRENCIA[o.tipo].terrenos.includes(TERRAIN_MAP[o.row][o.col])),
     'cada ocorrência surge num terreno admitido para o seu tipo');
  ok(new Set(a.novas.map(o => o.id)).size === a.novas.length, 'IDs únicos');
}
{
  const sem = campanha(7, 50), com = campanha(7, 50, { intensidade: 1, areaAlvo: '1DN' });
  eq(rotina(com.novas), rotina(sem.novas), 'a rotina é a mesma com ou sem acoplamento (blocagem)');
  ok(com.novas.some(o => o.instrumentalizada) && sem.novas.every(o => !o.instrumentalizada && !o.cobertura),
     'sem intensidade híbrida não há saturação nem cobertura');
}

// ─── Incidência por área e por tipo ──────────────────────────────────────────
{
  const T = 2000;
  const { novas } = campanha(1234, T);
  let dentro = true;
  const linhas = [];
  for (const a of P.AREAS_DN) {
    for (const [tipo, def] of Object.entries(P.TIPOS_OCORRENCIA)) {
      const lam = def.lambda[a.id];
      const obs = novas.filter(o => o.area === a.id && o.tipo === tipo).length / T;
      // 4 desvios-padrão da média de T Poisson(λ)
      if (Math.abs(obs - lam) > 4 * Math.sqrt(lam / T) + 1e-9) { dentro = false; linhas.push(`${a.id}/${tipo} λ=${lam} obs=${obs.toFixed(3)}`); }
    }
  }
  ok(dentro, `incidência observada por área × tipo bate com λ em ${T} turnos${linhas.length ? ' — ' + linhas.join('; ') : ''}`);
}
{
  const { novas } = campanha(5, 80, {}, { areasAtivas: ['8DN', '5DN'], tiposAtivos: ['pesca_iuu'] });
  ok(novas.length > 0 && novas.every(o => ['8DN', '5DN'].includes(o.area) && o.tipo === 'pesca_iuu'),
     'configurador: só áreas e tipos ativos geram ocorrências');
  ok((() => { try { C.criarEstadoConstab({ seed: 1, areasAtivas: ['9DN'] }); return false; } catch { return true; } })(),
     'área desconhecida é recusada');
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────
{
  let e = C.criarEstadoConstab({ seed: 99 });
  let r = C.avancarTurno(e); e = r.estado;
  const o = r.novas[0];
  const dur = P.TIPOS_OCORRENCIA[o.tipo].duracao;
  for (let k = 1; k < dur; k++) e = C.avancarTurno(e).estado;
  ok(e.ativas.some(x => x.id === o.id), `ocorrência segue aberta até o fim do prazo (${dur} turnos)`);
  e = C.avancarTurno(e).estado;
  ok(!e.ativas.some(x => x.id === o.id) && e.encerradas.find(x => x.id === o.id)?.status === 'escapou',
     'sem resposta no prazo, a ocorrência escapa');
}
{
  const e0 = C.criarEstadoConstab({ seed: 3 });
  const copia = JSON.parse(JSON.stringify(e0));
  C.avancarTurno(e0, { intensidade: 1 });
  eq(e0, copia, 'avancarTurno não muda o estado recebido');
}

// ─── Resposta e repressão (via motor de encontro, SM-1) ──────────────────────
function responder(e, o, seed, unidade = { type: 'patrulha_oc' }, fusao = 0.8) {
  const enc = EN.resolverEncontro({ unidade, contato: o.contato, fusao,
    etapaAlvo: P.TETO_CONSTABULAR, tetoRoe: P.TETO_CONSTABULAR, rng: mulberry32(seed) });
  return { enc, ...C.registrarResposta(e, o.id, enc) };
}
{
  let e = campanha(11, 6).e;
  let reprimiu = false, falhou = false, coerente = true;
  for (let s = 1; s <= 200 && e.ativas.length; s++) {
    const o = e.ativas[0];
    const r = responder(e, o, s);
    const exigida = P.ETAPAS.indexOf(P.TIPOS_OCORRENCIA[o.tipo].etapaRepressao);
    const atingida = r.enc.etapaAtingida ? P.ETAPAS.indexOf(r.enc.etapaAtingida) : -1;
    if (r.reprimida !== (atingida >= exigida)) coerente = false;
    if (r.reprimida) reprimiu = true; else falhou = true;
    e = r.estado;
  }
  ok(coerente, 'reprimida ⇔ o encontro chegou à etapa de repressão do tipo');
  ok(reprimiu && falhou, 'há repressões e falhas');
}
{
  // A autoridade constabular não depende do nível de escalada.
  ok(P.ETAPAS.indexOf(P.TETO_CONSTABULAR) > P.ETAPAS.indexOf(ES.tetoRoe(0)),
     'em Rotina (N0) a polícia marítima pode apresar; a ROE N0 vale só para o híbrido');
  let e = campanha(11, 3).e;
  const o = e.ativas[0];
  const nulo = C.registrarResposta(e, o.id, EN.resolverEncontro({ unidade: null, contato: o.contato, etapaAlvo: 0, rng: mulberry32(1) }));
  ok(!nulo.reprimida && nulo.estado.esforco.total === e.esforco.total && nulo.estado.ativas.find(x => x.id === o.id).esforco === 0,
     'encontro nulo não conta esforço nem reprime');
  ok((() => { try { C.registrarResposta(e, 'OC-0-0', {}); return false; } catch { return true; } })(),
     'resposta a ocorrência inexistente é recusada');
}

// ─── Dupla função: saturação, cobertura, dispersão ───────────────────────────
{
  const { novas } = campanha(21, 200, { intensidade: 1, areaAlvo: '1DN' });
  const sat = novas.filter(o => o.instrumentalizada);
  ok(sat.length > 0 && sat.every(o => o.area !== '1DN'), 'saturação só nas áreas fora do alvo híbrido (flanco oposto)');
  ok(sat.every(o => P.TIPOS_OCORRENCIA[o.tipo].exploravel > 0), 'saturação só com tipos exploráveis');
  const meia = campanha(21, 200, { intensidade: 0.5, areaAlvo: '1DN' }).novas.filter(o => o.instrumentalizada).length;
  ok(meia < sat.length, 'mais intensidade híbrida ⇒ mais saturação');
  const cob = novas.filter(o => o.cobertura);
  ok(cob.length > 0 && cob.every(o => !o.instrumentalizada), 'há coberturas entre as ocorrências de rotina');
  ok(novas.map(C.vistaDoJogador).every(o => !('cobertura' in o) && !('instrumentalizada' in o)),
     'a vista do jogador esconde cobertura e saturação (triagem)');
}
{
  // Cobertura revelada pela inspeção ⇒ evento híbrido aceito pela escada.
  let e = campanha(21, 40, { intensidade: 1, areaAlvo: '1DN' }).e;
  let alvo = e.ativas.find(o => o.cobertura);
  ok(!!alvo, 'há cobertura aberta para o teste');
  let evento = null, rotinaGerouEvento = false;
  for (let s = 1; s <= 400 && !evento; s++) {
    if (!e.ativas.some(o => o.id === alvo.id)) break;
    const r = responder(e, e.ativas.find(o => o.id === alvo.id), s, { capSM: { sensor: 1, gvi: 1 } }, 1);
    e = r.estado;
    if (r.eventoHibrido) evento = r.eventoHibrido;
  }
  ok(evento && evento.tipo === 'incidente_hibrido' && evento.origem === alvo.id && ES.TIPOS_HIBRIDOS.includes(evento.tipo),
     'inspeção de uma cobertura revela o vínculo como evento híbrido');
  const passo = ES.avancarTurno(ES.criarEstadoEscalada(0), [evento, evento, evento]);
  ok(passo.estado.nivel === 1, 'o evento revelado alimenta a escada de escalada (padrão de incidentes ⇒ N1)');
  let e2 = campanha(11, 6).e;
  for (let s = 1; s <= 200 && e2.ativas.length; s++) {
    const o = e2.ativas[0];
    const r = responder(e2, o, s, { capSM: { sensor: 1, gvi: 1 } }, 1);
    if (!o.cobertura && r.eventoHibrido) rotinaGerouEvento = true;
    e2 = r.estado;
  }
  ok(!rotinaGerouEvento, 'ocorrência de rotina (sem cobertura) nunca gera evento híbrido');
}
{
  let e = campanha(31, 30, { intensidade: 1, areaAlvo: '8DN' }).e;
  let gastoSat = 0, gastoTot = 0;
  for (let s = 1; s <= 300 && e.ativas.length; s++) {
    const o = e.ativas[s % e.ativas.length];
    const r = responder(e, o, s);
    if (r.enc.efetivo) { gastoTot++; if (o.instrumentalizada) gastoSat++; }
    e = r.estado;
  }
  const m = C.metricas(e);
  eq([m.esforco_total, m.esforco_instrumentalizado], [gastoTot, gastoSat], 'esforço contado por resposta efetiva');
  ok(Math.abs(m.E6_dispersao - gastoSat / gastoTot) < 1e-12 && m.E6_dispersao > 0,
     'E6_dispersao = esforço em ocorrências instrumentalizadas / esforço total');
  ok(m.E5_ordem === m.ocorr_reprimidas / m.n_ocorr_crim && m.E5_ordem > 0 && m.E5_ordem <= 1,
     'E5_ordem = reprimidas / geradas');
}

console.log(`\nSM-3: ${pass} verificações — ALL PASS`);
