'use strict';

/**
 * encounter.js — Motor de encontro da OAS-SM (Conceito §9.1).
 *
 * Resolve as interações abaixo do limiar do conflito armado, antes de
 * qualquer salva: detecção → identificação → interrogação → abordagem e
 * vistoria (GVI) → inspeção → apresamento. Cada etapa é um sorteio cuja
 * probabilidade depende da capacidade da unidade empregada (eixo sensor ou
 * GVI), da qualidade da fusão de dados e, nas etapas de percepção, da evasão
 * do contato. O encadeamento para na primeira falha.
 *
 * O mesmo motor serve às duas trilhas: o contato pode ser um meio do ator
 * híbrido (trilha de defesa) ou uma ocorrência criminal (trilha constabular).
 * A diferença está só nos atributos do contato (negabilidade, evasão).
 *
 * Determinismo: o gerador é argumento obrigatório (shared/rng.js); o módulo
 * nunca usa Math.random. Cada etapa tentada consome exatamente um sorteio, e
 * um encontro nulo não consome nenhum — assim um encontro que não acontece
 * não desloca a sequência da semente para o resto da campanha.
 */

const { PARAMS: P } = require('./params');
const A = require('./attribution');

function clamp01(v) { return Math.min(1, Math.max(0, v)); }

/**
 * Capacidade da unidade num eixo ('sensor' | 'gvi'), 0–1.
 * `unidade.capSM` prevalece sobre a tabela por tipo; tipo desconhecido = 0.
 */
function capacidadeUnidade(unidade, eixo, params = P) {
  if (!unidade) return 0;
  const propria = unidade.capSM?.[eixo];
  if (propria != null) return clamp01(Number(propria) || 0);
  return clamp01(params.CAPACIDADE_POR_TIPO[unidade.type]?.[eixo] ?? 0);
}

/**
 * Probabilidade de sucesso de uma etapa, 0–1. Pura.
 *
 * p = P_BASE × capacidade × (piso + (1 − piso) × fusão) × (1 − evasão*)
 * (*evasão só nas etapas de percepção)
 */
function probabilidadeEtapa(etapa, unidade, contato, fusao, params = P) {
  const i = A.indiceEtapa(etapa, params);
  if (i < 0) return 0;
  const nome = params.ETAPAS[i];
  const cap = capacidadeUnidade(unidade, params.EIXO_ETAPA[nome], params);
  const f = clamp01(Number(fusao) || 0);
  const piso = params.PISO_FUSAO[nome];
  const modFusao = piso + (1 - piso) * f;
  const evasao = params.ETAPAS_COM_EVASAO.includes(nome) ? clamp01(contato?.evasao ?? 0) : 0;
  return clamp01(params.P_BASE[nome] * cap * modFusao * (1 - evasao));
}

/** Probabilidade em palavras: 'quase certo' | 'provável' | 'arriscado' | 'remoto'. */
function rotuloProbabilidade(p, params = P) {
  const v = clamp01(Number(p) || 0);
  return params.ROTULOS_PROBABILIDADE.find(r => v >= r.min).rotulo;
}

/** Texto para o boletim, com ou sem o número (interruptor "mostrar os números"). */
function formatarProbabilidade(p, mostrarNumeros = false, params = P) {
  const r = rotuloProbabilidade(p, params);
  return mostrarNumeros ? `${r} (${Math.round(clamp01(p) * 100)}%)` : r;
}

function encontroNulo(atrib, motivo) {
  return {
    efetivo: false, motivo,
    etapas: [], etapaAtingida: null,
    evidencia: 0,
    atribuicao: { antes: atrib, depois: atrib },
    apresado: false,
    excesso: null, custoPolitico: 0,
  };
}

/**
 * Resolve um encontro entre uma unidade Azul e um contato.
 *
 * Não muda os argumentos: a nova atribuição vem no resultado, e cabe a quem
 * chama gravá-la no contato.
 *
 * @param {object} args
 * @param {object} args.unidade     unidade empregada ({ type } e/ou { capSM })
 * @param {object} args.contato     { atribuicao?: 0–100, negabilidade?, evasao?: 0–1 }
 * @param {number} args.fusao       qualidade da fusão de dados, 0–1
 * @param {string|number} args.etapaAlvo  até onde a unidade pretende ir
 * @param {string|number} [args.tetoRoe]  etapa máxima que a ROE permite (SM-2); padrão: a última
 * @param {number} [args.ritmo]     ritmo de evidência (névoa por dificuldade, SM-5); padrão 1
 * @param {() => number} args.rng   gerador semeado (obrigatório)
 * @returns {{efetivo:boolean, motivo?:string, etapas:Array<{etapa:string,p:number,sorteio:number,sucesso:boolean}>,
 *            etapaAtingida:string|null, evidencia:number, atribuicao:{antes:number,depois:number},
 *            apresado:boolean, excesso:string|null, custoPolitico:number}}
 */
function resolverEncontro({ unidade, contato, fusao = 0, etapaAlvo, tetoRoe, ritmo = 1, rng }, params = P) {
  if (typeof rng !== 'function') throw new Error('encounter: rng semeado é obrigatório');
  const atribAntes = Math.min(100, Math.max(0, Number(contato?.atribuicao) || 0));

  if (!unidade)  return encontroNulo(atribAntes, 'sem_unidade');
  if (!contato)  return encontroNulo(atribAntes, 'sem_contato');
  const alvo = A.indiceEtapa(etapaAlvo, params);
  if (alvo < 0)  return encontroNulo(atribAntes, 'sem_etapa');
  const teto = tetoRoe == null ? params.ETAPAS.length - 1 : A.indiceEtapa(tetoRoe, params);
  if (teto < 0)  return encontroNulo(atribAntes, 'roe_impede');
  const ultima = Math.min(alvo, teto);
  // Sem chance de detectar (unidade sem sensor, ou contato que evade por
  // completo), não há encontro.
  const eixo0 = params.EIXO_ETAPA[params.ETAPAS[0]];
  if (capacidadeUnidade(unidade, eixo0, params) <= 0) return encontroNulo(atribAntes, 'sem_capacidade');
  if (probabilidadeEtapa(params.ETAPAS[0], unidade, contato, fusao, params) <= 0)
    return encontroNulo(atribAntes, 'deteccao_impossivel');

  const etapas = [];
  let atrib = atribAntes;
  let atingida = -1;
  for (let i = 0; i <= ultima; i++) {
    const nome = params.ETAPAS[i];
    const p = probabilidadeEtapa(nome, unidade, contato, fusao, params);
    const sorteio = rng();
    const sucesso = sorteio < p;
    etapas.push({ etapa: nome, p, sorteio, sucesso });
    if (!sucesso) break;
    atingida = i;
    atrib = A.acumularEvidencia(atrib, params.GANHO_EVIDENCIA[nome],
      { negabilidade: contato.negabilidade, fusao, ritmo }, params);
  }

  // Risco político: a etapa mais coercitiva tentada, avaliada pela atribuição
  // que havia ao decidir agir (antes do encontro).
  const tentada = params.ETAPAS[etapas.length - 1];
  const custoPolitico = A.riscoPolitico(atribAntes, tentada, params);
  const autorizada = A.respostaAutorizada(atribAntes, params.ETAPAS.length - 1, params);
  const excesso = A.indiceEtapa(tentada, params) > A.indiceEtapa(autorizada, params) ? tentada : null;

  return {
    efetivo: true,
    etapas,
    etapaAtingida: atingida >= 0 ? params.ETAPAS[atingida] : null,
    evidencia: atrib - atribAntes,
    atribuicao: { antes: atribAntes, depois: atrib },
    apresado: atingida === params.ETAPAS.indexOf('apresamento'),
    excesso,
    custoPolitico,
  };
}

module.exports = {
  ETAPAS: P.ETAPAS,
  capacidadeUnidade, probabilidadeEtapa, rotuloProbabilidade, formatarProbabilidade,
  resolverEncontro,
};
