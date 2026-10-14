'use strict';
/**
 * test_sm_infocog.js — Testes da Fase SM-7 (dimensão informacional e
 * cognitiva: apoio público, desinformação × campanhas, custo político e ROE).
 *
 * Critérios de aceitação cobertos (Conceito v1.6 §13):
 *   - o apoio público move o custo político e a largura da ROE;
 *   - as campanhas são ações próprias (do COMPAAz, com capacidade e prazo).
 * Mais o teto de custo político (derrota estratégica, §11.3).
 *
 * Uso: node scripts/test_sm_infocog.js
 */

const assert = require('assert');
const { PARAMS: P } = require('../shared/sm/params');
const IC = require('../shared/sm/infocog');
const C2 = require('../shared/sm/c2');
const CA = require('../shared/sm/campaign');

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
const lanca = fn => { try { fn(); return false; } catch { return true; } };
const I = P.INFOCOG;
const U = C2.criarC2({ modalidade: 'unico' });
const AZ = 'agente:azul', VM = 'motor';
const comApoio = apoio => ({ ...IC.criarEstadoInfocog(), apoio });
const apresarFragil = (e, turno = 1, id = 'A1') => IC.registrarAcaoAzul(e, { turno, etapa: 'apresamento', atribuicao: 20, nivel: 2, tipoAcao: 'apresamento', id });

// ─── Estado inicial ──────────────────────────────────────────────────────────
{
  const e = IC.criarEstadoInfocog();
  eq([e.apoio, e.custoPolitico, e.derrotaEstrategica], [I.apoioInicial, 0, false], 'apoio inicial, custo político zero');
  ok(CA.iniciarCampanha({ seed: 1 }).infocog.apoio === I.apoioInicial, 'a campanha nasce com o indicador de apoio público');
}

// ─── Apoio público modula o custo político ───────────────────────────────────
{
  ok(Math.abs(IC.multiplicadorCusto(I.apoioReferencia) - 1) < 1e-12, 'na referência o custo não é modulado');
  ok([0, 20, 40, 60, 80, 100].every((a, i, arr) => i === 0 || IC.multiplicadorCusto(a) < IC.multiplicadorCusto(arr[i - 1])),
     'quanto menor o apoio, maior o multiplicador de custo');
  const baixo = apresarFragil(comApoio(20)).custo, normal = apresarFragil(comApoio(60)).custo, alto = apresarFragil(comApoio(90)).custo;
  ok(baixo > normal && normal > alto && alto > 0, 'a mesma ação frágil custa mais com apoio baixo e menos com apoio alto');
}

// ─── Custo político (§11.3) ──────────────────────────────────────────────────
{
  const e0 = IC.criarEstadoInfocog();
  const fundada = IC.registrarAcaoAzul(e0, { turno: 1, etapa: 'apresamento', atribuicao: 90, nivel: 2, tipoAcao: 'apresamento', id: 'A0' });
  ok(fundada.custo === 0 && fundada.estado === e0, 'ação autorizada e bem fundamentada não tem custo nem efeito');
  const { estado: e1, custo } = apresarFragil(e0);
  ok(custo > 0 && e1.custoPolitico === custo && e1.apoio < e0.apoio, 'apresar com atribuição frágil gera custo e reduz o apoio');
  ok(e1.gatilhos.includes('A1'), 'a ação frágil vira gatilho explorável pela desinformação');
  const exc = IC.registrarAcaoAzul(e0, { turno: 1, nivel: 0, tipoAcao: 'abordagem_coercitiva' }).custo;
  ok(Math.abs(exc - I.custo.pesoExcesso * 2) < 1e-12, 'força acima do autorizado: custo = peso × níveis de excesso');
  const dano = IC.registrarAcaoAzul(e0, { turno: 1, danosTerceiros: 2 }).custo;
  ok(Math.abs(dano - 2 * I.custo.pesoDanos) < 1e-12, 'danos a terceiros entram no custo');
  let e = e0, t = 0;
  while (!e.derrotaEstrategica && t < 200) e = IC.registrarAcaoAzul(e, { turno: ++t, nivel: 0, tipoAcao: 'emprego_forca' }).estado;
  ok(e.derrotaEstrategica && e.custoPolitico > I.tetoCustoPolitico, 'custo político acima do teto ⇒ derrota estratégica Azul');
  eq(IC.metricas(e).derrota_estrategica, 1, 'a derrota estratégica aparece nas métricas');
}

// ─── Apoio público move a ROE ────────────────────────────────────────────────
{
  eq([10, 29, 30, 74, 75, 100].map(a => IC.larguraRoe(a)), [-1, -1, 0, 0, 1, 1], 'faixas de largura da ROE');
  const n2baixo = IC.roeEfetiva(2, 20), n2normal = IC.roeEfetiva(2, 60), n1alto = IC.roeEfetiva(1, 85);
  ok(n2baixo.tetoRoe === P.NIVEIS[1].tetoRoe && !n2baixo.acoes.includes('apresamento'), 'apoio baixo em N2: ROE estreitada ao degrau de N1');
  eq(n2normal.acoes, P.NIVEIS[2].acoes, 'apoio normal: ROE do próprio nível');
  ok(n1alto.tetoRoe === P.NIVEIS[2].tetoRoe && n1alto.acoes.includes('abordagem_coercitiva'), 'apoio alto em N1: ROE ampliada ao degrau de N2');
  ok(!IC.roeEfetiva(2, 99).acoes.includes('emprego_forca'), 'apoio alto nunca autoriza emprego de força fora de N3');
  ok(IC.roeEfetiva(3, 5).acoes.includes('emprego_forca'), 'em N3 o emprego de força permanece mesmo com apoio baixo');
  eq(IC.roeEfetiva(0, 5).acoes, P.NIVEIS[0].acoes, 'N0 não estreita abaixo da Rotina');
  // Encadeado: desinformação derruba o apoio ⇒ ROE estreita e a ação encarece.
  let e = comApoio(40);
  const custoAntes = apresarFragil(e).custo;
  while (IC.larguraRoe(e.apoio) >= 0) e = IC.lancarDesinformacao(e, U, { quem: VM, turno: 1 });
  ok(IC.roeEfetiva(2, e.apoio).largura === -1 && apresarFragil(e).custo > custoAntes,
     'desinformação reduz o apoio ⇒ ROE mais estreita e custo político maior');
}

// ─── Eventos no mar ──────────────────────────────────────────────────────────
{
  const e0 = IC.criarEstadoInfocog();
  for (const [tipo, delta] of Object.entries(I.eventosMar)) {
    ok(Math.abs(IC.registrarEventoMar(e0, tipo, 1).apoio - (e0.apoio + delta)) < 1e-12, `evento no mar "${tipo}" move o apoio em ${delta}`);
  }
  ok(IC.registrarEventoMar(comApoio(99), 'sar_sucesso', 1).apoio === 100 && IC.registrarEventoMar(comApoio(1), 'sar_falha', 1).apoio === 0,
     'o apoio fica em 0–100');
  ok(lanca(() => IC.registrarEventoMar(e0, 'parada_naval', 1)), 'evento desconhecido é recusado');
}

// ─── Desinformação Vermelha ──────────────────────────────────────────────────
{
  const e0 = apresarFragil(IC.criarEstadoInfocog()).estado;
  ok(lanca(() => IC.lancarDesinformacao(e0, U, { quem: AZ, turno: 2 })), 'Azul não lança desinformação (só o controlador Vermelho)');
  const fab = e0.apoio - IC.lancarDesinformacao(e0, U, { quem: VM, turno: 2 }).apoio;
  const real = e0.apoio - IC.lancarDesinformacao(e0, U, { quem: VM, turno: 2, gatilho: 'A1' }).apoio;
  ok(Math.abs(fab - I.desinformacao.base) < 1e-12 && Math.abs(real - fab * I.desinformacao.gatilhoReal) < 1e-12,
     'desinformação sobre incidente real rende mais que a fabricada');
  const meia = e0.apoio - IC.lancarDesinformacao(e0, U, { quem: VM, turno: 2, intensidade: 0.5 }).apoio;
  ok(Math.abs(meia - fab / 2) < 1e-12, 'efeito proporcional à intensidade');
  const x1 = C2.criarC2({ modalidade: '1x1', controladores: { azul: 'h:A', vermelho: 'h:V' } });
  ok(!lanca(() => IC.lancarDesinformacao(e0, x1, { quem: 'h:V', turno: 2 })), 'no 1×1 o jogador Vermelho decide a desinformação');
}

// ─── Campanhas informacionais Azuis ──────────────────────────────────────────
{
  const e0 = IC.criarEstadoInfocog();
  ok(lanca(() => IC.lancarCampanha(e0, U, { quem: AZ, turno: 1, tipo: 'desinformacao' })), 'Azul não dispõe de desinformação no catálogo');
  const D = C2.criarC2({ modalidade: 'distribuido', controladores: Object.fromEntries(P.ESTACOES.map((s, i) => [s.id, `h:${i}`])) });
  ok(lanca(() => IC.lancarCampanha(e0, D, { quem: D.controle['Com1ºDN'], turno: 1, tipo: 'comunicacao_estrategica' })),
     'campanha é ação do COMPAAz (um DN não a lança)');
  const r1 = IC.lancarCampanha(e0, U, { quem: AZ, turno: 1, tipo: 'comunicacao_estrategica' });
  const r2 = IC.lancarCampanha(r1.estado, U, { quem: AZ, turno: 1, tipo: 'transparencia' });
  ok(r1.aceita && !r2.aceita && r2.motivo === 'sem_capacidade_no_turno', 'uma campanha por turno (consome a capacidade do COMPAAz)');
  ok(r1.estado.apoio === e0.apoio, 'no turno do lançamento a campanha ainda não atua');
  const t1 = IC.avancarTurno(r1.estado, 1);
  ok(!t1.registro.some(x => x.motivo.startsWith('campanha:')), 'antes do prazo, sem efeito');
  const t2 = IC.avancarTurno(t1, 2);
  const ef = t2.registro.find(x => x.motivo === 'campanha:comunicacao_estrategica');
  ok(ef && Math.abs(ef.delta - I.campanhas.comunicacao_estrategica.ganho) < 1e-12, 'no turno seguinte a campanha eleva o apoio');
  const comFusao = f => IC.avancarTurno(IC.lancarCampanha(e0, U, { quem: AZ, turno: 1, tipo: 'comunicacao_estrategica', fusao: f }).estado, 2)
    .registro.find(x => x.motivo.startsWith('campanha:')).delta;
  ok(comFusao(1) > comFusao(0.2), 'a eficácia da campanha depende da fusão');
  ok(IC.lancarCampanha(e0, U, { quem: AZ, turno: 1, tipo: 'prova_documentada' }).motivo === 'sem_prova', 'prova documentada exige prova');
  const comProva = a => IC.avancarTurno(IC.lancarCampanha(e0, U, { quem: AZ, turno: 1, tipo: 'prova_documentada', prova: { atribuicao: a } }).estado, 2)
    .registro.find(x => x.motivo.startsWith('campanha:')).delta;
  ok(comProva(90) > comProva(30) && comProva(30) > 0, 'a eficácia da prova cresce com a atribuição que ela documenta');
}
{
  // Prebunking protege; transparência esclarece o gatilho.
  let e = apresarFragil(IC.criarEstadoInfocog()).estado;
  e = IC.avancarTurno(IC.lancarCampanha(e, U, { quem: AZ, turno: 1, tipo: 'prebunking' }).estado, 2);
  const D = I.campanhas.prebunking.duracao;
  const golpe = turno => e.apoio - IC.lancarDesinformacao(e, U, { quem: VM, turno }).apoio;
  ok(Math.abs(golpe(2) - I.desinformacao.base * (1 - I.campanhas.prebunking.protecao)) < 1e-12 && golpe(2 + D - 1) === golpe(2),
     `prebunking reduz a desinformação durante ${D} turnos`);
  ok(Math.abs(golpe(2 + D) - I.desinformacao.base) < 1e-12, 'depois da duração a proteção acaba');
  let f = apresarFragil(IC.criarEstadoInfocog()).estado;
  f = IC.avancarTurno(IC.lancarCampanha(f, U, { quem: AZ, turno: 1, tipo: 'transparencia', esclarece: 'A1' }).estado, 2);
  ok(!f.gatilhos.includes('A1'), 'transparência esclarece a ação frágil');
  const d = f.apoio - IC.lancarDesinformacao(f, U, { quem: VM, turno: 3, gatilho: 'A1' }).apoio;
  ok(Math.abs(d - I.desinformacao.base) < 1e-12, 'esclarecido o gatilho, a desinformação conta como fabricada');
}

// ─── Dinâmica e reprodutibilidade ────────────────────────────────────────────
{
  let e = comApoio(20);
  for (let t = 1; t <= 200; t++) e = IC.avancarTurno(e, t);
  ok(Math.abs(e.apoio - I.apoioReferencia) < 0.1, 'sem eventos, o apoio volta à referência');
  const roteiro = () => {
    let s = IC.criarEstadoInfocog();
    for (let t = 1; t <= 30; t++) {
      if (t % 4 === 0) s = apresarFragil(s, t, `A${t}`).estado;
      if (t % 5 === 0) s = IC.lancarDesinformacao(s, U, { quem: VM, turno: t, gatilho: `A${t - 1}` });
      if (t % 3 === 0) s = IC.lancarCampanha(s, U, { quem: AZ, turno: t, tipo: 'comunicacao_estrategica', fusao: 0.7 }).estado;
      s = IC.registrarEventoMar(s, t % 2 ? 'reprimida' : 'dano_infra', t);
      s = IC.avancarTurno(s, t);
    }
    return s;
  };
  eq(roteiro(), roteiro(), 'mesmo roteiro ⇒ mesmo estado (determinístico)');
  const e0 = IC.criarEstadoInfocog(), copia = JSON.parse(JSON.stringify(e0));
  apresarFragil(e0); IC.lancarDesinformacao(e0, U, { quem: VM, turno: 1 }); IC.avancarTurno(e0, 1);
  eq(e0, copia, 'as funções não mudam o estado recebido');
}

// ─── Boletim ─────────────────────────────────────────────────────────────────
{
  const e = CA.iniciarCampanha({ seed: 1 });
  const b = CA.gerarBoletim({ ...e, infocog: comApoio(20) });
  ok(b.informacional.apoio_publico === 20 && b.informacional.roe.largura === -1 && b.linhas.some(l => /Apoio público 20%.*ROE estreitada/.test(l)),
     'o boletim mostra apoio público, custo político e largura da ROE');
}

console.log(`\nSM-7: ${pass} verificações — ALL PASS`);
