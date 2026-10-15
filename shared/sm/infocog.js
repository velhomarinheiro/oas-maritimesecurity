'use strict';

/**
 * infocog.js — Dimensão informacional e cognitiva da OAS-SM (Conceito §6 e
 * §11.3).
 *
 * O objeto disputado é a confiança da sociedade e o apoio às ações da Força
 * Azul, representado por um indicador de apoio público (0–100) que:
 *   - se move com os eventos no mar (repressão, SAR, dano à infraestrutura,
 *     danos a terceiros) e com o custo político das ações Azuis;
 *   - cai com a desinformação Vermelha, mais quando ela explora um incidente
 *     real (uma ação Azul frágil ainda não esclarecida);
 *   - sobe com as campanhas informacionais Azuis — comunicação estratégica,
 *     transparência, prova documentada e prebunking —, ações próprias do
 *     COMPAAz, uma por turno, com efeito no turno seguinte e eficácia que
 *     depende da fusão e da prova disponível. Azul nunca dispõe de
 *     desinformação: o catálogo não a tem.
 *
 * O apoio modula o custo político de cada ação (apoio baixo encarece, alto
 * atenua) e a largura das regras de engajamento: abaixo da faixa estreita a
 * ROE efetiva perde um degrau; acima da faixa ampla ganha um — nunca o
 * emprego de força fora de N3. Custo político acima do teto é derrota
 * estratégica Azul, ainda que a infraestrutura esteja intacta.
 *
 * Sem aleatoriedade: os efeitos são determinísticos. Estado imutável.
 */

const { PARAMS: P } = require('./params');
const A  = require('./attribution');
const ES = require('./escalation');
const C2 = require('./c2');

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function criarEstadoInfocog(params = P) {
  return {
    apoio: params.INFOCOG.apoioInicial,
    custoPolitico: 0,
    derrotaEstrategica: false,
    gatilhos: [],          // ações Azuis frágeis ainda não esclarecidas (exploráveis pela desinformação)
    prebunkingAte: -1,     // último turno de proteção do prebunking
    campanhasPendentes: [],
    campanhasNoTurno: {},  // turno → nº de campanhas lançadas
    registro: [],
  };
}

function comApoio(e, delta, motivo, turno, extra = {}) {
  const apoio = clamp(e.apoio + delta, 0, 100);
  return { ...e, apoio, registro: [...e.registro, { turno, motivo, delta: apoio - e.apoio, ...extra }] };
}

/** Multiplicador do custo político pelo apoio: >1 com apoio baixo, <1 com alto. */
function multiplicadorCusto(apoio, params = P) {
  const I = params.INFOCOG;
  return 1 + I.custo.modulacao * (I.apoioReferencia - apoio) / I.apoioReferencia;
}

/**
 * Largura da ROE pelo apoio: −1 (estreita), 0, +1 (ampla).
 */
function larguraRoe(apoio, params = P) {
  const f = params.INFOCOG.faixasRoe;
  return apoio < f.estreita ? -1 : apoio >= f.amplia ? 1 : 0;
}

/**
 * ROE efetiva no nível de escalada, dado o apoio público.
 * Estreita: as respostas e o teto do nível anterior. Ampla: os do nível
 * seguinte, sem o emprego de força. Em N3 o emprego de força permanece.
 * @returns {{nivel, largura, tetoRoe, acoes: string[]}}
 */
function roeEfetiva(nivel, apoio, params = P) {
  const larg = larguraRoe(apoio, params);
  const ref = clamp(nivel + larg, 0, 3);
  let acoes = params.NIVEIS[ref].acoes.filter(a => a !== 'emprego_forca');
  if (nivel === 3) acoes = [...acoes, 'emprego_forca'];
  return { nivel, largura: larg, tetoRoe: ES.tetoRoe(ref, params), acoes };
}

/**
 * Custo político de uma ação Azul (Conceito §11.3) e seu efeito no apoio.
 *
 * @param {object} estado
 * @param {object} acao
 * @param {number} acao.turno
 * @param {string} [acao.etapa]          etapa mais coercitiva tentada no encontro (SM-1)
 * @param {number} [acao.atribuicao]     atribuição ao decidir agir (0–100)
 * @param {number} [acao.nivel]          nível de escalada em vigor
 * @param {string} [acao.tipoAcao]       ação do catálogo ACOES (para o excesso de força)
 * @param {number} [acao.danosTerceiros] número de danos a terceiros
 * @param {string} [acao.id]             identificador (vira gatilho se a ação for frágil)
 * @returns {{estado, custo: number}}
 */
function registrarAcaoAzul(estado, acao, params = P) {
  const I = params.INFOCOG;
  const risco  = acao.etapa ? A.riscoPolitico(acao.atribuicao ?? 0, acao.etapa, params) : 0;
  const excesso = acao.tipoAcao != null ? ES.excessoDeForca(acao.nivel ?? 0, acao.tipoAcao, params) : 0;
  const danos  = Math.max(0, acao.danosTerceiros ?? 0);
  const bruto  = risco + I.custo.pesoExcesso * excesso + I.custo.pesoDanos * danos;
  const custo  = bruto * multiplicadorCusto(estado.apoio, params);
  if (custo <= 0) return { estado, custo: 0 };

  let e = comApoio(estado, -I.apoioPorCusto * custo, 'custo_politico', acao.turno, { custo });
  const custoPolitico = e.custoPolitico + custo;
  e = { ...e, custoPolitico, derrotaEstrategica: e.derrotaEstrategica || custoPolitico > I.tetoCustoPolitico };
  if (acao.id && !e.gatilhos.includes(acao.id)) e = { ...e, gatilhos: [...e.gatilhos, acao.id] };
  return { estado: e, custo };
}

/** Evento no mar que move o apoio (INFOCOG.eventosMar). */
function registrarEventoMar(estado, tipo, turno, params = P) {
  const delta = params.INFOCOG.eventosMar[tipo];
  if (delta === undefined) throw new Error(`infocog: evento desconhecido ${tipo}`);
  return comApoio(estado, delta, tipo, turno);
}

/**
 * Campanha de desinformação Vermelha (§6.1). Decide o controlador Vermelho
 * (motor, humano no 1×1 ou Célula Branca).
 *
 * @param {object} c2
 * @param {{quem, turno, intensidade?: number, gatilho?: string}} req
 *   gatilho: id de uma ação Azul frágil (registrarAcaoAzul) — se ainda não
 *   esclarecida, o efeito é multiplicado; sem gatilho, é fabricação.
 */
function lancarDesinformacao(estado, c2, { quem, turno, intensidade = 1, gatilho = null }, params = P) {
  if (quem !== c2.vermelho) throw new Error('infocog: só o controlador Vermelho lança desinformação');
  const I = params.INFOCOG.desinformacao;
  const real = gatilho !== null && estado.gatilhos.includes(gatilho);
  const protegido = turno <= estado.prebunkingAte;
  const protecao = protegido ? params.INFOCOG.campanhas.prebunking.protecao : 0;
  const efeito = I.base * clamp(intensidade, 0, 1) * (real ? I.gatilhoReal : 1) * (1 - protecao);
  return comApoio(estado, -efeito, 'desinformacao', turno, { real, protegido });
}

/**
 * Campanha informacional Azul (§6.2), decidida pelo COMPAAz. Entra em vigor
 * após o prazo (aplicada em avancarTurno). Limitada a INFOCOG.campanhasPorTurno.
 *
 * @param {object} c2
 * @param {{quem, turno, tipo, fusao?: number, prova?: {atribuicao: number}, esclarece?: string}} req
 *   prova: a evidência que a divulga (exigida pela prova documentada);
 *   esclarece: o gatilho (ação frágil) que a transparência/prova esclarece.
 * @returns {{estado, aceita: boolean, motivo?: string}}
 */
function lancarCampanha(estado, c2, { quem, turno, tipo, fusao = 1, prova = null, esclarece = null }, params = P) {
  const def = params.INFOCOG.campanhas[tipo];
  if (!def) throw new Error(`infocog: campanha desconhecida ${tipo}`);
  C2.exigirDecisao(c2, { quem, estacao: 'COMPAAz', papel: 'campanha_informacional' }, params);
  const n = estado.campanhasNoTurno[turno] ?? 0;
  if (n >= params.INFOCOG.campanhasPorTurno) return { estado, aceita: false, motivo: 'sem_capacidade_no_turno' };
  if (def.exigeProva && !(prova && prova.atribuicao > 0)) return { estado, aceita: false, motivo: 'sem_prova' };
  const pendente = { tipo, lancadaEm: turno, vigeEm: turno + params.INFOCOG.prazoCampanha,
                     fusao: clamp(fusao, 0, 1), prova: prova ? { atribuicao: clamp(prova.atribuicao, 0, 100) } : null, esclarece };
  return {
    estado: { ...estado, campanhasPendentes: [...estado.campanhasPendentes, pendente],
              campanhasNoTurno: { ...estado.campanhasNoTurno, [turno]: n + 1 } },
    aceita: true,
  };
}

/** Eficácia de uma campanha: (0,5 + 0,5 × fusão) × (prova/100, se exigida). */
function eficaciaCampanha(c, params = P) {
  const def = params.INFOCOG.campanhas[c.tipo];
  return (0.5 + 0.5 * c.fusao) * (def.exigeProva ? c.prova.atribuicao / 100 : 1);
}

/**
 * Fecha o turno: aplica as campanhas que entram em vigor e puxa o apoio
 * para a referência.
 */
function avancarTurno(estado, turno, params = P) {
  const I = params.INFOCOG;
  const pendentes = estado.campanhasPendentes.filter(c => c.vigeEm > turno);
  let e = { ...estado, campanhasPendentes: pendentes };
  for (const c of estado.campanhasPendentes) {
    if (c.vigeEm > turno) continue;
    const def = I.campanhas[c.tipo];
    const ef = eficaciaCampanha(c, params);
    if (def.ganho) e = comApoio(e, def.ganho * ef, `campanha:${c.tipo}`, turno);
    if (def.protecao) e = { ...e, prebunkingAte: Math.max(e.prebunkingAte, turno + def.duracao - 1) };
    if (def.esclareceGatilho && c.esclarece) e = { ...e, gatilhos: e.gatilhos.filter(g => g !== c.esclarece) };
  }
  const retorno = (I.apoioReferencia - e.apoio) * I.retornoPorTurno;
  if (retorno !== 0) e = comApoio(e, retorno, 'retorno', turno);
  return e;
}

/** E4_custopol e indicadores para o dataset/boletim. */
function metricas(estado) {
  return { E4_custopol: estado.custoPolitico, apoio_publico: estado.apoio, derrota_estrategica: estado.derrotaEstrategica ? 1 : 0 };
}

module.exports = {
  criarEstadoInfocog, multiplicadorCusto, larguraRoe, roeEfetiva,
  registrarAcaoAzul, registrarEventoMar, lancarDesinformacao, lancarCampanha, eficaciaCampanha,
  avancarTurno, metricas,
};
