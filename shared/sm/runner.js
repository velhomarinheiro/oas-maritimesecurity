'use strict';

/**
 * runner.js — Runner da OAS-SM: joga uma campanha inteira sem humanos e roda
 * os desenhos experimentais (Desenho Experimental v1.3 §5–§6).
 *
 * Uma partida é uma campanha de turnos de 24 h sobre os módulos SM-1 a SM-7:
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

// ─── Escalada terminal (N3): o jogo base, intocado ───────────────────────────

/**
 * Joga a partida do wargame base com a semente (motor de salva e OOB base,
 * pacote completo de capacidades). Devolve a perda do KCV e o atrito Azul.
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

// ─── Uma partida ─────────────────────────────────────────────────────────────

/**
 * Joga uma campanha completa.
 * @param {object} cfg  configuração (campaign.configurarCampanha)
 * @param {object} [opts]
 * @param {boolean} [opts.boletins]  guarda as linhas do boletim de cada turno
 * @returns {{metricas: object, desfecho: string, turnos: number, terminal: object|null, boletins?: string[][]}}
 */
function jogarPartida(cfg, { boletins = false } = {}, params = P) {
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
  const decidirEscalada = C2.decisorEscalada(cp.c2, () => true, params);

  const hib = [];                       // ações marítimas do híbrido
  const cont = { hibTotal: 0, hibExito: 0 };
  const conhecidos = new Set();         // ocorrências no quadro comum
  const penalidade = {};                // surto do turno anterior, por estação
  const crises = {};                    // contexto das crises disparadas
  const tarefas = [];                   // SAR / desastre
  let prova = null;                     // melhor prova do turno anterior (campanha)
  let slocAmeacadas = 0, acaoSeq = 0, hibSeq = 0, turnos = 0;
  let terminal = null, desfecho = null;
  const linhas = [];

  const ativo = h => h.status === 'ativo';
  const responsavel = area => cp.responsavelPorArea[area];
  const areasDe = est => config.areasAtivas.filter(a => responsavel(a) === est);
  const sortId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  function bonusUsv(area) {
    const est = responsavel(area);
    return azul.some(m => (m.type === 'usv' || m.type === 'rov') && m.estacao === est) || azul.some(m => m.type === 'uav')
      ? D.quadro.bonusUsv : 0;
  }
  function pQuadro(area, t) {
    const f = Math.min(1, fusaoBase + AP.modificadores(cp.apoio, { turno: t, area, tipo: 'quadro' }, params).bonusFusao);
    return Math.min(D.quadro.teto, D.quadro.base + D.quadro.porFusao * f + bonusUsv(area));
  }

  function novoHibrido(vetor, alvo, t, atribuicao = 0) {
    const h = {
      id: `HX-${t}-${++hibSeq}`, vetor, area: alvo.area, alvo: alvo.id,
      contato: { atribuicao, negabilidade: params.VETORES_HIBRIDOS[vetor].negabilidade ?? 'alta', evasao: HV[vetor].evasao ?? 0 },
      restante: HV[vetor].janela, status: 'ativo', conhecido: false, atribuido: false, criadoEm: t,
    };
    hib.push(h);
    cont.hibTotal++;
    return h;
  }

  function causarDano(alvo, d, evento, atribuicao, t, eventos) {
    alvo.sp = Math.max(0, alvo.sp - d);
    eventos.push({ tipo: evento, atribuicao });
    cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'dano_infra', t, params) };
  }

  function tornarConhecido(h, eventos) {
    if (h.conhecido) return;
    h.conhecido = true;
    eventos.push({ tipo: 'incidente_hibrido', atribuicao: h.contato.atribuicao });
  }

  function marcoCrise(id, fn) {
    const c = cp.crises.find(x => x.id === id);
    if (c && c.status === 'ativa') cp = fn(cp, c);
  }

  for (let t = 1; t <= config.duracaoDias && !desfecho; t++) {
    turnos = t;
    const eventos = [];
    const usados = new Set();

    // 1. Crises
    const antes = new Set(cp.crises.filter(c => c.status === 'ativa').map(c => c.id));
    const rc = CA.avancarCrises(cp, t, params);
    cp = rc.estado;
    for (const c of cp.crises) {          // encerradas por prazo neste turno
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
        if (alvo) crises[ef.crise] = { tipo: 'hibrido', id: novoHibrido('sabotagem_submarina', alvo, t, ef.hibrido.atribuicao).id };
      } else if (ef.sar || ef.desastre) {
        crises[ef.crise] = { tipo: 'tarefa', area: ef.area, necessarias: ef.sar ? 1 : 2, detectada: false, atendida: false, inicio: t };
        tarefas.push(ef.crise);
      }
    }

    // 2. Ocorrências constabulares
    if (cp.constab) {
      const r = CO.avancarTurno(cp.constab, { intensidade: config.intensidadeHibrida, areaAlvo: config.areaAlvoHibrida }, params);
      cp = { ...cp, constab: r.estado };
    }

    // 3. Agente Vermelho
    if (config.trilhas.defesa && config.intensidadeHibrida > 0) {
      const vetores = config.vetoresHibridos.filter(v => HV[v]?.peso > 0).map(v => [v, HV[v].peso]);
      const n = vetores.length ? CO.poisson(rngV, params.HIBRIDO.acoesPorTurno * config.intensidadeHibrida) : 0;
      for (let k = 0; k < n; k++) {
        const vetor = pickPeso(rngV, vetores);
        const V = HV[vetor];
        let alvos = infra.filter(i => i.sp > 0 && V.alvos.includes(i.tipo) && config.areasAtivas.includes(i.area)).sort(sortId);
        const naArea = alvos.filter(i => i.area === config.areaAlvoHibrida);
        if (naArea.length && rngV() < params.HIBRIDO.pAreaAlvo) alvos = naArea;
        if (!alvos.length) continue;
        const alvo = alvos[Math.floor(rngV() * alvos.length)];
        if (V.maritimo) { novoHibrido(vetor, alvo, t); continue; }
        // Ciberataque: resolve no turno; a defesa depende da fusão/consciência.
        cont.hibTotal++;
        if (rngV() < 1 - 0.5 * fusaoBase) causarDano(alvo, V.dano, V.evento, 10, t, eventos);
        else cont.hibExito++;
      }
      const EA = params.HIBRIDO.empregoAberto;
      if (cp.escalada.nivel >= EA.nivelMin && config.intensidadeHibrida >= EA.intensidadeMin && rngV() < EA.pPorTurno)
        eventos.push({ tipo: 'emprego_aberto', atribuicao: 100 });
      if (config.vetoresHibridos.includes('lawfare')) {
        const g = cp.infocog.gatilhos;
        if (g.length) cp = { ...cp, infocog: IC.lancarDesinformacao(cp.infocog, cp.c2, { quem: VERMELHO, turno: t, intensidade: config.intensidadeHibrida, gatilho: g[g.length - 1] }, params) };
        else if (t % params.HIBRIDO.fabricarACada === 0)
          cp = { ...cp, infocog: IC.lancarDesinformacao(cp.infocog, cp.c2, { quem: VERMELHO, turno: t, intensidade: config.intensidadeHibrida / 2 }, params) };
      }
    }

    // 4. Quadro operacional comum
    const oculta = params.DIFICULDADES[config.dificuldade].ocultacaoAteContato;
    for (const o of cp.constab?.ativas ?? []) {
      if (!conhecidos.has(o.id) && rngQ() < pQuadro(o.area, t)) conhecidos.add(o.id);
    }
    for (const h of hib.filter(ativo)) {
      if (h.conhecido || oculta) continue;
      if (rngQ() < pQuadro(h.area, t) * (1 - 0.5 * h.contato.evasao)) tornarConhecido(h, eventos);
    }

    // 5. COMPAAz: apoios e campanha informacional
    const abertasConhecidas = (cp.constab?.ativas ?? []).filter(o => conhecidos.has(o.id));
    const hibConhecidos = hib.filter(h => ativo(h) && h.conhecido);
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
    if (config.fatores.A_MPA === 1) pedir('mpa', areaMax([...abertasConhecidas, ...hibConhecidos]));
    pedir('pf', areaMax(abertasConhecidas.filter(o => o.tipo === 'narcotrafico')));
    pedir('rf', areaMax(abertasConhecidas.filter(o => o.tipo === 'contrabando')));
    pedir('ibama', areaMax(abertasConhecidas.filter(o => o.tipo === 'pesca_iuu' || o.tipo === 'crime_ambiental')));
    pedir('censipam', areaMax(hibConhecidos));
    pedir('intl', areaMax(hibConhecidos.filter(h => h.contato.atribuicao < 70)));
    {
      const g = cp.infocog.gatilhos;
      let camp = null;
      if (g.length && prova) camp = { tipo: 'prova_documentada', prova, esclarece: g[0] };
      else if (g.length) camp = { tipo: 'transparencia', esclarece: g[0] };
      else if (cp.infocog.apoio < D.apoioParaComunicar) camp = { tipo: 'comunicacao_estrategica' };
      else if (config.vetoresHibridos.includes('lawfare') && t % D.prebunkingACada === 1) camp = { tipo: 'prebunking' };
      if (camp) cp = { ...cp, infocog: IC.lancarCampanha(cp.infocog, cp.c2, { quem: AZUL, turno: t, fusao: fusaoBase, ...camp }, params).estado };
    }
    prova = null;

    // 6. Prontidão
    if (t === 1) for (const m of azul) if (['sar', 'fpe'].includes(pront.designacao[m.id].escalao)) pront = OB.acionar(pront, m.id, t);
    const disponiveis = (est, filtro) => azul
      .filter(m => m.estacao === est && !usados.has(m.id) && filtro(m) &&
        // Não tripulados (fora dos escalões) estão prontos de imediato; aeronaves, GptFN e o centro de fusão não respondem.
        (pront.designacao[m.id].escalao === null ? (m.type === 'usv' || m.type === 'rov') : OB.podeMover(pront, m.id, t)))
      .sort((a, b) => a.prioridade - b.prioridade || sortId(a, b));
    const acumulo = est => (est === 'ComemCh' ? hibConhecidos.length
      : abertasConhecidas.filter(o => responsavel(o.area) === est).length + hibConhecidos.filter(h => responsavel(h.area) === est).length);
    for (const est of ['ComemCh', ...params.AREAS_DN.map(a => a.estacao)]) {
      if (acumulo(est) > disponiveis(est, () => true).length)
        for (const m of azul) if (m.estacao === est && pront.designacao[m.id].escalao === 'demais') pront = OB.acionar(pront, m.id, t);
    }

    // 7a. SAR / desastre (prioridade à vida)
    for (const id of tarefas) {
      const tf = crises[id];
      if (tf.atendida || cp.crises.find(c => c.id === id)?.status !== 'ativa') continue;
      if (!tf.detectada && (t > tf.inicio || rngQ() < pQuadro(tf.area, t))) {
        tf.detectada = true;
        marcoCrise(id, (e, c) => CA.registrarDeteccaoCrise(e, c.id, t, params));
      }
      if (!tf.detectada) continue;
      const est = responsavel(tf.area);
      for (const m of azul) if (m.estacao === est && pront.designacao[m.id].escalao === 'sar') pront = OB.acionar(pront, m.id, t);
      const meios = disponiveis(est, m => m.category === 'surface' && m.type !== 'usv' && m.type !== 'rov')
        .sort((a, b) => (pront.designacao[a.id].escalao === 'sar' ? -1 : 0) - (pront.designacao[b.id].escalao === 'sar' ? -1 : 0));
      if (meios.length >= tf.necessarias) {
        meios.slice(0, tf.necessarias).forEach(m => usados.add(m.id));
        tf.atendida = true;
        marcoCrise(id, (e, c) => CA.registrarRespostaCrise(e, c.id, t, true, params));
        cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'sar_sucesso', t, params) };
      }
    }

    // 7b. Respostas das estações
    const nivel = cp.escalada.nivel;
    const encontrar = (meio, item, hibrido, etapaAlvoForcada) => {
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
        etapaAlvo = params.TIPOS_OCORRENCIA[item.tipo].etapaRepressao;
        tipoApoio = item.tipo;
      }
      const chave = `${etapaAlvo}@${item.area}`;
      const u = AP.usarApoios(cp.apoio, { turno: t, area: item.area, tipo: tipoApoio, unidade, contato,
        fusao: fusaoBase, ritmo: CA.ritmoDeEvidencia(cp, chave, params), etapa: etapaAlvo }, params);
      cp = CA.registrarPadrao({ ...cp, apoio: u.estado }, chave);
      const enc = EN.resolverEncontro({ ...u.args, contato, etapaAlvo, tetoRoe: teto, rng: rngE }, params);
      usados.add(meio.id);
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
      return enc;
    };

    const orcamento = est => {
      const base = D.acoesPorEstacao - (penalidade[est] ?? 0);
      return acumulo(est) > base ? { n: base + D.surto, surto: true } : { n: base, surto: false };
    };
    const novaPenalidade = {};
    const estacoes = ['ComemCh', ...params.AREAS_DN.filter(a => config.areasAtivas.includes(a.id)).map(a => a.estacao)];
    for (const est of [...new Set(estacoes)]) {
      const orc = orcamento(est);
      let restam = orc.n;
      if (orc.surto) novaPenalidade[est] = D.penalidadeSurto;
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
        const enc = encontrar(meio, h, true);
        if (!enc.efetivo) continue;
        h.contato = { ...h.contato, atribuicao: enc.atribuicao.depois };
        if (iE(enc.etapaAtingida) >= iE(HV[h.vetor].etapaNeutraliza)) { h.status = 'neutralizado'; }
        if (!h.atribuido && h.contato.atribuicao >= 70) {
          h.atribuido = true;
          eventos.push({ tipo: 'incidente_hibrido', atribuicao: h.contato.atribuicao });
        }
      }
      for (const o of itensCon) {
        if (restam <= 0) break;
        const atual = cp.constab.ativas.find(x => x.id === o.id);
        if (!atual) continue;
        const meio = disponiveis(est, m => CONSTABULAR.has(m.type))[0];
        if (!meio) break;
        restam--;
        const enc = encontrar(meio, atual, false);
        const r = CO.registrarResposta(cp.constab, atual.id, enc, params);
        cp = { ...cp, constab: r.estado };
        if (r.eventoHibrido) eventos.push(r.eventoHibrido);
        if (r.reprimida) cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'reprimida', t, params) };
      }
      // Patrulha: meios livres buscam contatos híbridos ainda fora do quadro.
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
          tornarConhecido(h, eventos);
          if (iE(enc.etapaAtingida) >= iE(HV[h.vetor].etapaNeutraliza)) h.status = 'neutralizado';
        }
      }
    }
    Object.keys(penalidade).forEach(k => delete penalidade[k]);
    Object.assign(penalidade, novaPenalidade);

    // 8. Efeitos do híbrido no prazo
    for (const h of hib.filter(ativo)) {
      h.restante--;
      if (h.restante > 0) continue;
      h.status = 'efetivado';
      h.investigacaoAte = t + params.HIBRIDO.investigacao.turnos;
      tornarConhecido(h, eventos);        // a ação consumada é percebida (o dano é visível)
      const alvo = infra.find(i => i.id === h.alvo);
      causarDano(alvo, HV[h.vetor].dano, HV[h.vetor].evento, h.contato.atribuicao, t, eventos);
      cp = { ...cp, infocog: IC.registrarEventoMar(cp.infocog, 'incidente_nao_respondido', t, params) };
    }
    for (const h of hib) if (h.status === 'neutralizado' && !h.contado) { h.contado = true; cont.hibExito++; }

    // Investigação pós-fato das ações consumadas e conhecidas
    const INV = params.HIBRIDO.investigacao;
    for (const h of hib) {
      if (h.status !== 'efetivado' || !h.conhecido || h.atribuido || t > h.investigacaoAte) continue;
      const ritmo = AP.modificadores(cp.apoio, { turno: t, area: h.area, tipo: 'hibrido' }, params).fatorRitmo
                  * params.DIFICULDADES[config.dificuldade].ritmo;
      const atr = A.acumularEvidencia(h.contato.atribuicao, INV.ganho, { negabilidade: h.contato.negabilidade, fusao: fusaoBase, ritmo }, params);
      h.contato = { ...h.contato, atribuicao: atr };
      if (atr >= INV.robusta) {
        h.atribuido = true;
        eventos.push({ tipo: HV[h.vetor].evento, atribuicao: atr, origem: h.id });
      }
    }

    // Marcos das crises constabulares e da sabotagem
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

    // SLOC: áreas com ameaça aberta às linhas de comunicação
    for (const a of config.areasAtivas) {
      if (hib.some(h => ativo(h) && h.area === a && HV[h.vetor].sloc) ||
          (cp.constab?.ativas ?? []).some(o => o.area === a && o.tipo === 'pirataria')) slocAmeacadas++;
    }

    // 9. Escada
    cp = { ...cp, escalada: ES.avancarTurno(cp.escalada, eventos, decidirEscalada, params).estado };

    // 10. N3: escalada terminal
    if (cp.escalada.nivel === 3) {
      terminal = jogarTerminal(config.seed);
      desfecho = terminal.kcvPerdido ? 'derrota_vermelha_kcv' : terminal.vencedor === 'blue' ? 'conflito_vitoria_azul'
               : terminal.vencedor === 'red' ? 'conflito_vitoria_vermelha' : 'conflito_indeciso';
    }

    // 11. Dimensão informacional
    cp = { ...cp, infocog: IC.avancarTurno(cp.infocog, t, params) };
    if (!desfecho && cp.infocog.derrotaEstrategica) desfecho = 'derrota_estrategica_azul';
    if (boletins) linhas.push(CA.gerarBoletim({ ...cp, turno: t }, {}, params).linhas);
  }

  // ─── Métricas finais (Desenho §4, §6) ───
  const cm = cp.constab ? CO.metricas(cp.constab) : null;
  const E2 = sp0 ? 100 * infra.reduce((s, i) => s + i.sp, 0) / sp0 : 100;
  const metricas = {
    E1_atrib: cont.hibTotal ? (cont.hibExito + hib.filter(h => h.atribuido && h.status !== 'neutralizado').length) / cont.hibTotal : null,
    E2_infra: E2,
    E3_escalada: ES.turnosAbaixoDoLimiar(cp.escalada),
    E4_custopol: cp.infocog.custoPolitico,
    E5_ordem: cm ? cm.E5_ordem : null,
    E6_dispersao: cm ? cm.E6_dispersao : null,
    n_ocorr_crim: cm ? cm.n_ocorr_crim : 0,
    ocorr_reprimidas: cm ? cm.ocorr_reprimidas : 0,
    ...cp.apoio.contadores,
    sloc_idx: 1 - slocAmeacadas / (turnos * config.areasAtivas.length),
    kcv_perdido: terminal?.kcvPerdido ? 1 : 0,
    nivel_max: cp.escalada.nivelMax,
    atrito_terminal: terminal ? terminal.atrito : null,
    n_incidentes_hibridos: cont.hibTotal,
    apoio_publico_final: cp.infocog.apoio,
    crise_deteccao_media: media(cp.crises.map(c => c.deteccao.nota)),
    crise_resposta_media: media(cp.crises.map(c => c.resposta.nota)),
  };
  if (!desfecho) {
    const X = params.DESFECHO;
    desfecho = E2 >= X.infraVitoriaAzul && (metricas.E5_ordem ?? 1) >= X.ordemVitoriaAzul && cp.escalada.nivelMax < 3 ? 'vitoria_azul'
             : E2 < X.infraVitoriaVermelha ? 'vitoria_vermelha' : 'indecisa';
  }
  return { metricas, desfecho, turnos, terminal, ...(boletins ? { boletins: linhas } : {}) };
}

function media(xs) {
  const v = xs.filter(x => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
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
  jogarPartida, jogarTerminal, acaoDaEtapa,
  condicoes, delineamento, linhaDe, rodarLote, paraCsv, COLUNAS, CFG_PESQUISA,
};
