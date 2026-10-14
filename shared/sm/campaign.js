'use strict';

/**
 * campaign.js — Configurador de cenário e dinâmica de campanha da OAS-SM
 * (Conceito §8).
 *
 *  - Configurador (§8.1): áreas ativas, trilhas e atores, postura inicial,
 *    fatores de capacidade, força inicial de plataformas e portos,
 *    dificuldade, modalidade, Célula Branca, duração. iniciarCampanha monta
 *    os estados dos módulos SM-1 a SM-4 a partir dele.
 *  - Dificuldade como névoa de atribuição (§8.2): três níveis que mudam só
 *    o ritmo da evidência, o que o Azul vê da intenção e dos meios do
 *    híbrido e a adaptação do adversário. Nada aqui toca probabilidades de
 *    encontro, incidências ou o motor de salva.
 *  - Episódios de crise (§8.3): 2 a 3 por campanha, do repertório da Tabela
 *    8.2, avaliados em dois marcos (Detecção e Resposta). No jogador único,
 *    tipo, local e momento saem da semente; com Célula Branca, ela os injeta.
 *  - Boletim de situação (§8.4), com probabilidades em palavras e o
 *    interruptor "mostrar os números", apoio público, custo político e a
 *    largura da ROE (SM-7).
 *  - Célula Branca (§8.5): injeta eventos, ocorrências e crises, ajusta
 *    parâmetros, transfere áreas e anula lances — sempre com justificativa,
 *    tudo registrado. Sem Célula Branca, o motor exerce essas funções.
 *
 * Determinismo: as crises sorteiam de uma sub-sequência própria da semente.
 * Estados imutáveis.
 */

const { PARAMS: P } = require('./params');
const { mulberry32 } = require('../rng');
const C2 = require('./c2');
const CO = require('./constab');
const ES = require('./escalation');
const AP = require('./apoio');
const EN = require('./encounter');
const IC = require('./infocog');

// ─── Configurador ────────────────────────────────────────────────────────────

function erro(msg) { throw new Error(`campaign: ${msg}`); }
function inteiroEntre(v, a, b) { return Number.isInteger(v) && v >= a && v <= b; }

/**
 * Valida e completa a configuração do cenário (padrões entre parênteses).
 *
 * @param {object} cfg
 * @param {number}   cfg.seed
 * @param {string[]} [cfg.areasAtivas]        (todas as áreas de DN)
 * @param {{defesa?: boolean, constabular?: boolean}} [cfg.trilhas]  (ambas)
 * @param {string[]} [cfg.vetoresHibridos]    (todos, se a trilha de defesa está ligada)
 * @param {string[]} [cfg.tiposOcorrencia]    (todos, se a constabular está ligada)
 * @param {number}   [cfg.nivelInicial]       (0)
 * @param {object}   [cfg.fatores]            −1/+1 por fator de FATORES_SM (todos +1)
 * @param {{plataformas?: number, portos?: number}} [cfg.forcaInicial]  fração 0–1 do SP (1)
 * @param {string}   [cfg.dificuldade]        ('intermediario')
 * @param {string}   [cfg.modalidade]         ('unico')
 * @param {object}   [cfg.controladores]      (ver c2.criarC2)
 * @param {boolean}  [cfg.celulaBranca]       (false; não existe no jogador único)
 * @param {number}   [cfg.duracaoDias]        (45; 30–60)
 * @param {0|1}      [cfg.apoioExterno]       (1)
 * @param {number}   [cfg.intensidadeHibrida] 0–1 (0,5; 0 se a trilha de defesa está desligada)
 * @param {string|null} [cfg.areaAlvoHibrida] (sorteada entre as ativas)
 * @param {string[]} [cfg.fontesAtivas]       (todas)
 * @param {boolean}  [cfg.mostrarNumeros]     (false)
 */
function configurarCampanha(cfg = {}, params = P) {
  const seed = cfg.seed;
  if (!Number.isInteger(seed)) erro('semente inteira é obrigatória');
  const todasAreas = params.AREAS_DN.map(a => a.id);
  const areasAtivas = cfg.areasAtivas ?? todasAreas;
  if (!areasAtivas.length) erro('ao menos uma área ativa');
  for (const a of areasAtivas) if (!todasAreas.includes(a)) erro(`área desconhecida ${a}`);
  const trilhas = { defesa: cfg.trilhas?.defesa ?? true, constabular: cfg.trilhas?.constabular ?? true };
  if (!trilhas.defesa && !trilhas.constabular) erro('ao menos uma trilha ligada');

  const vetoresHibridos = trilhas.defesa ? (cfg.vetoresHibridos ?? Object.keys(params.VETORES_HIBRIDOS)) : [];
  for (const v of vetoresHibridos) if (!params.VETORES_HIBRIDOS[v]) erro(`vetor híbrido desconhecido ${v}`);
  const tiposOcorrencia = trilhas.constabular ? (cfg.tiposOcorrencia ?? Object.keys(params.TIPOS_OCORRENCIA)) : [];
  for (const t of tiposOcorrencia) if (!params.TIPOS_OCORRENCIA[t]) erro(`tipo de ocorrência desconhecido ${t}`);

  const nivelInicial = cfg.nivelInicial ?? 0;
  if (!inteiroEntre(nivelInicial, 0, 3)) erro('nível inicial é 0–3');
  const fatores = Object.fromEntries(params.FATORES_SM.map(f => [f, cfg.fatores?.[f] ?? 1]));
  for (const [f, v] of Object.entries(cfg.fatores ?? {})) {
    if (!params.FATORES_SM.includes(f)) erro(`fator desconhecido ${f}`);
    if (v !== 1 && v !== -1) erro(`fator ${f} é −1 ou +1`);
  }
  const forcaInicial = { plataformas: cfg.forcaInicial?.plataformas ?? 1, portos: cfg.forcaInicial?.portos ?? 1 };
  for (const [k, v] of Object.entries(forcaInicial)) if (!(v > 0 && v <= 1)) erro(`força inicial de ${k} é fração em (0, 1]`);

  const dificuldade = cfg.dificuldade ?? 'intermediario';
  if (!params.DIFICULDADES[dificuldade]) erro(`dificuldade desconhecida ${dificuldade}`);
  const modalidade = cfg.modalidade ?? 'unico';
  const celulaBranca = cfg.celulaBranca ?? false;
  if (celulaBranca && modalidade === 'unico') erro('no jogador único a Célula Branca é exercida pelo motor');
  const duracaoDias = cfg.duracaoDias ?? params.DURACAO_DIAS.padrao;
  if (!inteiroEntre(duracaoDias, params.DURACAO_DIAS.min, params.DURACAO_DIAS.max))
    erro(`duração é ${params.DURACAO_DIAS.min}–${params.DURACAO_DIAS.max} dias`);
  const apoioExterno = cfg.apoioExterno ?? 1;
  if (apoioExterno !== 0 && apoioExterno !== 1) erro('apoio externo é 0 ou 1');
  const intensidadeHibrida = trilhas.defesa ? (cfg.intensidadeHibrida ?? 0.5) : 0;
  if (!(intensidadeHibrida >= 0 && intensidadeHibrida <= 1)) erro('intensidade híbrida é 0–1');
  const fontesAtivas = cfg.fontesAtivas ?? Object.keys(params.FONTES);
  for (const f of fontesAtivas) if (!params.FONTES[f]) erro(`fonte desconhecida ${f}`);

  let areaAlvoHibrida = cfg.areaAlvoHibrida ?? null;
  if (areaAlvoHibrida !== null && !areasAtivas.includes(areaAlvoHibrida)) erro('área-alvo do híbrido precisa estar ativa');
  if (areaAlvoHibrida === null && trilhas.defesa) {
    const rng = mulberry32((seed ^ params.SAL_CRISES ^ 0xA5A5A5A5) >>> 0);
    areaAlvoHibrida = areasAtivas[Math.floor(rng() * areasAtivas.length)];
  }

  // A configuração de C2 é validada aqui (lança se inválida).
  C2.criarC2({ modalidade, controladores: cfg.controladores }, params);

  return {
    seed, areasAtivas: [...areasAtivas], trilhas, vetoresHibridos: [...vetoresHibridos],
    tiposOcorrencia: [...tiposOcorrencia], nivelInicial, fatores, forcaInicial, dificuldade,
    modalidade, controladores: cfg.controladores ? { ...cfg.controladores } : undefined,
    celulaBranca, duracaoDias, apoioExterno, intensidadeHibrida, areaAlvoHibrida,
    fontesAtivas: [...fontesAtivas], mostrarNumeros: !!cfg.mostrarNumeros,
  };
}

// ─── Crises ──────────────────────────────────────────────────────────────────

/** Tipos de crise admitidos pelas trilhas ligadas. */
function tiposDeCrise(config, params = P) {
  return Object.keys(params.CRISES).filter(t => config.trilhas[params.CRISES[t].trilha]);
}

function novaCrise(id, tipo, area, inicio, origem) {
  return { id, tipo, area, inicio, origem, status: 'agendada',
           deteccao: { turno: null, nota: null }, resposta: { turno: null, adequada: null, nota: null } };
}

/**
 * Crises sorteadas pela semente: 2–3 tipos distintos, cada uma numa janela
 * diferente da campanha (depois dos 3 primeiros dias) e numa área ativa. Com
 * Célula Branca, nenhuma é sorteada — o facilitador as injeta.
 */
function agendarCrises(config, params = P) {
  if (config.celulaBranca) return [];
  const rng = mulberry32((config.seed ^ params.SAL_CRISES) >>> 0);
  const tipos = tiposDeCrise(config, params);
  const n = Math.min(tipos.length, params.N_CRISES.min + Math.floor(rng() * (params.N_CRISES.max - params.N_CRISES.min + 1)));
  const baralho = tipos.slice();
  for (let i = baralho.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [baralho[i], baralho[j]] = [baralho[j], baralho[i]]; }
  const inicio0 = 4, fim = config.duracaoDias - 3;
  const largura = (fim - inicio0 + 1) / n;
  return baralho.slice(0, n).map((tipo, k) => {
    const de = inicio0 + Math.floor(k * largura), ate = inicio0 + Math.floor((k + 1) * largura) - 1;
    const inicio = de + Math.floor(rng() * (ate - de + 1));
    const area = config.areasAtivas[Math.floor(rng() * config.areasAtivas.length)];
    return novaCrise(`CR-${k + 1}`, tipo, area, inicio, 'semente');
  });
}

/** Nota de um marco: 1 até o prazo ideal, 0 a partir do máximo, linear no meio. */
function notaMarco(dt, { ideal, max }) {
  if (dt <= ideal) return 1;
  if (dt >= max) return 0;
  return 1 - (dt - ideal) / (max - ideal);
}

/** Efeito que a crise injeta quando dispara, com a área e o turno resolvidos. */
function efeitosDaCrise(crise, params = P) {
  const e = params.CRISES[crise.tipo].efeito;
  return { crise: crise.id, tipo: crise.tipo, area: crise.area, turno: crise.inicio, ...JSON.parse(JSON.stringify(e)) };
}

// ─── Estado de campanha ──────────────────────────────────────────────────────

/** Monta a campanha: configuração validada + estados de C2, escada, constabular, apoio e crises. */
function iniciarCampanha(cfg, params = P) {
  const config = configurarCampanha(cfg, params);
  return {
    config,
    turno: 0,
    c2: C2.criarC2({ modalidade: config.modalidade, controladores: config.controladores }, params),
    escalada: ES.criarEstadoEscalada(config.nivelInicial),
    constab: config.trilhas.constabular
      ? CO.criarEstadoConstab({ seed: config.seed, areasAtivas: config.areasAtivas, tiposAtivos: config.tiposOcorrencia }, params)
      : null,
    apoio: AP.criarEstadoApoio({ seed: config.seed, apoioExterno: config.apoioExterno, mpaOrganica: config.fatores.A_MPA === 1 }, params),
    crises: agendarCrises(config, params),
    infocog: IC.criarEstadoInfocog(params),
    responsavelPorArea: Object.fromEntries(params.AREAS_DN.map(a => [a.id, a.estacao])),
    padroes: {},          // contagem de respostas repetidas (adaptação do adversário)
    revelados: [],        // contatos híbridos já encontrados (ocultação até o contato)
    injetados: [],        // eventos e ocorrências da Célula Branca/motor a consumir no turno
    anulados: [],
    registroCelula: [],
  };
}

/**
 * Dispara as crises cujo início é o turno e encerra as que passaram do prazo
 * de resposta. Devolve os efeitos a injetar.
 */
function avancarCrises(estado, turno, params = P) {
  const disparadas = [];
  const crises = estado.crises.map(c => {
    if (c.status === 'agendada' && c.inicio === turno) { disparadas.push(efeitosDaCrise(c, params)); return { ...c, status: 'ativa' }; }
    if (c.status === 'ativa' && turno - c.inicio >= params.CRISES[c.tipo].resposta.max) {
      return {
        ...c, status: 'encerrada',
        deteccao: c.deteccao.nota === null ? { turno: null, nota: 0 } : c.deteccao,
        resposta: c.resposta.nota === null ? { turno: null, adequada: false, nota: 0 } : c.resposta,
      };
    }
    return c;
  });
  return { estado: { ...estado, crises, turno }, disparadas };
}

function mudarCrise(estado, id, fn) {
  const i = estado.crises.findIndex(c => c.id === id);
  if (i < 0) erro(`crise ${id} desconhecida`);
  if (estado.crises[i].status !== 'ativa') erro(`crise ${id} não está ativa`);
  const crises = estado.crises.slice();
  crises[i] = fn(crises[i]);
  return { ...estado, crises };
}

/** Marco de Detecção: o Azul percebeu o que está em curso (uma vez por crise). */
function registrarDeteccaoCrise(estado, id, turno, params = P) {
  return mudarCrise(estado, id, c => c.deteccao.nota !== null ? c
    : { ...c, deteccao: { turno, nota: notaMarco(turno - c.inicio, params.CRISES[c.tipo].deteccao) } });
}

/** Marco de Resposta: ação adotada (adequada ou não); encerra o episódio. */
function registrarRespostaCrise(estado, id, turno, adequada, params = P) {
  return mudarCrise(estado, id, c => {
    const nota = adequada ? notaMarco(turno - c.inicio, params.CRISES[c.tipo].resposta) : 0;
    return { ...c, status: 'encerrada',
             deteccao: c.deteccao.nota === null ? { turno: null, nota: 0 } : c.deteccao,
             resposta: { turno, adequada: !!adequada, nota } };
  });
}

// ─── Névoa de atribuição (dificuldade) ───────────────────────────────────────

function dificuldadeDe(estado, params = P) { return params.DIFICULDADES[estado.config.dificuldade]; }

/**
 * Ritmo de evidência para uma resposta (vai para resolverEncontro). No
 * avançado, cada repetição da mesma resposta (chave = p.ex. tipo de ação +
 * área) rende menos: ritmo × fator^n, com piso.
 */
function ritmoDeEvidencia(estado, chave, params = P) {
  const d = dificuldadeDe(estado, params);
  if (!d.adaptacao || chave == null) return d.ritmo;
  const n = estado.padroes[chave] ?? 0;
  return d.ritmo * Math.max(d.adaptacao.piso, d.adaptacao.fator ** n);
}

/** Registra que a resposta `chave` foi usada (o adversário aprende o padrão). */
function registrarPadrao(estado, chave) {
  return { ...estado, padroes: { ...estado.padroes, [chave]: (estado.padroes[chave] ?? 0) + 1 } };
}

/** Marca um contato híbrido como encontrado (sai da ocultação). */
function revelarContato(estado, contatoId) {
  return estado.revelados.includes(contatoId) ? estado : { ...estado, revelados: [...estado.revelados, contatoId] };
}

/**
 * O que o Azul vê dos contatos híbridos: no avançado, só os já encontrados;
 * a intenção só aparece a partir da atribuição do nível.
 * @param {Array<{id, atribuicao, intencao}>} contatos  verdade do motor
 */
function vistaHibrida(estado, contatos, params = P) {
  const d = dificuldadeDe(estado, params);
  return contatos
    .filter(c => !d.ocultacaoAteContato || estado.revelados.includes(c.id))
    .map(c => ({ ...c, intencao: (c.atribuicao ?? 0) >= d.intencaoAPartirDe ? c.intencao : 'desconhecida' }));
}

// ─── Boletim de situação ─────────────────────────────────────────────────────

/**
 * Resumo do turno para o exame de situação e o debrief (§8.4).
 *
 * @param {object} estado
 * @param {object} [dados]
 * @param {Array}  [dados.encontros]   [{ unidade, contato, resultado }] (resultado de resolverEncontro)
 * @param {Array}  [dados.atribuicoes] [{ contato, antes, depois }]
 * @param {{novas?: Array, escaparam?: Array}} [dados.constabTurno]
 * @param {boolean} [dados.mostrarNumeros]  (padrão: o da configuração)
 */
function gerarBoletim(estado, dados = {}, params = P) {
  const mostrar = dados.mostrarNumeros ?? estado.config.mostrarNumeros;
  const nivel = params.NIVEIS[estado.escalada.nivel];
  const acoes = (dados.encontros ?? []).map(e => ({
    unidade: e.unidade, contato: e.contato,
    etapas: (e.resultado?.etapas ?? []).map(x => ({
      etapa: params.ROTULO_ETAPA[x.etapa], chance: EN.formatarProbabilidade(x.p, mostrar, params), sucesso: x.sucesso })),
    resultado: e.resultado?.efetivo ? (params.ROTULO_ETAPA[e.resultado.etapaAtingida] ?? 'sem êxito') : 'sem encontro',
  }));
  const atribuicoes = (dados.atribuicoes ?? []).map(a => ({ ...a, variacao: a.depois - a.antes }));
  const constab = estado.constab ? CO.metricas(estado.constab) : null;
  const ativas = estado.crises.filter(c => c.status === 'ativa').map(c => ({ id: c.id, rotulo: params.CRISES[c.tipo].rotulo, area: c.area }));
  // Prévia do próximo evento: no básico, a próxima crise agendada; nos demais, só que algo pode vir.
  const prox = estado.crises.filter(c => c.status === 'agendada').sort((a, b) => a.inicio - b.inicio)[0];
  const proximoEvento = !prox ? null
    : estado.config.dificuldade === 'basico' ? { rotulo: params.CRISES[prox.tipo].rotulo, area: prox.area, turno: prox.inicio }
    : { rotulo: 'indefinido' };

  const info = estado.infocog ? IC.metricas(estado.infocog) : null;
  const roe = estado.infocog ? IC.roeEfetiva(estado.escalada.nivel, estado.infocog.apoio, params) : null;
  const linhas = [
    `Turno ${estado.turno} · postura ${nivel.sigla} ${nivel.postura}`,
    ...acoes.map(a => `${a.unidade} → ${a.contato}: ${a.etapas.map(x => `${x.etapa} (${x.chance}) ${x.sucesso ? '✓' : '✗'}`).join(' · ') || '—'} ⇒ ${a.resultado}`),
    ...atribuicoes.map(a => `Atribuição ${a.contato}: ${Math.round(a.antes)}% → ${Math.round(a.depois)}%`),
    ...(constab ? [`Ordem marítima: ${constab.ocorr_reprimidas}/${constab.n_ocorr_crim} ocorrências reprimidas`
                 + ` · ${estado.constab.ativas.length} abertas`
                 + ((dados.constabTurno?.escaparam?.length) ? ` · ${dados.constabTurno.escaparam.length} escaparam no turno` : '')] : []),
    ...(info ? [`Apoio público ${Math.round(info.apoio_publico)}% · custo político ${info.E4_custopol.toFixed(1)}`
               + `/${params.INFOCOG.tetoCustoPolitico} · ROE ${roe.largura < 0 ? 'estreitada' : roe.largura > 0 ? 'ampliada' : 'normal'}`] : []),
    ...ativas.map(c => `Crise em curso: ${c.rotulo} (${c.area})`),
    `Próximo evento: ${proximoEvento ? (proximoEvento.turno ? `${proximoEvento.rotulo} (${proximoEvento.area}, turno ${proximoEvento.turno})` : 'indefinido') : 'nenhum previsto'}`,
  ];
  return { turno: estado.turno, postura: { nivel: nivel.nivel, sigla: nivel.sigla, postura: nivel.postura },
           acoes, atribuicoes, constabular: constab, crisesAtivas: ativas, proximoEvento,
           informacional: info && { ...info, roe }, linhas };
}

// ─── Célula Branca ───────────────────────────────────────────────────────────

const ACOES_CELULA = ['injetar_crise', 'injetar_evento', 'injetar_ocorrencia', 'ajustar_parametro', 'transferir_area', 'anular_lance'];

/**
 * Uma intervenção da arbitragem. Com Célula Branca configurada, só ela age;
 * sem, o motor exerce as funções. Toda intervenção exige justificativa e
 * vai para o registro.
 *
 * @param {object} req { ator, tipo, payload, justificativa, turno }
 */
function intervir(estado, { ator, tipo, payload = {}, justificativa, turno = estado.turno }, params = P) {
  const esperado = estado.config.celulaBranca ? 'celula_branca' : 'motor';
  if (ator !== esperado) erro(`intervenção reservada a ${esperado}`);
  if (!ACOES_CELULA.includes(tipo)) erro(`intervenção desconhecida ${tipo}`);
  if (typeof justificativa !== 'string' || !justificativa.trim()) erro('intervenção sem justificativa');

  let e = estado;
  if (tipo === 'injetar_crise') {
    if (!params.CRISES[payload.tipo]) erro(`crise desconhecida ${payload.tipo}`);
    if (!tiposDeCrise(e.config, params).includes(payload.tipo)) erro('crise de trilha desligada');
    if (!e.config.areasAtivas.includes(payload.area)) erro('crise em área inativa');
    if (!Number.isInteger(payload.inicio) || payload.inicio < turno) erro('crise no passado');
    const c = novaCrise(`CR-${e.crises.length + 1}`, payload.tipo, payload.area, payload.inicio, 'celula_branca');
    e = { ...e, crises: [...e.crises, c] };
  } else if (tipo === 'injetar_evento') {
    if (!ES.TIPOS_HIBRIDOS.includes(payload.evento?.tipo)) erro('evento híbrido desconhecido');
    e = { ...e, injetados: [...e.injetados, { tipo: 'evento', turno, evento: { ...payload.evento } }] };
  } else if (tipo === 'injetar_ocorrencia') {
    if (!e.config.tiposOcorrencia.includes(payload.tipo)) erro('tipo de ocorrência inativo');
    if (!e.config.areasAtivas.includes(payload.area)) erro('ocorrência em área inativa');
    e = { ...e, injetados: [...e.injetados, { tipo: 'ocorrencia', turno, ocorrencia: { tipo: payload.tipo, area: payload.area } }] };
  } else if (tipo === 'ajustar_parametro') {
    const { chave, valor } = payload;
    if (!params.AJUSTAVEIS_CELULA_BRANCA.includes(chave)) erro(`parâmetro não ajustável ${chave}`);
    const config = configurarCampanha({ ...e.config, [chave]: valor }, params);   // revalida
    e = { ...e, config };
  } else if (tipo === 'transferir_area') {
    const { area, para } = payload;
    if (!e.config.areasAtivas.includes(area)) erro('área inativa');
    if (C2.estacao(para, params).trilha !== 'constabular') erro('área só passa a outro Distrito Naval');
    e = { ...e, responsavelPorArea: { ...e.responsavelPorArea, [area]: para } };
  } else if (tipo === 'anular_lance') {
    if (!payload.lanceId) erro('lance a anular não informado');
    e = { ...e, anulados: [...e.anulados, payload.lanceId] };
  }
  const registro = { turno, ator, tipo, payload: JSON.parse(JSON.stringify(payload)), justificativa: justificativa.trim() };
  return { ...e, registroCelula: [...e.registroCelula, registro] };
}

/** Retira e devolve o que foi injetado para o turno (o runner consome). */
function consumirInjetados(estado, turno) {
  const doTurno = estado.injetados.filter(i => i.turno <= turno);
  return { estado: { ...estado, injetados: estado.injetados.filter(i => i.turno > turno) }, injetados: doTurno };
}

module.exports = {
  configurarCampanha, iniciarCampanha,
  tiposDeCrise, agendarCrises, notaMarco, efeitosDaCrise, avancarCrises,
  registrarDeteccaoCrise, registrarRespostaCrise,
  ritmoDeEvidencia, registrarPadrao, revelarContato, vistaHibrida,
  gerarBoletim,
  ACOES_CELULA, intervir, consumirInjetados,
};
