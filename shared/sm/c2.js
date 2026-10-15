'use strict';

/**
 * c2.js — Comando e controle da Força Azul na OAS-SM (Conceito §7).
 *
 * Seis estações em duas camadas (Tabela 7.1): o COMPAAz no ápice; abaixo, o
 * ComemCh (trilha de defesa) e os 2º, 1º, 8º e 5º Distritos Navais (trilha
 * constabular, cada um na sua área). Cada estação tem papéis exclusivos
 * (params.ESTACOES[].papeis): só ela toma aquelas decisões.
 *
 * Modalidades (§7.3) — 'unico', '1x1', 'distribuido' — mudam apenas QUEM
 * decide cada estação (o controlador: um humano ou uma política de agente).
 * As regras não mudam: toda decisão passa por autorizarDecisao, que confere
 * só (a) se quem decide controla a estação e (b) se a estação tem o papel.
 *
 * Barramento de fusão (§7.2): as estações publicam reportes de contato por
 * fonte (Tabela 8.3) num quadro operacional comum, compartilhado por todas. A
 * qualidade da fusão (0–1) depende das fontes ligadas e do fator C_Fusão, e
 * é ela que entra no motor de encontro (SM-1) — atribuição e triagem.
 *
 * O apoio externo despachado pelo COMPAAz fica em apoio.js.
 * Sem aleatoriedade; estados imutáveis.
 */

const { PARAMS: P } = require('./params');

// ─── Estações e papéis ───────────────────────────────────────────────────────

function estacao(id, params = P) {
  const e = params.ESTACOES.find(x => x.id === id);
  if (!e) throw new Error(`c2: estação desconhecida ${id}`);
  return e;
}

/** Estação de Distrito Naval que responde pela área (AREAS_DN). */
function estacaoDaArea(areaId, params = P) {
  const e = params.ESTACOES.find(x => x.area === areaId);
  if (!e) throw new Error(`c2: área sem estação ${areaId}`);
  return e.id;
}

function temPapel(estacaoId, papel, params = P) { return estacao(estacaoId, params).papeis.includes(papel); }

// ─── Modalidades ─────────────────────────────────────────────────────────────

/**
 * Define quem controla cada estação Azul e o lado Vermelho.
 *
 * @param {object} cfg
 * @param {'unico'|'1x1'|'distribuido'} cfg.modalidade
 * @param {object} [cfg.controladores]
 *   unico:       { azul?: string }                  — padrão 'agente:azul'; Vermelho = 'motor'
 *   1x1:         { azul: string, vermelho: string } — dois jogadores
 *   distribuido: { <estacaoId>: string ×6, vermelho?: 'motor'|'celula_branca' } — seis distintos
 * @returns {{modalidade, controle: object, vermelho: string}}
 */
function criarC2({ modalidade = 'unico', controladores = {} } = {}, params = P) {
  if (!params.MODALIDADES.includes(modalidade)) throw new Error(`c2: modalidade desconhecida ${modalidade}`);
  const ids = params.ESTACOES.map(e => e.id);
  let controle, vermelho;
  if (modalidade === 'unico') {
    const azul = controladores.azul ?? 'agente:azul';
    controle = Object.fromEntries(ids.map(id => [id, azul]));
    vermelho = 'motor';
  } else if (modalidade === '1x1') {
    if (!controladores.azul || !controladores.vermelho || controladores.azul === controladores.vermelho)
      throw new Error('c2: 1x1 exige controladores azul e vermelho distintos');
    controle = Object.fromEntries(ids.map(id => [id, controladores.azul]));
    vermelho = controladores.vermelho;
  } else {
    const faltam = ids.filter(id => !controladores[id]);
    if (faltam.length) throw new Error(`c2: distribuído sem controlador para ${faltam.join(', ')}`);
    if (new Set(ids.map(id => controladores[id])).size !== ids.length)
      throw new Error('c2: distribuído exige um controlador distinto por estação');
    controle = Object.fromEntries(ids.map(id => [id, controladores[id]]));
    vermelho = controladores.vermelho ?? 'motor';
    if (!['motor', 'celula_branca'].includes(vermelho))
      throw new Error('c2: no distribuído o Vermelho é o motor ou a Célula Branca');
  }
  return { modalidade, controle, vermelho };
}

/** Estações que um controlador comanda. */
function estacoesDe(c2, quem) { return Object.keys(c2.controle).filter(id => c2.controle[id] === quem); }

/**
 * A regra única de decisão, igual em todas as modalidades.
 * @returns {{ok: boolean, motivo?: string}}
 */
function autorizarDecisao(c2, { quem, estacao: id, papel }, params = P) {
  if (!(id in c2.controle)) return { ok: false, motivo: 'estacao_desconhecida' };
  if (c2.controle[id] !== quem) return { ok: false, motivo: 'nao_controla_a_estacao' };
  if (!temPapel(id, papel, params)) return { ok: false, motivo: 'papel_de_outra_estacao' };
  return { ok: true };
}

/** Como autorizarDecisao, mas lança — para os pontos em que a decisão é obrigatória. */
function exigirDecisao(c2, req, params = P) {
  const r = autorizarDecisao(c2, req, params);
  if (!r.ok) throw new Error(`c2: ${req.quem} não pode ${req.papel} em ${req.estacao} (${r.motivo})`);
}

/**
 * Adaptador para escalation.avancarTurno: a proposta (conduzida pelo ComemCh)
 * vai ao controlador do COMPAAz, cuja política responde sim/não.
 *
 * @param {object} c2
 * @param {(proposta, quem) => boolean} politica  decisão do controlador do COMPAAz
 */
function decisorEscalada(c2, politica, params = P) {
  return proposta => {
    const quem = c2.controle.COMPAAz;
    exigirDecisao(c2, { quem, estacao: 'COMPAAz', papel: 'autorizar_escalada' }, params);
    return { autorizado: politica(proposta, quem) === true, por: 'COMPAAz' };
  };
}

// ─── Fusão e quadro operacional comum ────────────────────────────────────────

/**
 * Qualidade da fusão (0–1): soma dos pesos das fontes ligadas, limitada a
 * TETO_FUSAO_SEM_C sem o fator C_Fusão, mais bônus (apoio CENSIPAM/MPA).
 */
function qualidadeFusao({ fontesAtivas = Object.keys(P.FONTES), cFusao = true, bonus = 0 } = {}, params = P) {
  for (const f of fontesAtivas) if (!params.FONTES[f]) throw new Error(`c2: fonte desconhecida ${f}`);
  const base = [...new Set(fontesAtivas)].reduce((s, f) => s + params.FONTES[f].peso, 0);
  const teto = cFusao ? 1 : params.TETO_FUSAO_SEM_C;
  return Math.min(1, Math.min(teto, base) + Math.max(0, bonus));
}

function criarBarramento() { return { reportes: [] }; }

/**
 * Publica um reporte de contato no barramento.
 * @param {{turno, estacao, fonte, contatoId, col, row}} reporte
 */
function publicar(bus, reporte, params = P) {
  estacao(reporte.estacao, params);
  if (!params.FONTES[reporte.fonte]) throw new Error(`c2: fonte desconhecida ${reporte.fonte}`);
  return { reportes: [...bus.reportes, { ...reporte }] };
}

/**
 * Quadro operacional comum no turno: cada contato com as fontes e estações
 * que o reportaram (só fontes ligadas, só reportes que já venceram a latência),
 * a posição mais recente e a confiança combinada (OU ruidoso das
 * confiabilidades). `redundante` marca o contato visto por mais de uma fonte —
 * o custo de conciliação de ligar muitas fontes (§8.7).
 */
function quadroComum(bus, turno, { fontesAtivas = Object.keys(P.FONTES) } = {}, params = P) {
  const porContato = new Map();
  for (const r of bus.reportes) {
    if (!fontesAtivas.includes(r.fonte)) continue;
    if (r.turno + params.FONTES[r.fonte].latencia > turno) continue;
    const c = porContato.get(r.contatoId) ?? { contatoId: r.contatoId, fontes: new Set(), estacoes: new Set(), ultimo: null };
    c.fontes.add(r.fonte); c.estacoes.add(r.estacao);
    if (!c.ultimo || r.turno >= c.ultimo.turno) c.ultimo = r;
    porContato.set(r.contatoId, c);
  }
  return [...porContato.values()]
    .map(c => ({
      contatoId: c.contatoId,
      col: c.ultimo.col, row: c.ultimo.row, turnoReporte: c.ultimo.turno,
      fontes: [...c.fontes].sort(),
      estacoes: [...c.estacoes].sort(),
      confianca: 1 - [...c.fontes].reduce((p, f) => p * (1 - params.FONTES[f].confiabilidade), 1),
      redundante: c.fontes.size > 1,
    }))
    .sort((a, b) => (a.contatoId < b.contatoId ? -1 : a.contatoId > b.contatoId ? 1 : 0));
}

/**
 * O que uma estação vê: o quadro comum. É o mesmo para todas as estações e em
 * todas as modalidades — a consciência situacional vem do barramento, não de
 * quem está sentado na estação.
 */
function vistaDaEstacao(bus, estacaoId, turno, opts = {}, params = P) {
  estacao(estacaoId, params);
  return quadroComum(bus, turno, opts, params);
}

module.exports = {
  estacao, estacaoDaArea, temPapel,
  criarC2, estacoesDe, autorizarDecisao, exigirDecisao, decisorEscalada,
  qualidadeFusao, criarBarramento, publicar, quadroComum, vistaDaEstacao,
};
