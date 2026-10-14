'use strict';

/**
 * escalation.js — Escada de escalada da OAS-SM (Conceito §9.3–9.4).
 *
 * A postura da campanha é uma máquina de estados de quatro níveis — N0
 * Rotina, N1 Tensão, N2 Crise, N3 Conflito —, cada um com regras de
 * engajamento próprias (params.NIVEIS). A cada turno os eventos do híbrido
 * são confrontados com os gatilhos (Tabela 9.1); se algum nível acima do
 * corrente é atingido, o ComemCh propõe a subida e o COMPAAz autoriza ou nega.
 * Sem gatilho do nível corrente por TURNOS_PARA_DESESCALAR turnos seguidos,
 * propõe-se a descida de um nível.
 *
 * - Subida: vai direto ao nível mais alto cujo gatilho foi atingido (um
 *   ataque armado atribuído em plena Rotina não espera três turnos).
 * - Descida: um nível por vez.
 *
 * Em N3, e só em N3, o motor de salva do jogo base (shared/combat_engine.js)
 * resolve o engajamento — chamado sem nenhuma alteração de física; aqui só se
 * injeta o gerador semeado da campanha e se restaura o anterior.
 *
 * Determinismo: a máquina não consome aleatoriedade. O estado é imutável:
 * avancarTurno devolve um estado novo.
 *
 * Formato de evento (os módulos SM-3/SM-5 os produzem):
 *   { tipo: 'incidente_hibrido' | 'dano_infra' | 'ataque_armado' | 'emprego_aberto',
 *     atribuicao?: 0–100 }
 */

const { PARAMS: P } = require('./params');
const CE = require('../combat_engine');

const N_MAX = 3;
const TIPOS_HIBRIDOS = ['incidente_hibrido', 'dano_infra', 'ataque_armado', 'emprego_aberto'];

function nivelValido(n) { return Number.isInteger(n) && n >= 0 && n <= N_MAX; }

function infoNivel(nivel, params = P) {
  if (!nivelValido(nivel)) throw new Error(`escalation: nível inválido ${nivel}`);
  return params.NIVEIS[nivel];
}

/** Etapa máxima do motor de encontro que a ROE do nível permite. */
function tetoRoe(nivel, params = P) { return infoNivel(nivel, params).tetoRoe; }

/** A ação está entre as respostas autorizadas no nível? */
function acaoPermitida(nivel, acao, params = P) { return infoNivel(nivel, params).acoes.includes(acao); }

/** Nível mais baixo em que a ação é autorizada (null se a ação não existe). */
function nivelMinimoDaAcao(acao, params = P) {
  const n = params.NIVEIS.find(x => x.acoes.includes(acao));
  return n ? n.nivel : null;
}

/**
 * Quantos níveis acima do autorizado a ação está (0 se permitida). Base do
 * custo político por "emprego de força acima do autorizado" (Conceito §11.3).
 */
function excessoDeForca(nivel, acao, params = P) {
  const min = nivelMinimoDaAcao(acao, params);
  if (min == null) throw new Error(`escalation: ação desconhecida ${acao}`);
  return Math.max(0, min - nivel);
}

/** @param {number} [nivelInicial] postura inicial do configurador (Conceito §8.1) */
function criarEstadoEscalada(nivelInicial = 0) {
  if (!nivelValido(nivelInicial)) throw new Error(`escalation: nível inicial inválido ${nivelInicial}`);
  return {
    nivel: nivelInicial,
    nivelMax: nivelInicial,
    turno: 0,
    janela: [],                 // nº de incidentes híbridos dos últimos turnos (mais recente no fim)
    turnosCalmos: 0,            // turnos seguidos sem gatilho do nível corrente
    turnosPorNivel: [0, 0, 0, 0],
    historico: [],              // transições aplicadas
  };
}

/** Níveis cujo gatilho os eventos do turno (e a janela) atingem. */
function niveisAtingidos(janela, eventos, params = P) {
  const G = params.GATILHOS_ESCALADA;
  const hib = eventos.filter(e => TIPOS_HIBRIDOS.includes(e?.tipo));
  const atrib = e => Number(e.atribuicao) || 0;
  const ating = new Set();

  const ultimos = [...janela, hib.length].slice(-G.N1.janelaTurnos);
  const naJanela = ultimos.reduce((a, b) => a + b, 0);
  if (naJanela >= G.N1.incidentesJanela || hib.some(e => atrib(e) >= G.N1.atribuicaoMin)) ating.add(1);
  if (hib.some(e => e.tipo === 'dano_infra' && atrib(e) >= G.N2.atribuicaoMin)) ating.add(2);
  if (hib.some(e => (e.tipo === 'ataque_armado' && atrib(e) >= G.N3.atribuicaoMin) ||
                    e.tipo === 'emprego_aberto')) ating.add(3);
  return { ating, nHibridos: hib.length };
}

/**
 * Proposta de transição para o turno, sem aplicá-la. Pura.
 * @returns {{proposta: null | {de, para, direcao: 'subida'|'descida', gatilho: string},
 *            calmo: boolean, nHibridos: number}}
 */
function avaliarGatilhos(estado, eventos = [], params = P) {
  const { ating, nHibridos } = niveisAtingidos(estado.janela, eventos, params);
  const acima = [...ating].filter(n => n > estado.nivel);
  // "Calmo": nenhum gatilho do nível corrente ou acima.
  const calmo = ![...ating].some(n => n >= Math.max(1, estado.nivel));
  if (acima.length) {
    const para = Math.max(...acima);
    return { proposta: { de: estado.nivel, para, direcao: 'subida', gatilho: `gatilho_${params.NIVEIS[para].sigla}` },
             calmo: false, nHibridos };
  }
  if (estado.nivel > 0 && calmo && estado.turnosCalmos + 1 >= params.TURNOS_PARA_DESESCALAR) {
    return { proposta: { de: estado.nivel, para: estado.nivel - 1, direcao: 'descida', gatilho: 'calmaria' },
             calmo, nHibridos };
  }
  return { proposta: null, calmo, nHibridos };
}

/** Política padrão (jogador único / lote): o COMPAAz autoriza toda proposta. */
const AUTORIZA_SEMPRE = () => ({ autorizado: true, por: 'COMPAAz' });

/**
 * Fecha um turno da escada: conta o turno no nível em vigor, avalia os
 * gatilhos, submete a proposta ao COMPAAz e aplica a transição autorizada
 * (que vale a partir do turno seguinte).
 *
 * @param {object} estado    de criarEstadoEscalada
 * @param {Array}  eventos   eventos híbridos do turno
 * @param {(proposta) => {autorizado: boolean, por: string}} [decidir]
 *        decisão do COMPAAz; só uma autorização assinada pelo COMPAAz vale
 * @returns {{estado, proposta, transicao: object|null}}
 */
function avancarTurno(estado, eventos = [], decidir = AUTORIZA_SEMPRE, params = P) {
  const { proposta, calmo, nHibridos } = avaliarGatilhos(estado, eventos, params);
  const turnosPorNivel = estado.turnosPorNivel.slice();
  turnosPorNivel[estado.nivel]++;
  const janela = [...estado.janela, nHibridos].slice(-params.GATILHOS_ESCALADA.N1.janelaTurnos);

  let nivel = estado.nivel;
  let transicao = null;
  if (proposta) {
    const d = decidir(proposta) || {};
    if (d.autorizado === true && d.por === 'COMPAAz') {
      nivel = proposta.para;
      transicao = { turno: estado.turno + 1, ...proposta, conduzidaPor: 'ComemCh', autorizadaPor: 'COMPAAz' };
    }
  }

  const novo = {
    nivel,
    nivelMax: Math.max(estado.nivelMax, nivel),
    turno: estado.turno + 1,
    janela,
    turnosCalmos: transicao ? 0 : (calmo ? estado.turnosCalmos + 1 : 0),
    turnosPorNivel,
    historico: transicao ? [...estado.historico, transicao] : estado.historico,
  };
  return { estado: novo, proposta, transicao };
}

/** E3_escalada: turnos mantidos abaixo do limiar de conflito (N0–N2). */
function turnosAbaixoDoLimiar(estado) {
  return estado.turnosPorNivel[0] + estado.turnosPorNivel[1] + estado.turnosPorNivel[2];
}

/**
 * Engajamento armado no caso-limite N3: delega ao motor de salva do jogo base
 * (combat_engine.resolveEngagement) com os mesmos argumentos, sob o gerador
 * semeado da campanha. Abaixo de N3 não há salva: nada é resolvido, nenhum
 * sorteio é consumido e as unidades não mudam.
 *
 * @param {object} estado  estado da escada
 * @param {object} args    argumentos de combat_engine.resolveEngagement
 * @param {() => number} rng  gerador semeado (obrigatório)
 */
function resolverSalvaN3(estado, args, rng) {
  if (typeof rng !== 'function') throw new Error('escalation: rng semeado é obrigatório');
  if (estado.nivel < N_MAX) {
    return { ok: false, reason: 'roe_nao_autoriza_emprego_de_forca', nivel: estado.nivel };
  }
  const anterior = CE.getRng();
  CE.setRng(rng);
  try {
    return CE.resolveEngagement(args);
  } finally {
    CE.setRng(anterior);
  }
}

module.exports = {
  N_MAX, TIPOS_HIBRIDOS, AUTORIZA_SEMPRE,
  infoNivel, tetoRoe, acaoPermitida, nivelMinimoDaAcao, excessoDeForca,
  criarEstadoEscalada, avaliarGatilhos, avancarTurno, turnosAbaixoDoLimiar,
  resolverSalvaN3,
};
