'use strict';
/**
 * test_sm_terceiros.js — Testes dos custos a terceiros (SM-11; Conceito §11.3):
 * falsos alarmes, interrupção desnecessária da navegação mercante, uso de
 * força desnecessário contra mercantes e pesqueiros, e dano ambiental de
 * ação coercitiva contra o híbrido.
 *
 * Uso: node scripts/test_sm_terceiros.js
 */

const assert = require('assert');
const { PARAMS: P } = require('../shared/sm/params');
const CO = require('../shared/sm/constab');
const IC = require('../shared/sm/infocog');
const R = require('../shared/sm/runner');
const SO = require('../shared/sm/sobrescrita');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}

// ─── Falsos alarmes no gerador constabular ────────────────────────────────────
function rodar(turnos, acopl) {
  let e = CO.criarEstadoConstab({ seed: 99 });
  const novas = [];
  for (let k = 0; k < turnos; k++) { const r = CO.avancarTurno(e, acopl); e = r.estado; novas.push(...r.novas); }
  return { e, novas };
}
{
  const sem = rodar(40, { intensidade: 0.5, areaAlvo: '1DN' });
  ok(sem.novas.every(o => !o.inocente), 'sem a fusão informada, o gerador da SM-3 não cria falsos alarmes');
  const f0 = rodar(40, { intensidade: 0.5, areaAlvo: '1DN', fusao: 0 });
  const f1 = rodar(40, { intensidade: 0.5, areaAlvo: '1DN', fusao: 1 });
  const ino = r => r.novas.filter(o => o.inocente);
  ok(ino(f0).length > ino(f1).length && ino(f1).length > 0, `fusão melhor ⇒ menos falsos alarmes (${ino(f0).length} × ${ino(f1).length} em 40 turnos)`);
  const crimes = r => r.novas.filter(o => !o.inocente).map(o => `${o.id}:${o.tipo}:${o.col},${o.row}:${o.cobertura}`).join('|');
  ok(crimes(sem) === crimes(f0) && crimes(f0) === crimes(f1), 'as ocorrências criminais (rotina e saturação) não mudam com os falsos alarmes');
  ok(ino(f0).every(o => /^OC-\d+-\d+$/.test(o.id) && P.TERCEIROS.falsosAlarmes.tipos[o.inocente].aparenta === o.tipo),
     'falsos alarmes têm IDs da série de rotina e aparentam o tipo previsto');
  ok(ino(f0).every(o => !('inocente' in CO.vistaDoJogador(o))), 'a marca de inocente não chega ao jogador');
  const m = CO.metricas(f0.e);
  ok(m.n_falsos_alarmes === ino(f0).length && m.n_ocorr_crim === f0.novas.length - ino(f0).length,
     'falsos alarmes ficam fora de n_ocorr_crim (e de E5_ordem)');
  ok(f0.e.encerradas.filter(o => o.inocente).every(o => o.status === 'seguiu_viagem'), 'sem resposta, o inocente segue viagem (não "escapa")');
}
{
  const { e } = rodar(5, { intensidade: 0, fusao: 0 });
  const o = e.ativas.find(x => x.inocente);
  const enc = etapa => ({ efetivo: true, etapaAtingida: etapa, atribuicao: { antes: 0, depois: 60 } });
  const r1 = CO.registrarResposta(e, o.id, enc('abordagem'));
  ok(!r1.reprimida && !r1.descartada && r1.estado.ativas.find(x => x.id === o.id).contato.atribuicao === 0,
     'abordagem de inocente: não reprime, não esclarece, não acumula prova de crime');
  const r2 = CO.registrarResposta(e, o.id, enc('apresamento'));
  ok(!r2.reprimida && r2.descartada && r2.estado.encerradas.at(-1).status === 'descartada', 'a inspeção esclarece: falso alarme descartado, nunca reprimido');
  const r3 = CO.registrarResposta(e, o.id, enc('interrogacao'), P, { esclarecida: true });
  ok(r3.descartada, 'esclarecido na interrogação: descartado sem abordagem');
}

// ─── Custo político ───────────────────────────────────────────────────────────
{
  const e = IC.criarEstadoInfocog ? IC.criarEstadoInfocog() : null;
  if (e) {
    const base = IC.registrarAcaoAzul(e, { turno: 1, etapa: 'deteccao', atribuicao: 0 }).custo;
    const exc = IC.registrarAcaoAzul(e, { turno: 1, etapa: 'deteccao', atribuicao: 0, excessoTerceiros: 1 }).custo;
    const dan = IC.registrarAcaoAzul(e, { turno: 1, etapa: 'deteccao', atribuicao: 0, danosTerceiros: 1 }).custo;
    const mult = exc / P.INFOCOG.custo.pesoExcesso;
    ok(base === 0 && exc > 0 && Math.abs(dan / P.INFOCOG.custo.pesoDanos - mult) < 1e-12,
       'excesso e danos a terceiros entram no custo pelos pesos pesoExcesso e pesoDanos');
  }
}

// ─── Campanha ─────────────────────────────────────────────────────────────────
{
  const todos = { A_MPA: 1, B_NPaOc: 1, C_Fusao: 1, D_USV: 1, E_GVI: 1 };
  const cfg = s => ({ ...R.CFG_PESQUISA, seed: s, fatores: todos, apoioExterno: 1 });
  const SEM = SO.aplicarSobrescritas({ TERCEIROS: { falsosAlarmes: { lambda: 0 }, ambiental: { pPorVetor: { frota_sombra: 0, milicia_maritima: 0, sabotagem_submarina: 0, minagem: 0 } } } });
  const MUITO = SO.aplicarSobrescritas({ TERCEIROS: {
    falsosAlarmes: { lambda: 2, esclareceNaInterrogacao: { base: 0, porFusao: 0 } },
    forcaDesnecessaria: { pPorNivel: [1, 1, 1, 1], pDano: 1 },
    ambiental: { pPorVetor: { frota_sombra: 1, milicia_maritima: 1, sabotagem_submarina: 1, minagem: 1 }, fatorNivel: [1, 1, 1, 1] },
  } });
  const sementes = [1, 2, 3, 4, 5, 6];
  const jogar = (pp, b = false) => sementes.map(s => R.jogarPartida(cfg(s), { boletins: b }, pp));
  const a = jogar(MUITO, true), z = jogar(SEM);
  const soma = (rs, k) => rs.reduce((t, r) => t + (r.metricas[k] ?? 0), 0);
  ok(soma(z, 'n_falsos_alarmes') === 0 && soma(z, 'n_interrupcoes') + soma(z, 'n_forca_desnecessaria') + soma(z, 'n_danos_ambientais') === 0,
     'sem falsos alarmes nem chance ambiental, não há custo a terceiros');
  ok(soma(a, 'n_interrupcoes') > 0, 'situação 1: abordagem de mercante inocente interrompe a navegação');
  ok(soma(a, 'n_forca_desnecessaria') > 0 && soma(a, 'n_danos_terceiros') > 0, 'situação 2: uso de força desnecessário, com danos a terceiros');
  // Contra o híbrido a doutrina raramente chega à abordagem (a atribuição limita a etapa): mais campanhas, sem falsos alarmes.
  const AMB = SO.aplicarSobrescritas({ TERCEIROS: { falsosAlarmes: { lambda: 0 },
    ambiental: { pPorVetor: { frota_sombra: 1, milicia_maritima: 1, sabotagem_submarina: 1, minagem: 1 }, fatorNivel: [1, 1, 1, 1] } } });
  const amb = Array.from({ length: 12 }, (_, i) => R.jogarPartida(cfg(i + 1), { boletins: true }, AMB));
  ok(soma(amb, 'n_danos_ambientais') > 0, 'situação 3: ação coercitiva contra o híbrido provoca dano ambiental');
  ok(soma(a, 'E4_custopol') > soma(z, 'E4_custopol'), 'os custos a terceiros elevam o custo político');
  const linhas = [...a, ...amb].flatMap(r => r.boletins.flat());
  ok(['interrupção desnecessária', 'uso de força desnecessário', 'dano ambiental'].every(t => linhas.some(l => l.includes(t))),
     'o boletim informa as três situações');
  const MUITO2 = SO.aplicarSobrescritas({ INFOCOG: { custo: { pesoExcesso: 4, pesoDanos: 6 } } }, MUITO);
  ok(soma(jogar(MUITO2), 'E4_custopol') > soma(a, 'E4_custopol'), 'pesoExcesso e pesoDanos deixam de ser inertes');
  ok(JSON.stringify(jogar(MUITO, true)) === JSON.stringify(a.slice(0, sementes.length)), 'determinismo: mesma semente, mesmos custos a terceiros');
  const padrao = sementes.map(s => R.jogarPartida(cfg(s)));
  ok(soma(padrao, 'n_falsos_alarmes') > 0, 'com os parâmetros-padrão há falsos alarmes na campanha');
}

console.log(`\nSM-11 (terceiros): ${pass} verificações — ALL PASS`);
