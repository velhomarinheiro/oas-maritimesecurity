'use strict';
/**
 * test_sm_runner.js — Testes da Fase SM-8 (runner e coleta).
 *
 * Critérios de aceitação cobertos (Desenho Experimental v1.3 §8):
 *   - determinismo: mesma semente ⇒ exatamente a mesma campanha;
 *   - dataset no esquema da Tabela 6.1, uma linha por partida, importável
 *     (CSV UTF-8, vírgula, ponto decimal, vazio = ausente);
 *   - o lote de 1.040 partidas (940 principais + 100 do contraste) completa;
 *   - com apoio_externo = 0 nenhum apoio é concedido;
 *   - perda do KCV encerra a partida como derrota Vermelha;
 *   - a escalada a N3 joga o motor de salva do jogo base, sem alteração.
 *
 * Uso: node scripts/test_sm_runner.js
 */

const assert = require('assert');
const { PARAMS: P } = require('../shared/sm/params');
const R = require('../shared/sm/runner');

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
const media = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const CFG = R.CFG_PESQUISA;

// ─── Uma partida ─────────────────────────────────────────────────────────────
{
  const a = R.jogarPartida({ ...CFG, seed: 5001 }), b = R.jogarPartida({ ...CFG, seed: 5001 });
  eq(a, b, 'determinismo: mesma semente ⇒ mesma campanha (métricas, desfecho, terminal)');
  ok(JSON.stringify(a.metricas) !== JSON.stringify(R.jogarPartida({ ...CFG, seed: 5002 }).metricas), 'sementes diferentes ⇒ campanhas diferentes');
  const bol = R.jogarPartida({ ...CFG, seed: 5001 }, { boletins: true });
  ok(bol.boletins.length === bol.turnos && bol.boletins.every(l => l[0].startsWith('Turno')), 'boletim de situação a cada turno (opcional)');
  eq(bol.metricas, a.metricas, 'gerar boletins não altera a campanha');
}

// ─── Delineamento ────────────────────────────────────────────────────────────
{
  const d = R.delineamento();
  const por = b => d.filter(c => c.bloco === b);
  eq([por('ablacao').length, por('fatorial').length, por('contraste').length, d.length], [300, 640, 100, 1040],
     'ablação 6×50 + fatorial 32×20 + contraste 2×50 = 1.040');
  const C = R.condicoes();
  eq(C.ablacao.map(c => P.FATORES_SM.filter(f => c.fatores[f] === -1)), [[], ...P.FATORES_SM.map(f => [f])],
     'ablação: C0 com todas; C1–C5 sem cada capacidade');
  ok(new Set(C.fatorial.map(c => JSON.stringify(c.fatores))).size === 32, 'fatorial: 32 combinações distintas');
  eq(C.fatorial[0].fatores, Object.fromEntries(P.FATORES_SM.map(f => [f, -1])), 'fatorial em ordem padrão (F01 = todos −1)');
  eq(C.fatorial[1].fatores.A_MPA, 1, 'ordem de Yates: A_MPA varia mais rápido');
  ok(C.contraste.length === 2 && JSON.stringify(C.contraste[0].fatores) === JSON.stringify(C.contraste[1].fatores) &&
     C.contraste.map(c => c.apoioExterno).join() === '1,0', 'contraste: C0 com apoio externo disponível × indisponível');
  for (const b of ['ablacao', 'fatorial', 'contraste']) {
    const seeds = [...new Set(por(b).map(c => c.condicao))].map(cond => por(b).filter(c => c.condicao === cond).map(c => c.semente).join());
    ok(seeds.every(s => s === seeds[0]), `${b}: sementes espelhadas entre condições`);
  }
  ok(d.filter(c => c.bloco !== 'contraste').every(c => c.apoioExterno === 1), 'desenhos principais com apoio externo disponível');
}

// ─── Lote completo e dataset ─────────────────────────────────────────────────
const { linhas, ms } = R.rodarLote();
ok(linhas.length === 1040, `o lote de 1.040 partidas completa (${(ms / 1000).toFixed(1)} s)`);
{
  const T61 = ['bloco', 'condicao', 'replica', 'semente', 'modalidade_C2', 'apoio_externo', 'A_MPA', 'B_NPaOc', 'C_Fusao', 'D_USV', 'E_GVI',
    'n_capacidades', 'custo_total', 'E1_atrib', 'E2_infra', 'E3_escalada', 'E4_custopol', 'E5_ordem', 'E6_dispersao', 'n_ocorr_crim',
    'ocorr_reprimidas', 'mpa_solicitada', 'mpa_atendida', 'apoio_pf', 'apoio_rf', 'apoio_ibama', 'apoio_censipam', 'apoio_intl',
    'n_apoios_concedidos', 'efeito_apoio', 'sloc_idx', 'kcv_perdido', 'nivel_max'];
  eq(R.COLUNAS.slice(0, T61.length), T61, 'colunas da Tabela 6.1, na ordem (C_Fusão grafado C_Fusao)');
  ok(linhas.every(l => R.COLUNAS.every(c => c in l)), 'toda linha tem todas as colunas');
  const faixa = (k, lo, hi, nulo = false) => linhas.every(l => (nulo && l[k] === null) || (typeof l[k] === 'number' && l[k] >= lo && l[k] <= hi));
  ok(faixa('E1_atrib', 0, 1, true) && faixa('E5_ordem', 0, 1) && faixa('E6_dispersao', 0, 1) && faixa('sloc_idx', 0, 1),
     'frações E1, E5, E6 e sloc_idx em [0, 1]');
  ok(faixa('E2_infra', 0, 100) && faixa('E3_escalada', 0, 60) && faixa('E4_custopol', 0, 1e9) && faixa('nivel_max', 0, 3),
     'E2 em 0–100, E3 em turnos, E4 ≥ 0, nível máximo 0–3');
  ok(linhas.every(l => P.FATORES_SM.every(f => l[f] === 1 || l[f] === -1)), 'fatores codificados −1/+1');
  ok(linhas.every(l => l.n_capacidades === P.FATORES_SM.filter(f => l[f] === 1).length &&
       l.custo_total === P.FATORES_SM.filter(f => l[f] === 1).reduce((s, f) => s + P.CUSTO_EAC[f], 0)),
     'n_capacidades e custo_total (EAC 70/100/55/35/40) consistentes com os fatores');
  ok(linhas.filter(l => l.condicao === 'C0')[0].custo_total === 300, 'C0 custa 300 EAC');
  ok(linhas.every(l => l.modalidade_C2 === 'unico'), 'modalidade de C2 fixada em "unico" na pesquisa');

  const csv = R.paraCsv(linhas);
  const linhasCsv = csv.trimEnd().split('\n');
  ok(linhasCsv.length === 1041 && linhasCsv[0] === R.COLUNAS.join(','), 'CSV: cabeçalho + uma linha por partida');
  ok(linhasCsv.every(l => l.split(',').length === R.COLUNAS.length), 'CSV: mesmo número de campos em toda linha');
  ok(!/NaN|undefined|null|Infinity/.test(csv), 'CSV sem NaN/undefined/null — ausente é campo vazio');
  ok(Buffer.from(csv, 'utf8').toString('utf8') === csv && !csv.includes('\r'), 'CSV UTF-8 com quebras de linha LF');
  ok(linhasCsv.slice(1).every(l => l.split(',').every((v, i) => ['bloco', 'condicao', 'modalidade_C2', 'desfecho'].includes(R.COLUNAS[i]) || v === '' || Number.isFinite(Number(v)))),
     'CSV: colunas numéricas sempre numéricas (ponto decimal)');
}

// ─── Fatores, apoio e escalada no lote ───────────────────────────────────────
{
  const de = cond => linhas.filter(l => l.condicao === cond);
  ok(media(de('C0').map(l => l.E5_ordem)) > media(de('C2').map(l => l.E5_ordem)), 'sem B_NPaOc a ordem marítima (E5) cai');
  ok(media(de('C0').map(l => l.E1_atrib ?? 0)) > media(de('C3').map(l => l.E1_atrib ?? 0)), 'sem C_Fusao a atribuição (E1) cai');
  ok(de('C1').every(l => l.mpa_atendida === 0), 'sem A_MPA nenhuma patrulha marítima é atendida');
  const a0 = de('C0_apoio0'), a1 = de('C0_apoio1');
  ok(a0.every(l => l.n_apoios_concedidos === 0 && l.mpa_atendida === 0 && l.efeito_apoio === 0 &&
       l.apoio_pf + l.apoio_rf + l.apoio_ibama + l.apoio_censipam + l.apoio_intl === 0),
     'apoio_externo = 0 ⇒ nenhum apoio concedido nem usado');
  ok(a1.every(l => l.n_apoios_concedidos > 0), 'apoio_externo = 1 ⇒ apoios concedidos');
  ok(media(a1.map(l => l.E5_ordem)) > media(a0.map(l => l.E5_ordem)) && media(a1.map(l => l.E1_atrib ?? 0)) > media(a0.map(l => l.E1_atrib ?? 0)),
     'contraste: o apoio externo melhora E5 e E1');
  ok(a0.every((l, i) => l.semente === a1[i].semente), 'contraste pareado por semente');

  const n3 = linhas.filter(l => l.nivel_max === 3), abaixo = linhas.filter(l => l.nivel_max < 3);
  ok(n3.length > 0 && abaixo.length > 0, `há campanhas com e sem escalada terminal (${n3.length} em N3)`);
  ok(n3.every(l => l.atrito_terminal !== null && l.desfecho.startsWith('conflito') || l.desfecho === 'derrota_vermelha_kcv') &&
     abaixo.every(l => l.atrito_terminal === null && l.kcv_perdido === 0), 'atrito terminal e KCV só quando a escalada chega a N3');
  const kcv = linhas.filter(l => l.kcv_perdido === 1);
  ok(kcv.length > 0 && kcv.every(l => l.desfecho === 'derrota_vermelha_kcv' && l.nivel_max === 3), 'perda do KCV ⇒ derrota Vermelha');
  // A transição a N3 vale a partir do turno seguinte: todo turno jogado ficou abaixo do limiar.
  ok(n3.every(l => l.E3_escalada === l.turnos) && n3.some(l => l.turnos < CFG.duracaoDias) &&
     abaixo.every(l => l.E3_escalada === CFG.duracaoDias), 'N3 encerra a campanha; E3 = turnos abaixo do limiar');
}

// ─── N3: o motor de salva do jogo base, intocado ─────────────────────────────
{
  require('../server');
  const SIM = require('../shared/constructive_sim');
  const { FACTOR_KEYS } = require('../shared/capability_factors');
  const t = R.jogarTerminal(5001);
  const direto = SIM.runGame(Object.fromEntries(FACTOR_KEYS.map(k => [k, 1])), 5001);
  ok(t.vencedor === direto.winner && t.atrito === direto.metrics.atrito_azul && t.turnos === direto.turns,
     'a escalada terminal é a partida do jogo base com a mesma semente');
  eq(R.jogarTerminal(5001), t, 'escalada terminal reproduzível');
}

// ─── Derrota estratégica (teto de custo político) ────────────────────────────
{
  const Pbaixo = { ...P, INFOCOG: { ...P.INFOCOG, tetoCustoPolitico: 0.5 } };
  const r = R.jogarPartida({ ...CFG, seed: 5001 }, {}, Pbaixo);
  ok(r.desfecho === 'derrota_estrategica_azul' && r.turnos < CFG.duracaoDias, 'custo político acima do teto encerra a campanha em derrota estratégica Azul');
}

console.log(`\nSM-8: ${pass} verificações — ALL PASS`);
