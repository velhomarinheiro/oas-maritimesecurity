'use strict';

/**
 * runner.js — Runner da OAS-SM: joga uma campanha inteira sem humanos e roda
 * os desenhos experimentais (Desenho Experimental v1.3 §5–§6).
 *
 * Uma partida é uma campanha de turnos de 24 h sobre os módulos SM-1 a SM-7,
 * executada pelo motor de turno em etapas (engine.js, SM-9) — o mesmo que a
 * interface interativa usa; aqui todas as decisões vêm da doutrina:
 *
 *   1. crises do turno (SM-5) — injetam ocorrências, sabotagem ou tarefas
 *      de SAR/desastre;
 *   2. ocorrências constabulares do turno (SM-3), com saturação/cobertura
 *      pela intensidade híbrida;
 *   3. agente Vermelho (motor): ações do híbrido por vetor (Tabela 4.1) contra
 *      a infraestrutura, mais desinformação (SM-7);
 *   4. quadro operacional comum: cada contato aberto entra no quadro com
 *      chance dada pela fusão (SM-4), pela MPA/CENSIPAM em vigor e pelos
 *      sistemas não tripulados; no avançado, o híbrido só aparece no contato;
 *   5. COMPAAz: pedidos de apoio (SM-4) e campanha informacional (SM-7);
 *   6. prontidão (SM-6): SAR e FPE acionados no 1º turno; os demais quando
 *      o acúmulo da estação excede os meios disponíveis;
 *   7. tarefas de SAR/desastre, depois as respostas: cada estação, com seu
 *      orçamento de ações (e surto, §8.6), designa um meio por contato e
 *      resolve o encontro (SM-1) sob a ROE efetiva (SM-2 × SM-7) ou a
 *      autoridade constabular; meios livres patrulham atrás de contatos
 *      ocultos;
 *   8. ações do híbrido não frustradas no prazo produzem efeito (dano à
 *      infraestrutura, evento para a escada); a investigação pós-fato segue
 *      acumulando evidência e, ao atingir a atribuição robusta, gera o
 *      evento do tipo da ação — o caminho para N2 e N3;
 *   9. escada de escalada (SM-2), autorizada pelo COMPAAz;
 *  10. N3: escalada terminal — joga a partida do jogo base (motor de salva
 *      intocado) e encerra a campanha;
 *  11. dimensão informacional (SM-7): campanhas em vigor, retorno do apoio,
 *      teto de custo político.
 *
 * As decisões Azuis são de uma política doutrinária determinística (params.
 * DOUTRINA): a modalidade de C2 é fixada em 'unico' na pesquisa (Desenho
 * §2.2). Toda a aleatoriedade sai da semente, em sub-sequências próprias —
 * rotina constabular, saturação, apoios, crises, quadro, encontros, Vermelho
 * —, de modo que a mesma semente reproduz a mesma campanha.
 *
 * Abstração espacial: dentro da área o meio alcança o contato no turno (24 h,
 * hexágono de ~75 mn); a Esquadra atua em qualquer área. Fuel Points não são
 * modelados no runner (o movimento hexágono a hexágono fica para a UI, SM-9).
 */

const { PARAMS: P } = require('./params');
const EG = require('./engine');

/**
 * Joga uma campanha completa com todas as decisões pela política de agente
 * (doutrina Azul, motor Vermelho, COMPAAz que autoriza a escalada).
 * @param {object} cfg  configuração (campaign.configurarCampanha)
 * @param {object} [opts]
 * @param {boolean} [opts.boletins]  guarda as linhas do boletim de cada turno
 * @returns {{metricas: object, desfecho: string, turnos: number, terminal: object|null, boletins?: string[][]}}
 */
function jogarPartida(cfg, opts = {}, params = P) {
  const p = EG.criarPartida(cfg, opts, params);
  while (!p.encerrada) { p.iniciarTurno(); p.decidirAzul(); p.fecharTurno(); }
  return p.resultado();
}

// ─── Desenhos experimentais (Desenho §5) ─────────────────────────────────────

const ABLACAO   = { replicas: 50, semente: 5000 };
const FATORIAL  = { replicas: 20, semente: 7000 };
const CONTRASTE = { replicas: 50, semente: 9000 };

/** Condições de cada bloco: fatores −1/+1 e apoio_externo. */
function condicoes(params = P) {
  const F = params.FATORES_SM;
  const todos = Object.fromEntries(F.map(f => [f, 1]));
  const ablacao = [{ condicao: 'C0', fatores: { ...todos }, apoioExterno: 1 },
    ...F.map((f, i) => ({ condicao: `C${i + 1}`, fatores: { ...todos, [f]: -1 }, apoioExterno: 1 }))];
  // Ordem padrão (Yates): A varia mais rápido.
  const fatorial = Array.from({ length: 2 ** F.length }, (_, k) => ({
    condicao: `F${String(k + 1).padStart(2, '0')}`,
    fatores: Object.fromEntries(F.map((f, j) => [f, (k >> j) & 1 ? 1 : -1])),
    apoioExterno: 1,
  }));
  const contraste = [{ condicao: 'C0_apoio1', fatores: { ...todos }, apoioExterno: 1 },
                     { condicao: 'C0_apoio0', fatores: { ...todos }, apoioExterno: 0 }];
  return { ablacao, fatorial, contraste };
}

/**
 * Lista de partidas do lote: 300 (ablação) + 640 (fatorial) + 100 (contraste)
 * = 1.040. Sementes espelhadas entre condições do mesmo bloco.
 */
function delineamento({ blocos = ['ablacao', 'fatorial', 'contraste'], replicas = {} } = {}, params = P) {
  const C = condicoes(params);
  const ref = { ablacao: ABLACAO, fatorial: FATORIAL, contraste: CONTRASTE };
  const out = [];
  for (const b of blocos) {
    const n = replicas[b] ?? ref[b].replicas;
    for (const c of C[b]) for (let r = 1; r <= n; r++)
      out.push({ bloco: b, condicao: c.condicao, replica: r, semente: ref[b].semente + r, fatores: c.fatores, apoioExterno: c.apoioExterno });
  }
  return out;
}

// Colunas do dataset: Tabela 6.1, na ordem, seguidas das complementares.
// C_Fusão grafado sem acento (C_Fusao) para importação sem ajuste em R.
const COLUNAS = [
  'bloco', 'condicao', 'replica', 'semente', 'modalidade_C2', 'apoio_externo',
  'A_MPA', 'B_NPaOc', 'C_Fusao', 'D_USV', 'E_GVI', 'n_capacidades', 'custo_total',
  'E1_atrib', 'E2_infra', 'E3_escalada', 'E4_custopol', 'E5_ordem', 'E6_dispersao',
  'n_ocorr_crim', 'ocorr_reprimidas', 'mpa_solicitada', 'mpa_atendida',
  'apoio_pf', 'apoio_rf', 'apoio_ibama', 'apoio_censipam', 'apoio_intl',
  'n_apoios_concedidos', 'efeito_apoio', 'sloc_idx', 'kcv_perdido', 'nivel_max',
  // complementares
  'atrito_terminal', 'desfecho', 'turnos', 'n_incidentes_hibridos', 'apoio_publico_final',
  'crise_deteccao_media', 'crise_resposta_media',
  // custos a terceiros (SM-11)
  'n_falsos_alarmes', 'n_interrupcoes', 'n_forca_desnecessaria', 'n_danos_terceiros', 'n_danos_ambientais',
];

/** Configuração-base das partidas de pesquisa (Desenho §2.2: jogador único). */
const CFG_PESQUISA = { modalidade: 'unico', dificuldade: 'intermediario', duracaoDias: 45, intensidadeHibrida: 0.5 };

/** Joga uma célula do delineamento e devolve a linha do dataset. */
function linhaDe(celula, cfgBase = CFG_PESQUISA, params = P) {
  const r = jogarPartida({ ...cfgBase, seed: celula.semente, fatores: celula.fatores, apoioExterno: celula.apoioExterno }, {}, params);
  const ativos = params.FATORES_SM.filter(f => celula.fatores[f] === 1);
  return {
    bloco: celula.bloco, condicao: celula.condicao, replica: celula.replica, semente: celula.semente,
    modalidade_C2: cfgBase.modalidade ?? 'unico', apoio_externo: celula.apoioExterno,
    ...Object.fromEntries(params.FATORES_SM.map(f => [f, celula.fatores[f]])),
    n_capacidades: ativos.length,
    custo_total: ativos.reduce((s, f) => s + params.CUSTO_EAC[f], 0),
    ...r.metricas,
    desfecho: r.desfecho, turnos: r.turnos,
  };
}

/**
 * Roda o lote.
 * @param {object} [spec]  { blocos, replicas, cfgBase, progresso: (i, n) => void }
 * @returns {{linhas: object[], ms: number}}
 */
function rodarLote(spec = {}, params = P) {
  const t0 = Date.now();
  const cel = delineamento(spec, params);
  const linhas = cel.map((c, i) => { const l = linhaDe(c, spec.cfgBase ?? CFG_PESQUISA, params); spec.progresso?.(i + 1, cel.length); return l; });
  return { linhas, ms: Date.now() - t0 };
}

/** CSV UTF-8, vírgula, ponto decimal, vazio = ausente (Jamovi/R). */
function paraCsv(linhas) {
  const fmt = v => (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) ? ''
    : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6))
    : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  return [COLUNAS.join(','), ...linhas.map(l => COLUNAS.map(c => fmt(l[c])).join(','))].join('\n') + '\n';
}

module.exports = {
  jogarPartida, jogarTerminal: EG.jogarTerminal, acaoDaEtapa: EG.acaoDaEtapa,
  condicoes, delineamento, linhaDe, rodarLote, paraCsv, COLUNAS, CFG_PESQUISA,
};
