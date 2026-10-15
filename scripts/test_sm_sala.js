'use strict';
/**
 * test_sm_sala.js — Testes da Fase SM-9 (sala interativa sobre o motor de
 * turno): modalidades, papéis, fluxo do turno, Célula Branca e equivalência
 * com o lote.
 *
 * Critérios cobertos (Conceito v1.6 §7.3, §8.5; Desenho v1.3 §8):
 *   - o motor de turno com todas as decisões pela doutrina reproduz o lote;
 *   - a troca de modalidade não altera as regras: as mesmas ordens dadas por
 *     um jogador único ou repartidas por seis estações distribuídas dão a
 *     mesma campanha;
 *   - papéis isolados; o COMPAAz autoriza a escalada; a Célula Branca
 *     intervém (injeta, anula lance) com registro.
 *
 * Uso: node scripts/test_sm_sala.js
 */

const assert = require('assert');
const { PARAMS: P } = require('../shared/sm/params');
const S  = require('../shared/sm/sala');
const EG = require('../shared/sm/engine');
const R  = require('../shared/sm/runner');

let pass = 0;
function ok(cond, msg) { assert.ok(cond, msg); console.log('✅ ' + msg); pass++; }
function eq(a, b, msg) { assert.deepStrictEqual(a, b, `${msg} — esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); console.log('✅ ' + msg); pass++; }
const lanca = fn => { try { fn(); return false; } catch { return true; } };
const ESTACOES = P.ESTACOES.map(e => e.id);
const BASE = { seed: 4242, duracaoDias: 30, dificuldade: 'intermediario' };

// ─── Motor de turno = lote ───────────────────────────────────────────────────
{
  const p = EG.criarPartida({ ...R.CFG_PESQUISA, seed: 5003 });
  while (!p.encerrada) { p.iniciarTurno(); p.situacaoAzul(); p.decidirAzul({}); p.fecharTurno(); }
  eq(p.resultado(), R.jogarPartida({ ...R.CFG_PESQUISA, seed: 5003 }), 'motor de turno com a doutrina = partida do lote (consultar a visão não altera nada)');
  const q = EG.criarPartida({ ...R.CFG_PESQUISA, seed: 5003 });
  ok(lanca(() => q.decidirAzul()) && lanca(() => q.fecharTurno()), 'etapas fora de ordem são recusadas');
}

// ─── Assentos por modalidade ─────────────────────────────────────────────────
eq(S.assentosDa('unico'), ['azul'], 'jogador único: um assento Azul');
eq(S.assentosDa('1x1'), ['azul', 'vermelho'], 'confronto 1×1: Azul e Vermelho');
eq(S.assentosDa('distribuido', true), [...ESTACOES, 'celula'], 'distribuído: seis estações e a Célula Branca');
ok(lanca(() => S.criarSala({ codigo: 'X', cfg: { ...BASE, modalidade: '1x1', celulaBranca: true } })), 'Célula Branca só no distribuído');
ok(lanca(() => S.criarSala({ codigo: 'X', cfg: { ...BASE, modalidade: '1x1', trilhas: { defesa: false } } })), '1×1 sem trilha de defesa é recusado');
{
  const s = S.criarSala({ codigo: 'A', cfg: { ...BASE } });
  ok(lanca(() => s.iniciar()), 'sem jogador Azul a partida não inicia');
  s.ocupar('azul', { id: 'u1', nome: 'Ana' });
  ok(lanca(() => s.ocupar('azul', { id: 'u2' })), 'assento ocupado não aceita outro jogador');
  s.iniciar();
  ok(s.fase === 'azul' && s.partida.turno === 1, 'único: o Vermelho é o motor e o turno 1 espera o Azul');
  const v = s.vista('azul');
  ok(v.meta.papel === 'azul' && v.situacao.meios.length > 0 && !('verdade' in v.situacao) && v.meta.aguardando.join() === 'azul',
     'visão Azul: quadro comum e meios, sem a verdade do motor');
  s.enviar('azul', 'ordens', {});
  ok(s.partida.turno === 2 && s.fase === 'azul', 'ordens enviadas ⇒ o turno se resolve e o próximo começa');
}

// ─── Mesmas ordens, modalidades diferentes ───────────────────────────────────
// Política roteirizada (a mesma nas duas salas): cada estação designa o
// primeiro meio disponível ao primeiro contato da sua jurisdição; o COMPAAz
// pede PF onde há narcotráfico e faz comunicação estratégica a cada 3 turnos.
function ordensRoteiro(sit) {
  const des = [];
  for (const est of ESTACOES.filter(e => e !== 'COMPAAz')) {
    const meios = sit.meios.filter(m => m.estacao === est && m.disponivel && EG.CONSTABULAR.has(m.type));
    const contatos = est === 'ComemCh' ? sit.contatosHibridos.map(h => h.id)
      : [...sit.contatosHibridos.filter(h => h.responsavel === est).map(h => h.id), ...sit.ocorrencias.filter(o => o.responsavel === est).map(o => o.id)];
    contatos.slice(0, meios.length).forEach((c, k) => des.push({ estacao: est, meio: meios[k].id, contato: c }));
  }
  const narco = sit.ocorrencias.find(o => o.tipo === 'narcotrafico');
  const acionar = sit.turno === 1 ? sit.meios.filter(m => ['sar', 'fpe'].includes(m.escalao)).map(m => m.id) : [];
  return { des, pedidos: narco ? [{ apoio: 'pf', area: narco.area }] : [], campanha: sit.turno % 3 === 0 ? { tipo: 'comunicacao_estrategica' } : null, acionar };
}
function jogar(modalidade) {
  const s = S.criarSala({ codigo: modalidade, cfg: { ...BASE, modalidade } });
  const ids = modalidade === 'unico' ? ['azul'] : ESTACOES;
  ids.forEach((a, k) => s.ocupar(a, { id: `h${k}`, nome: a }));
  s.iniciar();
  while (s.fase !== 'encerrada') {
    if (s.fase === 'escalada') { s.enviar(modalidade === 'unico' ? 'azul' : 'COMPAAz', 'autorizar', { autorizado: true }); continue; }
    const o = ordensRoteiro(s.partida.situacaoAzul());
    if (modalidade === 'unico') s.enviar('azul', 'ordens', { designacoes: o.des, pedidos: o.pedidos, campanha: o.campanha, acionar: o.acionar });
    else for (const est of ESTACOES) {
      const meus = s.partida.situacaoAzul().meios.filter(m => m.estacao === est).map(m => m.id);
      s.enviar(est, 'ordens', {
        designacoes: o.des.filter(x => x.estacao === est),
        ...(est === 'COMPAAz' ? { pedidos: o.pedidos, campanha: o.campanha } : {}),
        acionar: o.acionar.filter(id => meus.includes(id)),
      });
    }
  }
  return s.partida.resultado();
}
{
  const u = jogar('unico'), d = jogar('distribuido');
  ok(u.metricas.ocorr_reprimidas > 0 && u.metricas.n_apoios_concedidos > 0, 'a campanha roteirizada exercita respostas e apoios');
  eq(d, u, 'mesmas ordens: jogador único e seis estações distribuídas dão a mesma campanha');
}

// ─── Papéis isolados no distribuído ──────────────────────────────────────────
{
  const s = S.criarSala({ codigo: 'D', cfg: { ...BASE, modalidade: 'distribuido' } });
  s.ocupar('Com1ºDN', { id: 'a', nome: 'DN1' }); s.ocupar('COMPAAz', { id: 'b', nome: 'CP' });
  s.iniciar();
  const sit = s.partida.situacaoAzul();
  const meio2 = sit.meios.find(m => m.estacao === 'Com2ºDN').id;
  ok(lanca(() => s.enviar('Com1ºDN', 'ordens', { designacoes: [{ estacao: 'Com2ºDN', meio: meio2, contato: 'X' }] })), 'um DN não dá ordens a outro');
  ok(lanca(() => s.enviar('Com1ºDN', 'ordens', { pedidos: [{ apoio: 'pf', area: '1DN' }] })), 'só o COMPAAz pede apoio');
  ok(lanca(() => s.enviar('Com1ºDN', 'ordens', { campanha: { tipo: 'transparencia' } })), 'só o COMPAAz lança campanha');
  ok(lanca(() => s.enviar('Com2ºDN', 'ordens', {})), 'assento vazio (agente) não recebe ordens humanas');
  s.enviar('Com1ºDN', 'ordens', {});
  ok(s.fase === 'azul' && s.vista('COMPAAz').meta.aguardando.join() === 'COMPAAz', 'o turno espera todos os assentos Azuis humanos');
  s.enviar('COMPAAz', 'ordens', {});
  ok(s.partida.turno === 2, 'com todos os humanos, o turno se resolve (as demais estações pela doutrina)');
  ok(s.vista('COMPAAz').meta.assentos.filter(a => a.agente).length === 4, 'os quatro assentos vazios aparecem como agentes');
}

// ─── Célula Branca: Vermelho, escalada, anulação ─────────────────────────────
{
  const s = S.criarSala({ codigo: 'C', cfg: { ...BASE, modalidade: 'distribuido', celulaBranca: true } });
  s.ocupar('COMPAAz', { id: 'p', nome: 'CP' }); s.ocupar('Com1ºDN', { id: 'q', nome: 'DN1' }); s.ocupar('celula', { id: 'w', nome: 'CB' });
  s.iniciar();
  ok(s.fase === 'vermelho' && s.vista('celula').meta.aguardando.join() === 'celula', 'com Célula Branca, o lance Vermelho espera a arbitragem');
  ok(lanca(() => s.enviar('COMPAAz', 'vermelho', { motor: true })), 'Azul não decide o Vermelho');
  s.enviar('celula', 'vermelho', { motor: true });
  ok(s.fase === 'azul', 'a Célula Branca pode deixar o Vermelho com o motor');
  const vc = s.vista('celula');
  ok(vc.meta.papel === 'celula' && 'verdade' in vc.situacao && vc.situacao.vermelho, 'visão da Célula Branca: tudo, inclusive a verdade do motor');
  // Anular um lance Azul ainda não resolvido.
  const sit = s.partida.situacaoAzul();
  // Turno 1: nada acionado ainda; o Navio SAR (pronto de imediato) é acionado e empregado na mesma ordem.
  const meio = sit.meios.find(m => m.estacao === 'Com1ºDN' && m.escalao === 'sar');
  s.enviar('Com1ºDN', 'ordens', { acionar: [meio.id], designacoes: [{ estacao: 'Com1ºDN', meio: meio.id, patrulha: true }] });
  const lance = s.vista('celula').meta.lancesPendentes[0].lance;
  ok(lanca(() => s.enviar('celula', 'celula', { tipo: 'anular_lance', payload: { lanceId: lance }, justificativa: ' ' })), 'anulação sem justificativa é recusada');
  s.enviar('celula', 'celula', { tipo: 'anular_lance', payload: { lanceId: lance }, justificativa: 'viola o roteiro do exercício' });
  // Evento injetado: ataque armado atribuído ⇒ proposta de N3 no próximo turno.
  s.enviar('celula', 'celula', { tipo: 'injetar_evento', payload: { evento: { tipo: 'ataque_armado', atribuicao: 90 } }, justificativa: 'objetivo: decisão de escalada' });
  s.enviar('COMPAAz', 'ordens', {});
  ok(!s.partida.situacaoAzul().registro.some(r => r.meio === meio.id), 'o lance anulado não é executado');
  s.enviar('celula', 'vermelho', { motor: true });
  s.enviar('COMPAAz', 'ordens', {}); s.enviar('Com1ºDN', 'ordens', {});
  const v = s.vista('COMPAAz');
  ok(s.fase === 'escalada' && v.meta.proposta?.para === 3 && v.meta.aguardando.join() === 'COMPAAz', 'proposta de escalada espera o COMPAAz');
  ok(lanca(() => s.enviar('Com1ºDN', 'autorizar', { autorizado: true })), 'só o COMPAAz autoriza a escalada');
  s.enviar('COMPAAz', 'autorizar', { autorizado: false });
  ok(s.partida.situacaoAzul().postura.nivel === 0 && s.fase === 'vermelho', 'COMPAAz nega ⇒ a postura não muda');
  eq(s.partida.situacaoCelula().registroCelula.map(r => r.tipo), ['anular_lance', 'injetar_evento'], 'intervenções da Célula Branca registradas');
}

// ─── Célula Branca: crise constabular injetada, jogada até o marco de resposta ─
{
  const s = S.criarSala({ codigo: 'K', cfg: { ...BASE, modalidade: 'distribuido', celulaBranca: true } });
  s.ocupar('COMPAAz', { id: 'p', nome: 'CP' }); s.ocupar('celula', { id: 'w', nome: 'CB' });
  s.iniciar();
  s.enviar('celula', 'celula', { tipo: 'injetar_crise', payload: { tipo: 'pesca_massa', area: '5DN', inicio: 2 }, justificativa: 'carga constabular no flanco sul' });
  const crise = s.partida.situacaoCelula().registroCelula.length;
  let viu = false;
  for (let k = 0; k < 8 && !s.partida.encerrada; k++) {
    s.enviar('celula', 'vermelho', { motor: true });
    if (s.partida.situacaoCelula().verdade.ocorrencias.some(o => /^CR-\d+-O\d+$/.test(o.id))) viu = true;
    s.enviar('COMPAAz', 'ordens', {});
    if (s.fase === 'escalada') s.enviar('COMPAAz', 'autorizar', { autorizado: false });
  }
  ok(crise === 1 && viu && s.partida.turno >= 8, 'crise constabular injetada pela Célula Branca dispara e a campanha segue até o marco de resposta');
}

// ─── Confronto 1×1 ───────────────────────────────────────────────────────────
{
  const s = S.criarSala({ codigo: 'X', cfg: { ...BASE, modalidade: '1x1' } });
  s.ocupar('azul', { id: 'a', nome: 'Azul' });
  ok(lanca(() => s.iniciar()), '1×1 sem o jogador Vermelho não inicia');
  s.ocupar('vermelho', { id: 'v', nome: 'Verm' }); s.iniciar();
  const sv = s.vista('vermelho');
  ok(s.fase === 'vermelho' && sv.meta.papel === 'vermelho' && sv.situacao.vetores.length > 0 && !('meios' in sv.situacao),
     'visão Vermelha: vetores e infraestrutura, sem os meios Azuis');
  const alvoPorto = sv.situacao.infraestrutura.find(i => i.tipo === 'porto' && sv.situacao.config.areasAtivas.includes(i.area));
  ok(lanca(() => s.enviar('vermelho', 'vermelho', { acoes: [{ vetor: 'frota_sombra', alvo: 'PLT-01' }] })) && s.partida.turno === 0,
     'ação Vermelha inválida (alvo incompatível) é recusada sem mexer no estado');
  ok(lanca(() => s.enviar('vermelho', 'vermelho', { acoes: [1, 2, 3].map(() => ({ vetor: 'frota_sombra', alvo: alvoPorto.id })) })), 'teto de ações por turno do Vermelho');
  s.enviar('vermelho', 'vermelho', { acoes: [{ vetor: 'frota_sombra', alvo: alvoPorto.id }] });
  ok(s.fase === 'azul' && s.vista('vermelho').situacao.acoes.length === 1, 'a ação Vermelha entra em jogo');
  s.enviar('azul', 'ordens', {});
  ok(s.fase === 'vermelho' && s.partida.turno === 1, 'depois do Azul, a vez volta ao Vermelho');
}

console.log(`\nSM-9 (sala): ${pass} verificações — ALL PASS`);
