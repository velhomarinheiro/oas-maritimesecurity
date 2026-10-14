'use strict';

/**
 * apoio.js — Apoio externo centralizado pelo COMPAAz (Conceito §7.4;
 * Desenho Experimental §2.3, §5.2).
 *
 * O COMPAAz é o canal único para meios e apoios externos à Marinha:
 *   - patrulha marítima (asa fixa), por solicitação à FAB;
 *   - interagências: PF, Receita Federal, IBAMA, CENSIPAM e cooperação de
 *     inteligência internacional (Tabela 7.2).
 * Cada pedido é uma decisão de C2 do COMPAAz (papel 'solicitar_mpa' ou
 * 'solicitar_apoio'), tem disponibilidade (pode ser negado), prazo até entrar
 * em vigor e duração; vale para uma área. Concedido, só atua sobre a ação
 * pertinente à atribuição do órgão (APOIOS[].pertinencia).
 *
 * Tratamento controlado apoio_externo (Desenho §2.3): com 0, nenhum pedido é
 * concedido. A patrulha marítima também depende do fator A_MPA (SM-6): sem a
 * aviação de patrulha na OOB, não há o que a FAB ative.
 *
 * Determinismo: a concessão sorteia de uma sub-sequência própria, derivada
 * da semente da campanha; um pedido recusado por regra (sem apoio externo,
 * sem MPA, papel errado) não consome sorteio. Estado imutável.
 */

const { PARAMS: P } = require('./params');
const { mulberry32FromState } = require('../rng');
const C2 = require('./c2');
const EN = require('./encounter');

const COLUNA_USO = { pf: 'apoio_pf', rf: 'apoio_rf', ibama: 'apoio_ibama', censipam: 'apoio_censipam', intl: 'apoio_intl' };

/**
 * @param {object} cfg
 * @param {number} cfg.seed
 * @param {0|1}   [cfg.apoioExterno]  tratamento controlado (padrão 1)
 * @param {boolean} [cfg.mpaOrganica] aviação de patrulha presente na OOB (fator A_MPA; padrão true)
 */
function criarEstadoApoio({ seed, apoioExterno = 1, mpaOrganica = true } = {}, params = P) {
  if (!Number.isInteger(seed)) throw new Error('apoio: semente inteira é obrigatória');
  if (apoioExterno !== 0 && apoioExterno !== 1) throw new Error('apoio: apoioExterno é 0 ou 1');
  return {
    apoioExterno, mpaOrganica,
    rng: (seed ^ params.SAL_APOIO) >>> 0,
    pedidos: [],
    contadores: {
      mpa_solicitada: 0, mpa_atendida: 0,
      apoio_pf: 0, apoio_rf: 0, apoio_ibama: 0, apoio_censipam: 0, apoio_intl: 0,
      n_apoios_concedidos: 0, efeito_apoio: 0,
    },
  };
}

/**
 * Pedido de apoio, decidido pelo controlador do COMPAAz.
 *
 * @param {object} estado
 * @param {object} c2      de c2.criarC2
 * @param {object} req     { quem, apoio, area, turno }
 * @returns {{estado, pedido: object|null, motivo?: string}}
 */
function solicitar(estado, c2, { quem, apoio, area, turno }, params = P) {
  const def = params.APOIOS[apoio];
  if (!def) throw new Error(`apoio: apoio desconhecido ${apoio}`);
  if (!params.AREAS_DN.some(a => a.id === area)) throw new Error(`apoio: área desconhecida ${area}`);
  const papel = apoio === 'mpa' ? 'solicitar_mpa' : 'solicitar_apoio';
  const aut = C2.autorizarDecisao(c2, { quem, estacao: 'COMPAAz', papel }, params);
  if (!aut.ok) return { estado, pedido: null, motivo: aut.motivo };

  const contadores = { ...estado.contadores };
  if (apoio === 'mpa') contadores.mpa_solicitada++;
  if (estado.apoioExterno === 0) return { estado: { ...estado, contadores }, pedido: null, motivo: 'apoio_externo_indisponivel' };
  if (apoio === 'mpa' && !estado.mpaOrganica) return { estado: { ...estado, contadores }, pedido: null, motivo: 'sem_mpa_na_oob' };

  const rng = mulberry32FromState(estado.rng);
  const concedido = rng() < def.disponibilidade;
  const pedido = {
    id: `AP-${estado.pedidos.length + 1}`, apoio, area, turnoPedido: turno, concedido,
    vigenteDe: turno + def.prazo, vigenteAte: turno + def.prazo + def.duracao - 1,
  };
  if (concedido) {
    contadores.n_apoios_concedidos++;
    if (apoio === 'mpa') contadores.mpa_atendida++;
  }
  return {
    estado: { ...estado, rng: rng.state, pedidos: [...estado.pedidos, pedido], contadores },
    pedido,
    motivo: concedido ? undefined : 'indisponivel',
  };
}

/** Apoios concedidos e em vigor no turno, na área. */
function vigentes(estado, turno, area) {
  return estado.pedidos.filter(p => p.concedido && p.area === area && turno >= p.vigenteDe && turno <= p.vigenteAte);
}

function pertinente(def, tipo) { return def.pertinencia.includes('*') || def.pertinencia.includes(tipo); }

/**
 * Moduladores que os apoios em vigor dão a uma ação.
 * @param {{turno, area, tipo}} ctx  tipo = tipo de ocorrência (SM-3) ou 'hibrido'
 */
function modificadores(estado, { turno, area, tipo }, params = P) {
  const m = { fatorCapacidade: 1, bonusFusao: 0, fatorRitmo: 1, apoios: [] };
  const vistos = new Set();
  for (const p of vigentes(estado, turno, area)) {
    const def = params.APOIOS[p.apoio];
    if (!pertinente(def, tipo) || vistos.has(p.apoio)) continue;   // o mesmo apoio duas vezes não soma
    vistos.add(p.apoio);
    m.apoios.push(p.apoio);
    if (def.fatorCapacidade) m.fatorCapacidade = Math.max(m.fatorCapacidade, def.fatorCapacidade);
    if (def.bonusFusao) m.bonusFusao += def.bonusFusao;
    if (def.fatorRitmo) m.fatorRitmo = Math.max(m.fatorRitmo, def.fatorRitmo);
  }
  return m;
}

/** Aplica os moduladores aos argumentos do encontro (SM-1). */
function aplicar(mods, { unidade, fusao = 0, ritmo = 1 }, params = P) {
  const cap = eixo => Math.min(1, EN.capacidadeUnidade(unidade, eixo, params) * mods.fatorCapacidade);
  return {
    unidade: unidade ? { ...unidade, capSM: { sensor: cap('sensor'), gvi: cap('gvi') } } : unidade,
    fusao: Math.min(1, fusao + mods.bonusFusao),
    ritmo: ritmo * mods.fatorRitmo,
  };
}

/** Probabilidade de chegar à etapa (produto das etapas até ela). */
function pChegar(etapa, unidade, contato, fusao, params = P) {
  const fim = params.ETAPAS.indexOf(etapa);
  let p = 1;
  for (let i = 0; i <= fim; i++) p *= EN.probabilidadeEtapa(params.ETAPAS[i], unidade, contato, fusao, params);
  return p;
}

/**
 * Prepara um encontro com os apoios pertinentes em vigor: devolve os
 * argumentos modulados e registra o uso (colunas apoio_* e efeito_apoio, o
 * ganho na probabilidade de chegar à etapa-alvo).
 *
 * @param {object} ctx  { turno, area, tipo, unidade, contato, fusao, ritmo, etapa }
 * @returns {{estado, args: {unidade, fusao, ritmo}, apoios: string[], ganho: number}}
 */
function usarApoios(estado, ctx, params = P) {
  const mods = modificadores(estado, ctx, params);
  const base = { unidade: ctx.unidade, fusao: ctx.fusao ?? 0, ritmo: ctx.ritmo ?? 1 };
  if (!mods.apoios.length) return { estado, args: base, apoios: [], ganho: 0 };
  const args = aplicar(mods, base, params);
  const etapa = ctx.etapa ?? params.ETAPAS[params.ETAPAS.length - 1];
  const ganho = pChegar(etapa, args.unidade, ctx.contato, args.fusao, params)
              - pChegar(etapa, base.unidade, ctx.contato, base.fusao, params);
  const contadores = { ...estado.contadores, efeito_apoio: estado.contadores.efeito_apoio + ganho };
  for (const a of mods.apoios) if (COLUNA_USO[a]) contadores[COLUNA_USO[a]]++;
  return { estado: { ...estado, contadores }, args, apoios: mods.apoios, ganho };
}

module.exports = {
  criarEstadoApoio, solicitar, vigentes, modificadores, aplicar, usarApoios,
};
