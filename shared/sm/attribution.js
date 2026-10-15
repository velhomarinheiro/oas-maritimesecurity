'use strict';

/**
 * attribution.js — Mecânica de atribuição da OAS-SM (Conceito §9.2).
 *
 * A atribuição (0–100%) é a variável epistêmica central da variante: quanto a
 * Força Azul sabe sobre quem está por trás de um incidente, com que intenção e
 * com que prova. Cada etapa bem-sucedida de um encontro acrescenta evidência;
 * a evidência nunca é perdida e satura em 100.
 *
 * O dilema do jogador está em respostaAutorizada × riscoPolitico: agir além do
 * que a atribuição fundamenta é possível (a ROE é o limite rígido), mas custa
 * politicamente; esperar por evidência custa operacionalmente.
 *
 * Todas as funções são puras: não consomem aleatoriedade nem mudam argumentos.
 */

const { PARAMS: P } = require('./params');

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** Índice da etapa em P.ETAPAS; aceita nome ou índice. -1 se inválida. */
function indiceEtapa(etapa, params = P) {
  if (typeof etapa === 'number') return Number.isInteger(etapa) && etapa >= 0 && etapa < params.ETAPAS.length ? etapa : -1;
  return params.ETAPAS.indexOf(etapa);
}

/**
 * Soma evidência à atribuição.
 *
 * O ganho é a fração da distância até 100 coberta pela nova evidência, de
 * modo que a atribuição cresce com retorno decrescente e nunca passa de 100.
 *
 * @param {number} atrib   atribuição atual, 0–100
 * @param {number} ganho   ganho bruto (P.GANHO_EVIDENCIA da etapa), 0–1
 * @param {object} [opts]
 * @param {string} [opts.negabilidade]  'baixa' | 'media' | 'alta' | 'muito_alta'
 * @param {number} [opts.fusao]         qualidade da fusão, 0–1 (padrão 1)
 * @param {number} [opts.ritmo]         multiplicador do ritmo de evidência —
 *                                       gancho da névoa por dificuldade (SM-5); padrão 1
 * @returns {number} nova atribuição, 0–100, nunca menor que `atrib`
 */
function acumularEvidencia(atrib, ganho, opts = {}, params = P) {
  const base = clamp(Number(atrib) || 0, 0, 100);
  const neg  = params.FATOR_NEGABILIDADE[opts.negabilidade ?? params.NEGABILIDADE_PADRAO]
            ?? params.FATOR_NEGABILIDADE[params.NEGABILIDADE_PADRAO];
  const fusao = clamp(opts.fusao ?? 1, 0, 1);
  const modFusao = params.PISO_FUSAO_EVIDENCIA + (1 - params.PISO_FUSAO_EVIDENCIA) * fusao;
  const ritmo = Math.max(0, opts.ritmo ?? 1);
  const g = clamp((Number(ganho) || 0) * neg * modFusao * ritmo, 0, 1);
  return clamp(base + (100 - base) * g, base, 100);
}

/** 'nula' | 'fragil' | 'parcial' | 'robusta' | 'plena' */
function classificarAtribuicao(atrib, params = P) {
  const a = clamp(Number(atrib) || 0, 0, 100);
  return params.CLASSES_ATRIBUICAO.find(c => a >= c.min).classe;
}

/**
 * Etapa mais alta que a atribuição fundamenta, limitada pelo teto da ROE.
 *
 * Com atribuição plena (100) todos os limiares estão cumpridos, e a resposta
 * é o próprio teto — a resposta máxima autorizada (Desenho §8).
 *
 * @param {number} atrib           0–100
 * @param {string|number} tetoRoe  etapa máxima que a ROE permite (padrão: a última)
 * @returns {string|null} nome da etapa, ou null se o teto não permite etapa alguma
 */
function respostaAutorizada(atrib, tetoRoe = P.ETAPAS[P.ETAPAS.length - 1], params = P) {
  const teto = indiceEtapa(tetoRoe, params);
  if (teto < 0) return null;
  const a = clamp(Number(atrib) || 0, 0, 100);
  let melhor = -1;
  for (let i = 0; i <= teto; i++) {
    if (a >= params.LIMIAR_ATRIBUICAO[params.ETAPAS[i]]) melhor = i;
  }
  return melhor >= 0 ? params.ETAPAS[melhor] : null;
}

/**
 * Risco político de executar `etapa` com a atribuição `atrib` (embrião de
 * E4_custopol). Zero quando a atribuição fundamenta a etapa; cresce
 * linearmente com a distância ao limiar, ponderado pelo peso da etapa.
 */
function riscoPolitico(atrib, etapa, params = P) {
  const i = indiceEtapa(etapa, params);
  if (i < 0) return 0;
  const nome = params.ETAPAS[i];
  const a = clamp(Number(atrib) || 0, 0, 100);
  const deficit = Math.max(0, params.LIMIAR_ATRIBUICAO[nome] - a) / 100;
  return deficit * params.PESO_POLITICO[nome];
}

module.exports = {
  indiceEtapa, acumularEvidencia, classificarAtribuicao, respostaAutorizada, riscoPolitico,
};
