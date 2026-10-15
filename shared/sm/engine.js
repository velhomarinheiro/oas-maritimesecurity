'use strict';

/**
 * engine.js — Motor de turno da OAS-SM, com pontos de decisão.
 *
 * Uma partida é uma campanha de turnos de 24 h sobre os módulos SM-1 a SM-7.
 * Cada turno tem três etapas, e em cada uma um lado decide:
 *
 *   iniciarTurno(decisaoVermelho)  crises, ocorrências, ações do híbrido
 *                                  (Vermelho decide), quadro operacional comum
 *   decidirAzul(decisoes)          COMPAAz (apoios, campanha), prontidão,
 *                                  SAR, respostas das estações (cada estação
 *                                  decide), efeitos do híbrido, investigação;
 *                                  devolve a proposta de escalada, se houver
 *   fecharTurno(autorizacao)       escada (COMPAAz decide), N3 terminal,
 *                                  dimensão informacional, desfecho
 *
 * Em todas as etapas, o que não vier decidido por um humano fica com a
 * política de agente (doutrina, params.DOUTRINA; motor Vermelho,
 * params.HIBRIDO). As regras são as mesmas: só muda quem decide
 * (Conceito §7.3). O runner do lote (runner.js) é este motor com todas as
 * decisões pela doutrina; a interface (SM-9) é este motor com humanos.
 *
 * Toda a aleatoriedade sai da semente da campanha, em sub-sequências
 * próprias (rotina, saturação, apoios, crises, quadro, encontros, Vermelho).
 *
 * Abstração espacial: dentro da área o meio alcança o contato no turno (24 h,
 * hexágono de ~75 mn); a Esquadra atua em qualquer área. Fuel Points não são
 * modelados.
 */

const { PARAMS: P } = require('./params');
const { mulberry32 } = require('../rng');
const CA = require('./campaign');
const CO = require('./constab');
const ES = require('./escalation');
const EN = require('./encounter');
const A  = require('./attribution');
const C2 = require('./c2');
const AP = require('./apoio');
const OB = require('./oob_sm');
const IC = require('./infocog');

const iE = e => (e == null ? -1 : P.ETAPAS.indexOf(e));
const PATRULHA = new Set(['fragata', 'corveta', 'destroier', 'patrulha_oc', 'patrulha_c', 'inspecao_naval', 'submarino', 'usv']);
const CONSTABULAR = new Set(['fragata', 'corveta', 'destroier', 'patrulha_oc', 'patrulha_c', 'inspecao_naval']);
const sortId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function pickPeso(rng, itens) {
  const total = itens.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [v, w] of itens) { if ((x -= w) < 0) return v; }
  return itens[itens.length - 1][0];
}

/** Etapa do encontro → ação do catálogo da ROE (para o excesso de força). */
function acaoDaEtapa(etapa, nivel) {
  if (etapa === 'deteccao' || etapa === 'identificacao') return 'vigilancia';
  if (etapa === 'interrogacao') return 'interrogacao';
  if (etapa === 'abordagem' || etapa === 'inspecao') return nivel >= 2 ? 'abordagem_coercitiva' : 'abordagem_consentida';
  return 'apresamento';
}

/**
 * Escalada terminal (N3): a partida do wargame base com a semente — motor de
 * salva e OOB base, pacote completo de capacidades.
 */
function jogarTerminal(seed) {
  require('../../server');                 // injeta o motor no simulador construtivo
  const SIM = require('../constructive_sim');
  const { FACTOR_KEYS } = require('../capability_factors');
  let final = null;
  const trace = { step(nome, _d, estado) { if (nome === 'game_over') final = estado; } };
  const r = SIM.runGameWith({ factors: Object.fromEntries(FACTOR_KEYS.map(k => [k, 1])), seed, trace });
  const kcv = final.units.find(u => u.id === 'RED-GBPA');
  return { vencedor: r.winner, kcvPerdido: !kcv || kcv.hp <= 0, atrito: r.metrics.atrito_azul, turnos: r.turns };
}

function media(xs) {
  const v = xs.filter(x => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/**
 * Cria uma partida.
 * @param {object} cfg  configuração (campaign.configurarCampanha)
 * @param {object} [opts]
 * @param {boolean} [opts.boletins]  guarda o boletim de cada turno
 */
function criarPartida(cfg, { boletins = false } = {}, params = P) {
  let cp = CA.iniciarCampanha(cfg, params);
  const config = cp.config;
  const D = params.DOUTRINA, HV = params.HIBRIDO.vetores;
  const oob = OB.montarOOB(config, {}, params);
  const azul = oob.azul;
  const infra = oob.infraestrutura.map(i => ({ ...i, area: CO.areaDoHex(i.hexes[0][0], i.hexes[0][1], params) }));
  const sp0 = infra.reduce((s, i) => s + i.sp, 0);
  const cFusao = OB.cFusaoAtiva(azul);
  const fusaoBase = C2.qualidadeFusao({ fontesAtivas: config.fontesAtivas, cFusao }, params);
  let pront = OB.criarEstadoProntidao(azul, params);
  const rngQ = mulberry32((config.seed ^ params.SAL_RUNNER.quadro) >>> 0);
  const rngE = mulberry32((config.seed ^ params.SAL_RUNNER.encontro) >>> 0);
  const rngV = mulberry32((config.seed ^ params.SAL_RUNNER.vermelho) >>> 0);
  const AZUL = cp.c2.controle.COMPAAz, VERMELHO = cp.c2.vermelho;

  const hib = [];
  const cont = { hibTotal: 0, hibExito: 0 };
  const conhecidos = new Set();
  const penalidade = {};
  const crises = {};
  const tarefas = [];
  const posicao = {};                   // meio → hexágono do último emprego (só para a interface)
  let prova = null;
  let slocAmeacadas = 0, acaoSeq = 0, hibSeq = 0, turnos = 0, t = 0;
  let terminal = null, desfecho = null;
  let fase = 'inicio';                  // inicio → azul → fechamento → inicio …
  let eventos = [], usados = new Set(), proposta = null;
  let registroTurno = [];               // encontros e resultados do turno (boletim)
  const linhas = [];

  const ativo = h => h.status === 'ativo';
  const responsavel = area => cp.responsavelPorArea[area];

  function bonusUsv(area) {
    const est = responsavel(area);
    return azul.some(m => (m.type === 'usv' || m.type === 'rov') && m.estacao === est) || azul.some(m => m.type === 'uav')
      ? D.quadro.bonusUsv : 0;
  }
  function pQuadro(area) {
    const f = Math.min(1, fusaoBase + AP.modificadores(cp.apoio, { turno: t, area, tipo: 'quadro' }, params).bonusFusao);
    return Math.min(D.quadro.teto, D.quadro.base + D.quadro.porFusao * f + bonusUsv(area));
  }
  function novoHibrido(vetor, alvo, atribuicao = 0) {
    const h = {
      id: `HX-${t}-${++hibSeq}`, vetor, area: alvo.area, alvo: alvo.id, col: alvo.hexes[0][0], row: alvo.hexes[0][1],
      contato: { atribuicao, negabilidade: params.VETORES_HIBRIDOS[vetor].negabilidade ?? 'alta', evasao: HV[vetor].evasao ?? 0 },
      restante: HV[vetor].janela, status: 'ativo', conhecido: false, atribuido: false, criadoEm: t,
    };
    hib.push(h);
    cont.hibTotal++;
    return h;
  }
  function causarDano(alvo, d, evento, atribuicao) {
    alvo.sp = Math.max(0, alvo.sp - d);
    eventos.push({ tipo: evento, atribuicao });
    cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'dano_infra', t, params) };
  }
  function tornarConhecido(h) {
    if (h.conhecido) return;
    h.conhecido = true;
    eventos.push({ tipo: 'incidente_hibrido', atribuicao: h.contato.atribuicao });
  }
  function marcoCrise(id, fn) {
    const c = cp.crises.find(x => x.id === id);
    if (c && c.status === 'ativa') cp = fn(cp, c);
  }
  const abertasConhecidas = () => (cp.constab?.ativas ?? []).filter(o => conhecidos.has(o.id));
  const hibConhecidos = () => hib.filter(h => ativo(h) && h.conhecido);
  function disponiveis(est, filtro) {
    return azul
      .filter(m => m.estacao === est && !usados.has(m.id) && filtro(m) &&
        // Não tripulados (fora dos escalões) estão prontos de imediato; aeronaves, GptFN e o centro de fusão não respondem.
        (pront.designacao[m.id].escalao === null ? (m.type === 'usv' || m.type === 'rov') : OB.podeMover(pront, m.id, t)))
      .sort((a, b) => a.prioridade - b.prioridade || sortId(a, b));
  }
  // Retrato do quadro no início das decisões Azuis: o orçamento (e o surto)
  // de cada estação é decidido sobre a situação do início do turno, não
  // sobre o que as estações anteriores já resolveram.
  let retrato = null;
  function acumulo(est) {
    const ab = retrato ? retrato.ab : abertasConhecidas(), hc = retrato ? retrato.hc : hibConhecidos();
    return est === 'ComemCh' ? hc.length
      : ab.filter(o => responsavel(o.area) === est).length + hc.filter(h => responsavel(h.area) === est).length;
  }
  function orcamento(est) {
    const base = D.acoesPorEstacao - (penalidade[est] ?? 0);
    return acumulo(est) > base ? { n: base + D.surto, surto: true } : { n: base, surto: false };
  }
  const estacoesAtivas = () => [...new Set(['ComemCh', ...params.AREAS_DN.filter(a => config.areasAtivas.includes(a.id)).map(a => a.estacao)])];

  // ─── Etapa 1: início do turno ─────────────────────────────────────────────

  /**
   * @param {object|null} [decisaoVermelho]  null/ausente = motor. Formato:
   *   { acoes: [{ vetor, alvo }], desinformacao: null | { gatilho?, intensidade? }, empregoAberto?: boolean }
   */
  function iniciarTurno(decisaoVermelho = null) {
    if (fase !== 'inicio') throw new Error(`engine: iniciarTurno fora de ordem (fase ${fase})`);
    if (desfecho) throw new Error('engine: partida encerrada');
    if (decisaoVermelho) validarDecisaoVermelho(decisaoVermelho);   // antes de mudar qualquer estado
    t++; turnos = t;
    eventos = []; usados = new Set(); proposta = null; registroTurno = [];

    // Crises
    const antes = new Set(cp.crises.filter(c => c.status === 'ativa').map(c => c.id));
    const rc = CA.avancarCrises(cp, t, params);
    cp = rc.estado;
    for (const c of cp.crises) {
      if (antes.has(c.id) && c.status === 'encerrada' && crises[c.id]?.tipo === 'tarefa' && !crises[c.id].atendida)
        cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'sar_falha', t, params) };
    }
    for (const ef of rc.disparadas) {
      if (ef.ocorrencias && cp.constab) {
        const ids = [];
        for (let k = 0; k < ef.ocorrencias.n; k++) {
          const r = CO.injetarOcorrencia(cp.constab, { id: `${ef.crise}-O${k + 1}`, tipo: ef.ocorrencias.tipo, area: ef.area, indice: k }, params);
          cp = { ...cp, constab: r.estado };
          if (r.ocorrencia) ids.push(r.ocorrencia.id);
        }
        crises[ef.crise] = { tipo: 'constab', ids };
      } else if (ef.hibrido && config.trilhas.defesa) {
        const alvos = infra.filter(i => i.sp > 0 && ['cabo', 'duto'].includes(i.tipo) && i.area === ef.area);
        const alvo = alvos[0] ?? infra.filter(i => i.sp > 0 && config.areasAtivas.includes(i.area)).sort(sortId)[0];
        if (alvo) crises[ef.crise] = { tipo: 'hibrido', id: novoHibrido('sabotagem_submarina', alvo, ef.hibrido.atribuicao).id };
      } else if (ef.sar || ef.desastre) {
        crises[ef.crise] = { tipo: 'tarefa', area: ef.area, necessarias: ef.sar ? 1 : 2, detectada: false, atendida: false, inicio: t };
        tarefas.push(ef.crise);
      }
    }

    // Injeções da Célula Branca / motor
    const inj = CA.consumirInjetados(cp, t);
    cp = inj.estado;
    inj.injetados.forEach((i, k) => {
      if (i.tipo === 'evento') eventos.push({ ...i.evento });
      else if (i.tipo === 'ocorrencia' && cp.constab) {
        const r = CO.injetarOcorrencia(cp.constab, { id: `CB-${t}-${k + 1}`, tipo: i.ocorrencia.tipo, area: i.ocorrencia.area, indice: k }, params);
        cp = { ...cp, constab: r.estado };
      }
    });

    // Ocorrências constabulares
    if (cp.constab) {
      const r = CO.avancarTurno(cp.constab, { intensidade: cp.config.intensidadeHibrida, areaAlvo: cp.config.areaAlvoHibrida }, params);
      cp = { ...cp, constab: r.estado };
    }

    // Vermelho
    if (config.trilhas.defesa && cp.config.intensidadeHibrida > 0) {
      if (decisaoVermelho) aplicarDecisaoVermelho(decisaoVermelho);
      else motorVermelho();
    }

    // Quadro operacional comum
    const oculta = params.DIFICULDADES[cp.config.dificuldade].ocultacaoAteContato;
    for (const o of cp.constab?.ativas ?? []) {
      if (!conhecidos.has(o.id) && rngQ() < pQuadro(o.area)) conhecidos.add(o.id);
    }
    for (const h of hib.filter(ativo)) {
      if (h.conhecido || oculta) continue;
      if (rngQ() < pQuadro(h.area) * (1 - 0.5 * h.contato.evasao)) tornarConhecido(h);
    }
    fase = 'azul';
  }

  function acaoVermelha(vetor, alvo) {
    const V = HV[vetor];
    if (V.maritimo) { novoHibrido(vetor, alvo); return; }
    cont.hibTotal++;                       // ciberataque: resolve no turno
    if (rngV() < 1 - 0.5 * fusaoBase) causarDano(alvo, V.dano, V.evento, 10);
    else cont.hibExito++;
  }

  function motorVermelho() {
    const vetores = config.vetoresHibridos.filter(v => HV[v]?.peso > 0).map(v => [v, HV[v].peso]);
    const n = vetores.length ? CO.poisson(rngV, params.HIBRIDO.acoesPorTurno * cp.config.intensidadeHibrida) : 0;
    for (let k = 0; k < n; k++) {
      const vetor = pickPeso(rngV, vetores);
      const V = HV[vetor];
      let alvos = infra.filter(i => i.sp > 0 && V.alvos.includes(i.tipo) && config.areasAtivas.includes(i.area)).sort(sortId);
      const naArea = alvos.filter(i => i.area === cp.config.areaAlvoHibrida);
      if (naArea.length && rngV() < params.HIBRIDO.pAreaAlvo) alvos = naArea;
      if (!alvos.length) continue;
      acaoVermelha(vetor, alvos[Math.floor(rngV() * alvos.length)]);
    }
    const EA = params.HIBRIDO.empregoAberto;
    if (cp.escalada.nivel >= EA.nivelMin && cp.config.intensidadeHibrida >= EA.intensidadeMin && rngV() < EA.pPorTurno)
      eventos.push({ tipo: 'emprego_aberto', atribuicao: 100 });
    if (config.vetoresHibridos.includes('lawfare')) {
      const g = cp.infocog.gatilhos;
      if (g.length) cp = { ...cp, infocog: IC.lancarDesinformacao(cp.infocog, cp.c2, { quem: VERMELHO, turno: t, intensidade: cp.config.intensidadeHibrida, gatilho: g[g.length - 1] }, params) };
      else if (t % params.HIBRIDO.fabricarACada === 0)
        cp = { ...cp, infocog: IC.lancarDesinformacao(cp.infocog, cp.c2, { quem: VERMELHO, turno: t, intensidade: cp.config.intensidadeHibrida / 2 }, params) };
    }
  }

  /** Confere a decisão Vermelha sem mudar nada (lança se inválida). */
  function validarDecisaoVermelho(dv) {
    if (!config.trilhas.defesa) throw new Error('engine: trilha de defesa desligada — não há Vermelho a decidir');
    const acoes = dv.acoes ?? [];
    if (acoes.length > params.HIBRIDO.maxAcoesHumano) throw new Error(`engine: no máximo ${params.HIBRIDO.maxAcoesHumano} ações por turno`);
    for (const a of acoes) {
      if (!config.vetoresHibridos.includes(a.vetor) || !HV[a.vetor]?.peso) throw new Error(`engine: vetor indisponível ${a.vetor}`);
      const alvo = infra.find(i => i.id === a.alvo);
      if (!alvo || alvo.sp <= 0 || !HV[a.vetor].alvos.includes(alvo.tipo) || !config.areasAtivas.includes(alvo.area))
        throw new Error(`engine: alvo inválido ${a.alvo} para ${a.vetor}`);
    }
    if (dv.empregoAberto && cp.escalada.nivel < params.HIBRIDO.empregoAberto.nivelMin) throw new Error('engine: emprego aberto só a partir de N2');
    if (dv.desinformacao && !config.vetoresHibridos.includes('lawfare')) throw new Error('engine: lawfare inativo');
  }

  /** Decisão de um jogador Vermelho (1×1 ou Célula Branca). Mesmas regras do motor. */
  function aplicarDecisaoVermelho(dv) {
    for (const a of dv.acoes ?? []) acaoVermelha(a.vetor, infra.find(i => i.id === a.alvo));
    if (dv.empregoAberto) eventos.push({ tipo: 'emprego_aberto', atribuicao: 100 });
    if (dv.desinformacao) {
      cp = { ...cp, infocog: IC.lancarDesinformacao(cp.infocog, cp.c2, { quem: VERMELHO, turno: t,
        intensidade: dv.desinformacao.intensidade ?? cp.config.intensidadeHibrida, gatilho: dv.desinformacao.gatilho ?? null }, params) };
    }
  }

  // ─── Etapa 2: decisões Azuis ──────────────────────────────────────────────

  /**
   * @param {object} [d]
   * @param {object} [d.compaaz]   { pedidos: [{ apoio, area }], campanha: null | { tipo, esclarece? } }
   * @param {object} [d.prontidao] { estacoes: [estações decididas por humanos], acionar: [meioId] }
   * @param {object} [d.estacoes]  { [estacao]: [{ meio, contato, etapaAlvo? } | { meio, patrulha: true }] }
   *   Estação ausente = doutrina. A lista é executada na ordem; o que não for
   *   válido no momento (meio usado, contato encerrado, orçamento esgotado) é
   *   ignorado e registrado.
   * @returns {{proposta: object|null, recusas: string[]}}
   */
  function decidirAzul(d = {}) {
    if (fase !== 'azul') throw new Error(`engine: decidirAzul fora de ordem (fase ${fase})`);
    const recusas = [];
    retrato = { ab: abertasConhecidas(), hc: hibConhecidos() };

    // COMPAAz: apoios e campanha
    if (d.compaaz) {
      for (const p of d.compaaz.pedidos ?? []) {
        const r = AP.solicitar(cp.apoio, cp.c2, { quem: AZUL, apoio: p.apoio, area: p.area, turno: t }, params);
        cp = { ...cp, apoio: r.estado };
        if (!r.pedido) recusas.push(`apoio ${p.apoio}@${p.area}: ${r.motivo}`);
      }
      if (d.compaaz.campanha) {
        const c = d.compaaz.campanha;
        const r = IC.lancarCampanha(cp.infocog, cp.c2, { quem: AZUL, turno: t, fusao: fusaoBase, tipo: c.tipo,
          esclarece: c.esclarece ?? null, prova: c.tipo === 'prova_documentada' ? prova : null }, params);
        cp = { ...cp, infocog: r.estado };
        if (!r.aceita) recusas.push(`campanha ${c.tipo}: ${r.motivo}`);
      }
    } else doutrinaCOMPAAz();
    prova = null;

    // Prontidão: cada estação aciona os próprios meios; a doutrina cuida das
    // estações que nenhum humano comanda.
    const humanas = new Set(d.prontidao?.estacoes ?? []);
    for (const id of d.prontidao?.acionar ?? []) {
      const m = azul.find(x => x.id === id);
      if (!m || !humanas.has(m.estacao)) { recusas.push(`acionar ${id}: meio de estação que não decide`); continue; }
      pront = OB.acionar(pront, id, t);
    }
    doutrinaProntidao(humanas);

    // SAR / desastre (prioridade à vida; o Navio SAR é acionado de imediato)
    for (const id of tarefas) {
      const tf = crises[id];
      if (tf.atendida || cp.crises.find(c => c.id === id)?.status !== 'ativa') continue;
      if (!tf.detectada && (t > tf.inicio || rngQ() < pQuadro(tf.area))) {
        tf.detectada = true;
        marcoCrise(id, (e, c) => CA.registrarDeteccaoCrise(e, c.id, t, params));
      }
      if (!tf.detectada) continue;
      const est = responsavel(tf.area);
      for (const m of azul) if (m.estacao === est && pront.designacao[m.id].escalao === 'sar') pront = OB.acionar(pront, m.id, t);
      const meios = disponiveis(est, m => m.category === 'surface' && m.type !== 'usv' && m.type !== 'rov')
        .sort((a, b) => (pront.designacao[a.id].escalao === 'sar' ? -1 : 0) - (pront.designacao[b.id].escalao === 'sar' ? -1 : 0));
      if (meios.length >= tf.necessarias) {
        meios.slice(0, tf.necessarias).forEach(m => { usados.add(m.id); posicao[m.id] = null; });
        tf.atendida = true;
        marcoCrise(id, (e, c) => CA.registrarRespostaCrise(e, c.id, t, true, params));
        cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'sar_sucesso', t, params) };
        registroTurno.push({ tipo: 'sar', crise: id, area: tf.area, meios: meios.slice(0, tf.necessarias).map(m => m.nome) });
      }
    }

    // Respostas das estações
    const novaPenalidade = {};
    for (const est of estacoesAtivas()) {
      const orc = orcamento(est);
      if (orc.surto) novaPenalidade[est] = D.penalidadeSurto;
      if (d.estacoes && d.estacoes[est]) executarLista(est, orc.n, d.estacoes[est], recusas);
      else doutrinaEstacao(est, orc.n);
    }
    Object.keys(penalidade).forEach(k => delete penalidade[k]);
    Object.assign(penalidade, novaPenalidade);

    retrato = null;
    efeitos();
    proposta = ES.avaliarGatilhos(cp.escalada, eventos, params).proposta;
    fase = 'fechamento';
    return { proposta, recusas };
  }

  function doutrinaCOMPAAz() {
    const areaMax = itens => {
      const c = config.areasAtivas.map(a => [a, itens.filter(x => x.area === a).length]);
      c.sort((x, y) => y[1] - x[1]);
      return c[0] && c[0][1] > 0 ? c[0][0] : null;
    };
    const cobre = (apoio, area) => cp.apoio.pedidos.some(p => p.apoio === apoio && p.area === area && p.concedido && p.vigenteAte >= t);
    const pedir = (apoio, area) => {
      if (!area || cobre(apoio, area)) return;
      cp = { ...cp, apoio: AP.solicitar(cp.apoio, cp.c2, { quem: AZUL, apoio, area, turno: t }, params).estado };
    };
    const ab = abertasConhecidas(), hc = hibConhecidos();
    if (config.fatores.A_MPA === 1) pedir('mpa', areaMax([...ab, ...hc]));
    pedir('pf', areaMax(ab.filter(o => o.tipo === 'narcotrafico')));
    pedir('rf', areaMax(ab.filter(o => o.tipo === 'contrabando')));
    pedir('ibama', areaMax(ab.filter(o => o.tipo === 'pesca_iuu' || o.tipo === 'crime_ambiental')));
    pedir('censipam', areaMax(hc));
    pedir('intl', areaMax(hc.filter(h => h.contato.atribuicao < 70)));
    const g = cp.infocog.gatilhos;
    let camp = null;
    if (g.length && prova) camp = { tipo: 'prova_documentada', prova, esclarece: g[0] };
    else if (g.length) camp = { tipo: 'transparencia', esclarece: g[0] };
    else if (cp.infocog.apoio < D.apoioParaComunicar) camp = { tipo: 'comunicacao_estrategica' };
    else if (config.vetoresHibridos.includes('lawfare') && t % D.prebunkingACada === 1) camp = { tipo: 'prebunking' };
    if (camp) cp = { ...cp, infocog: IC.lancarCampanha(cp.infocog, cp.c2, { quem: AZUL, turno: t, fusao: fusaoBase, ...camp }, params).estado };
  }

  function doutrinaProntidao(humanas = new Set()) {
    if (t === 1) for (const m of azul) if (!humanas.has(m.estacao) && ['sar', 'fpe'].includes(pront.designacao[m.id].escalao)) pront = OB.acionar(pront, m.id, t);
    for (const est of ['ComemCh', ...params.AREAS_DN.map(a => a.estacao)]) {
      if (humanas.has(est)) continue;
      if (acumulo(est) > disponiveis(est, () => true).length)
        for (const m of azul) if (m.estacao === est && pront.designacao[m.id].escalao === 'demais') pront = OB.acionar(pront, m.id, t);
    }
  }

  function encontrar(meio, item, hibrido, etapaAlvoForcada) {
    const nivel = cp.escalada.nivel;
    const unidade = OB.unidadeParaEncontro(meio, azul, params);
    const contato = item.contato;
    const atribAntes = contato.atribuicao;
    let teto, etapaAlvo, tipoApoio;
    if (hibrido) {
      teto = IC.roeEfetiva(nivel, cp.infocog.apoio, params).tetoRoe;
      const autorizada = A.respostaAutorizada(atribAntes, teto, params);
      const neutra = HV[item.vetor].etapaNeutraliza;
      etapaAlvo = etapaAlvoForcada ?? (item.restante <= D.urgencia && iE(neutra) > iE(autorizada) ? neutra : autorizada);
      if (iE(etapaAlvo) > iE(teto)) etapaAlvo = teto;
      tipoApoio = 'hibrido';
    } else {
      teto = params.TETO_CONSTABULAR;
      etapaAlvo = etapaAlvoForcada ?? params.TIPOS_OCORRENCIA[item.tipo].etapaRepressao;
      if (iE(etapaAlvo) > iE(teto)) etapaAlvo = teto;
      tipoApoio = item.tipo;
    }
    const chave = `${etapaAlvo}@${item.area}`;
    const u = AP.usarApoios(cp.apoio, { turno: t, area: item.area, tipo: tipoApoio, unidade, contato,
      fusao: fusaoBase, ritmo: CA.ritmoDeEvidencia(cp, chave, params), etapa: etapaAlvo }, params);
    cp = CA.registrarPadrao({ ...cp, apoio: u.estado }, chave);
    const enc = EN.resolverEncontro({ ...u.args, contato, etapaAlvo, tetoRoe: teto, rng: rngE }, params);
    usados.add(meio.id);
    posicao[meio.id] = { col: item.col, row: item.row };
    if (enc.efetivo && enc.etapas.length) {
      const tentada = enc.etapas[enc.etapas.length - 1].etapa;
      const r = IC.registrarAcaoAzul(cp.infocog, {
        turno: t, etapa: tentada, id: `ACT-${t}-${++acaoSeq}`,
        // Constabular: a decisão de apresar vem depois da inspeção, com a prova obtida no próprio encontro.
        atribuicao: hibrido ? atribAntes : enc.atribuicao.depois,
        ...(hibrido ? { nivel, tipoAcao: acaoDaEtapa(tentada, nivel) } : {}),
      }, params);
      cp = { ...cp, infocog: r.estado };
      if (iE(enc.etapaAtingida) >= iE('inspecao')) prova = { atribuicao: Math.max(prova?.atribuicao ?? 0, enc.atribuicao.depois) };
    }
    registroTurno.push({ tipo: 'encontro', unidade: meio.nome, meio: meio.id, contato: item.id, hibrido, etapaAlvo, resultado: enc,
                         antes: atribAntes, depois: enc.atribuicao.depois });
    return enc;
  }

  function resolverHibrido(meio, h, etapaAlvo) {
    const enc = encontrar(meio, h, true, etapaAlvo);
    if (!enc.efetivo) return;
    h.contato = { ...h.contato, atribuicao: enc.atribuicao.depois };
    if (iE(enc.etapaAtingida) >= iE(HV[h.vetor].etapaNeutraliza)) h.status = 'neutralizado';
    if (!h.atribuido && h.contato.atribuicao >= 70) {
      h.atribuido = true;
      eventos.push({ tipo: 'incidente_hibrido', atribuicao: h.contato.atribuicao });
    }
  }
  function resolverOcorrencia(meio, atual, etapaAlvo) {
    const enc = encontrar(meio, atual, false, etapaAlvo);
    const r = CO.registrarResposta(cp.constab, atual.id, enc, params);
    cp = { ...cp, constab: r.estado };
    if (r.eventoHibrido) eventos.push(r.eventoHibrido);
    if (r.reprimida) cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'reprimida', t, params) };
  }
  function patrulhar(meio, est) {
    const h = hib.filter(x => ativo(x) && !x.conhecido && (est === 'ComemCh' || responsavel(x.area) === est)).sort(sortId)[0];
    if (!h) { usados.add(meio.id); registroTurno.push({ tipo: 'patrulha', unidade: meio.nome, meio: meio.id, resultado: null }); return false; }
    const enc = encontrar(meio, h, true, 'identificacao');
    if (enc.efetivo && iE(enc.etapaAtingida) >= iE('deteccao')) {
      h.contato = { ...h.contato, atribuicao: enc.atribuicao.depois };
      cp = CA.revelarContato(cp, h.id);
      tornarConhecido(h);
      if (iE(enc.etapaAtingida) >= iE(HV[h.vetor].etapaNeutraliza)) h.status = 'neutralizado';
    }
    return true;
  }

  /** Doutrina de uma estação: híbrido por urgência, depois ocorrências, depois patrulha. */
  function doutrinaEstacao(est, n) {
    let restam = n;
    const itensHib = hib.filter(h => ativo(h) && h.conhecido && (est === 'ComemCh' || responsavel(h.area) === est))
      .sort((a, b) => a.restante - b.restante || sortId(a, b));
    const itensCon = est === 'ComemCh' ? [] : (cp.constab?.ativas ?? [])
      .filter(o => conhecidos.has(o.id) && responsavel(o.area) === est)
      .sort((a, b) => a.turnosRestantes - b.turnosRestantes || sortId(a, b));
    for (const h of itensHib) {
      if (restam <= 0 || !ativo(h)) continue;
      const exigeMcm = HV[h.vetor].exigeMcm;
      const meio = disponiveis(est, m => exigeMcm ? (m.type === 'mcm' || m.type === 'rov') : PATRULHA.has(m.type))[0];
      if (!meio) continue;
      restam--;
      resolverHibrido(meio, h);
    }
    for (const o of itensCon) {
      if (restam <= 0) break;
      const atual = cp.constab.ativas.find(x => x.id === o.id);
      if (!atual) continue;
      const meio = disponiveis(est, m => CONSTABULAR.has(m.type))[0];
      if (!meio) break;
      restam--;
      resolverOcorrencia(meio, atual);
    }
    const ocultos = hib.filter(h => ativo(h) && !h.conhecido && (est === 'ComemCh' || responsavel(h.area) === est)).sort(sortId);
    for (const h of ocultos) {
      if (restam <= 0) break;
      const meio = disponiveis(est, m => PATRULHA.has(m.type))[0];
      if (!meio) break;
      restam--;
      const enc = encontrar(meio, h, true, 'identificacao');
      if (enc.efetivo && iE(enc.etapaAtingida) >= iE('deteccao')) {
        h.contato = { ...h.contato, atribuicao: enc.atribuicao.depois };
        cp = CA.revelarContato(cp, h.id);
        tornarConhecido(h);
        if (iE(enc.etapaAtingida) >= iE(HV[h.vetor].etapaNeutraliza)) h.status = 'neutralizado';
      }
    }
  }

  /** Lista de designações de um humano para a estação, com as mesmas regras. */
  function executarLista(est, n, lista, recusas) {
    let restam = n;
    for (const item of lista) {
      const rotulo = `${est}: ${item.meio} → ${item.contato ?? 'patrulha'}`;
      if (restam <= 0) { recusas.push(`${rotulo}: orçamento de ações esgotado`); continue; }
      const meio = azul.find(m => m.id === item.meio);
      if (!meio || meio.estacao !== est) { recusas.push(`${rotulo}: meio não é da estação`); continue; }
      if (!disponiveis(est, () => true).some(m => m.id === meio.id)) { recusas.push(`${rotulo}: meio indisponível (usado, não acionado ou em aprestamento)`); continue; }
      if (item.etapaAlvo != null && iE(item.etapaAlvo) < 0) { recusas.push(`${rotulo}: etapa inválida`); continue; }
      if (item.patrulha) {
        if (!PATRULHA.has(meio.type)) { recusas.push(`${rotulo}: meio não patrulha`); continue; }
        restam--; patrulhar(meio, est); continue;
      }
      const h = hib.find(x => x.id === item.contato);
      if (h) {
        if (!ativo(h) || !h.conhecido || !(est === 'ComemCh' || responsavel(h.area) === est)) { recusas.push(`${rotulo}: contato fora do alcance da estação`); continue; }
        const exigeMcm = HV[h.vetor].exigeMcm;
        if (exigeMcm ? !(meio.type === 'mcm' || meio.type === 'rov') : !PATRULHA.has(meio.type)) { recusas.push(`${rotulo}: meio inadequado ao contato`); continue; }
        restam--; resolverHibrido(meio, h, item.etapaAlvo ?? undefined); continue;
      }
      const o = cp.constab?.ativas.find(x => x.id === item.contato);
      if (o && est !== 'ComemCh' && conhecidos.has(o.id) && responsavel(o.area) === est) {
        if (!CONSTABULAR.has(meio.type)) { recusas.push(`${rotulo}: meio sem capacidade de abordagem`); continue; }
        restam--; resolverOcorrencia(meio, o, item.etapaAlvo ?? undefined); continue;
      }
      recusas.push(`${rotulo}: contato desconhecido, encerrado ou de outra área`);
    }
  }

  /** Efeitos do híbrido no prazo, investigação, marcos de crise e SLOC. */
  function efeitos() {
    for (const h of hib.filter(ativo)) {
      h.restante--;
      if (h.restante > 0) continue;
      h.status = 'efetivado';
      h.investigacaoAte = t + params.HIBRIDO.investigacao.turnos;
      tornarConhecido(h);                 // a ação consumada é percebida (o dano é visível)
      const alvo = infra.find(i => i.id === h.alvo);
      causarDano(alvo, HV[h.vetor].dano, HV[h.vetor].evento, h.contato.atribuicao);
      cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'incidente_nao_respondido', t, params) };
      registroTurno.push({ tipo: 'efeito', contato: h.id, vetor: h.vetor, alvo: h.alvo, dano: HV[h.vetor].dano });
    }
    for (const h of hib) if (h.status === 'neutralizado' && !h.contado) { h.contado = true; cont.hibExito++; }

    const INV = params.HIBRIDO.investigacao;
    for (const h of hib) {
      if (h.status !== 'efetivado' || !h.conhecido || h.atribuido || t > h.investigacaoAte) continue;
      const ritmo = AP.modificadores(cp.apoio, { turno: t, area: h.area, tipo: 'hibrido' }, params).fatorRitmo
                  * params.DIFICULDADES[cp.config.dificuldade].ritmo;
      const atr = A.acumularEvidencia(h.contato.atribuicao, INV.ganho, { negabilidade: h.contato.negabilidade, fusao: fusaoBase, ritmo }, params);
      h.contato = { ...h.contato, atribuicao: atr };
      if (atr >= INV.robusta) {
        h.atribuido = true;
        eventos.push({ tipo: HV[h.vetor].evento, atribuicao: atr, origem: h.id });
      }
    }

    for (const [id, ctx] of Object.entries(crises)) {
      if (ctx.tipo === 'constab') {
        const todas = [...(cp.constab?.encerradas ?? []), ...(cp.constab?.ativas ?? [])].filter(o => ctx.ids.includes(o.id));
        if (todas.some(o => conhecidos.has(o.id) || o.esforco > 0)) marcoCrise(id, (e, c) => CA.registrarDeteccaoCrise(e, c.id, t, params));
        const reprimidas = todas.filter(o => o.status === 'reprimida').length;
        if (reprimidas >= Math.ceil(ctx.ids.length / 2)) marcoCrise(id, (e, c) => CA.registrarRespostaCrise(e, c.id, t, true, params));
        else if (todas.length && todas.every(o => o.status !== 'ativa')) marcoCrise(id, (e, c) => CA.registrarRespostaCrise(e, c.id, t, false, params));
      } else if (ctx.tipo === 'hibrido') {
        const h = hib.find(x => x.id === ctx.id);
        if (h.conhecido) marcoCrise(id, (e, c) => CA.registrarDeteccaoCrise(e, c.id, t, params));
        if (h.status === 'neutralizado') marcoCrise(id, (e, c) => CA.registrarRespostaCrise(e, c.id, t, true, params));
        if (h.status === 'efetivado') marcoCrise(id, (e, c) => CA.registrarRespostaCrise(e, c.id, t, false, params));
      }
    }

    for (const a of config.areasAtivas) {
      if (hib.some(h => ativo(h) && h.area === a && HV[h.vetor].sloc) ||
          (cp.constab?.ativas ?? []).some(o => o.area === a && o.tipo === 'pirataria')) slocAmeacadas++;
    }
  }

  // ─── Etapa 3: fechamento ──────────────────────────────────────────────────

  /**
   * @param {boolean} [autorizacao]  decisão do COMPAAz sobre a proposta de
   *   escalada (ausente = doutrina, que autoriza)
   */
  function fecharTurno(autorizacao) {
    if (fase !== 'fechamento') throw new Error(`engine: fecharTurno fora de ordem (fase ${fase})`);
    const aut = autorizacao === undefined ? true : !!autorizacao;
    cp = { ...cp, escalada: ES.avancarTurno(cp.escalada, eventos, C2.decisorEscalada(cp.c2, () => aut, params), params).estado };

    if (cp.escalada.nivel === 3) {
      terminal = jogarTerminal(config.seed);
      desfecho = terminal.kcvPerdido ? 'derrota_vermelha_kcv' : terminal.vencedor === 'blue' ? 'conflito_vitoria_azul'
               : terminal.vencedor === 'red' ? 'conflito_vitoria_vermelha' : 'conflito_indeciso';
    }
    cp = { ...cp, infocog: IC.avancarTurno(cp.infocog, t, params) };
    if (!desfecho && cp.infocog.derrotaEstrategica) desfecho = 'derrota_estrategica_azul';
    if (!desfecho && t >= config.duracaoDias) desfecho = desfechoFinal();
    if (boletins) linhas.push(boletim().linhas);
    fase = 'inicio';
    return { desfecho, nivel: cp.escalada.nivel };
  }

  function desfechoFinal() {
    const X = params.DESFECHO;
    const m = metricas();
    return m.E2_infra >= X.infraVitoriaAzul && (m.E5_ordem ?? 1) >= X.ordemVitoriaAzul && cp.escalada.nivelMax < 3 ? 'vitoria_azul'
         : m.E2_infra < X.infraVitoriaVermelha ? 'vitoria_vermelha' : 'indecisa';
  }

  // ─── Leitura ──────────────────────────────────────────────────────────────

  function metricas() {
    const cm = cp.constab ? CO.metricas(cp.constab) : null;
    const E2 = sp0 ? 100 * infra.reduce((s, i) => s + i.sp, 0) / sp0 : 100;
    return {
      E1_atrib: cont.hibTotal ? (cont.hibExito + hib.filter(h => h.atribuido && h.status !== 'neutralizado').length) / cont.hibTotal : null,
      E2_infra: E2,
      E3_escalada: ES.turnosAbaixoDoLimiar(cp.escalada),
      E4_custopol: cp.infocog.custoPolitico,
      E5_ordem: cm ? cm.E5_ordem : null,
      E6_dispersao: cm ? cm.E6_dispersao : null,
      n_ocorr_crim: cm ? cm.n_ocorr_crim : 0,
      ocorr_reprimidas: cm ? cm.ocorr_reprimidas : 0,
      ...cp.apoio.contadores,
      sloc_idx: turnos ? 1 - slocAmeacadas / (turnos * config.areasAtivas.length) : 1,
      kcv_perdido: terminal?.kcvPerdido ? 1 : 0,
      nivel_max: cp.escalada.nivelMax,
      atrito_terminal: terminal ? terminal.atrito : null,
      n_incidentes_hibridos: cont.hibTotal,
      apoio_publico_final: cp.infocog.apoio,
      crise_deteccao_media: media(cp.crises.map(c => c.deteccao.nota)),
      crise_resposta_media: media(cp.crises.map(c => c.resposta.nota)),
    };
  }

  function boletim(mostrarNumeros) {
    const encontros = registroTurno.filter(r => r.tipo === 'encontro')
      .map(r => ({ unidade: r.unidade, contato: r.contato, resultado: r.resultado }));
    const atribuicoes = registroTurno.filter(r => r.tipo === 'encontro' && r.hibrido)
      .map(r => ({ contato: r.contato, antes: r.antes, depois: r.depois }));
    return CA.gerarBoletim({ ...cp, turno: t }, { encontros, atribuicoes, mostrarNumeros }, params);
  }

  const vistaMeio = m => ({
    id: m.id, nome: m.nome, classe: m.classe, type: m.type, category: m.category, estacao: m.estacao, fator: m.fator,
    escalao: pront.designacao[m.id].escalao, acionado: m.id in pront.acionamentos,
    prontoEm: OB.podeMoverAPartirDe(pront, m.id),
    disponivel: fase === 'azul' && (pront.designacao[m.id].escalao === null ? (m.type === 'usv' || m.type === 'rov') : OB.podeMover(pront, m.id, t)) && !usados.has(m.id),
    col: posicao[m.id]?.col ?? m.col, row: posicao[m.id]?.row ?? m.row,
  });
  const vistaInfra = i => ({ id: i.id, nome: i.nome, tipo: i.tipo, area: i.area, sp: i.sp, spMax: i.spMax, hexes: i.hexes });

  function comum() {
    const nivel = cp.escalada.nivel;
    return {
      turno: t, fase, duracao: config.duracaoDias, desfecho,
      config: { modalidade: config.modalidade, dificuldade: cp.config.dificuldade, areasAtivas: config.areasAtivas,
                trilhas: config.trilhas, fatores: config.fatores, apoioExterno: config.apoioExterno,
                celulaBranca: config.celulaBranca, mostrarNumeros: cp.config.mostrarNumeros },
      postura: { ...params.NIVEIS[nivel], nivelMax: cp.escalada.nivelMax, historico: cp.escalada.historico },
      roe: IC.roeEfetiva(nivel, cp.infocog.apoio, params),
      informacional: { apoio: cp.infocog.apoio, custoPolitico: cp.infocog.custoPolitico, teto: params.INFOCOG.tetoCustoPolitico,
                       derrotaEstrategica: cp.infocog.derrotaEstrategica },
      infraestrutura: infra.map(vistaInfra),
      crises: cp.crises.filter(c => c.status !== 'agendada').map(c => ({ ...c, rotulo: params.CRISES[c.tipo].rotulo })),
      metricas: metricas(),
      terminal,
    };
  }

  /** O que o Azul vê (quadro comum; névoa da dificuldade). */
  function situacaoAzul() {
    const vista = CA.vistaHibrida(cp, hibConhecidos().map(h => ({ id: h.id, atribuicao: h.contato.atribuicao, intencao: 'hostil' })), params);
    const porId = Object.fromEntries(hib.map(h => [h.id, h]));
    return {
      ...comum(),
      ocorrencias: abertasConhecidas().map(o => ({ ...CO.vistaDoJogador(o), rotulo: params.TIPOS_OCORRENCIA[o.tipo].rotulo,
        responsavel: responsavel(o.area), etapaRepressao: params.TIPOS_OCORRENCIA[o.tipo].etapaRepressao })),
      contatosHibridos: vista.map(v => {
        const h = porId[v.id];
        const intencao = v.intencao !== 'desconhecida';
        return { id: h.id, area: h.area, col: h.col, row: h.row, responsavel: responsavel(h.area), restante: h.restante,
                 atribuicao: h.contato.atribuicao, classe: params.CLASSES_ATRIBUICAO.find(c => h.contato.atribuicao >= c.min).classe,
                 intencao: v.intencao, vetor: intencao ? h.vetor : null, rotulo: intencao ? params.VETORES_HIBRIDOS[h.vetor].rotulo : 'Contato de interesse',
                 exigeMcm: !!HV[h.vetor].exigeMcm };
      }),
      tarefas: tarefas.map(id => ({ crise: id, ...crises[id] })).filter(x => !x.atendida && cp.crises.find(c => c.id === x.crise)?.status === 'ativa' && x.detectada !== false),
      meios: azul.map(vistaMeio),
      orcamentos: Object.fromEntries(estacoesAtivas().map(e => [e, { ...orcamento(e), penalidade: penalidade[e] ?? 0 }])),
      responsavelPorArea: { ...cp.responsavelPorArea },
      apoios: cp.apoio.pedidos.filter(p => p.vigenteAte >= t),
      contadoresApoio: cp.apoio.contadores,
      gatilhos: cp.infocog.gatilhos,
      provaDisponivel: prova,
      registro: registroTurno,
      boletim: t ? boletim().linhas : [],
      proposta,
    };
  }

  /** O que o Vermelho vê: a própria campanha e a postura pública do Azul. */
  function situacaoVermelho() {
    return {
      ...comum(),
      acoes: hib.map(h => ({ id: h.id, vetor: h.vetor, alvo: h.alvo, area: h.area, col: h.col, row: h.row, status: h.status,
                             restante: h.restante, atribuicao: h.contato.atribuicao, percebida: h.conhecido })),
      vetores: config.vetoresHibridos.filter(v => HV[v]?.peso > 0).map(v => ({ vetor: v, rotulo: params.VETORES_HIBRIDOS[v].rotulo, alvos: HV[v].alvos })),
      lawfare: config.vetoresHibridos.includes('lawfare'),
      gatilhos: cp.infocog.gatilhos,
      maxAcoes: params.HIBRIDO.maxAcoesHumano,
      empregoAbertoPermitido: cp.escalada.nivel >= params.HIBRIDO.empregoAberto.nivelMin,
      areaAlvo: cp.config.areaAlvoHibrida,
    };
  }

  /** O que a Célula Branca vê: tudo. */
  function situacaoCelula() {
    return { ...situacaoAzul(), vermelho: situacaoVermelho(), verdade: {
      ocorrencias: cp.constab?.ativas ?? [], hibridos: hib, conhecidos: [...conhecidos] },
      registroCelula: cp.registroCelula, anulados: cp.anulados };
  }

  /** Intervenção da Célula Branca (campaign.intervir), entre os lances. */
  function intervir(req) { cp = CA.intervir(cp, { ...req, turno: req.turno ?? t }, params); return cp.registroCelula[cp.registroCelula.length - 1]; }

  function resultado() {
    return { metricas: metricas(), desfecho, turnos, terminal, ...(boletins ? { boletins: linhas } : {}) };
  }

  return {
    iniciarTurno, decidirAzul, fecharTurno, intervir,
    situacaoAzul, situacaoVermelho, situacaoCelula, boletim, metricas, resultado,
    get fase() { return fase; }, get turno() { return t; }, get encerrada() { return !!desfecho; },
    get c2() { return cp.c2; }, get config() { return cp.config; },
  };
}

module.exports = { criarPartida, jogarTerminal, acaoDaEtapa, PATRULHA, CONSTABULAR };
