'use strict';

/**
 * sala.js — Sala interativa da OAS-SM (Conceito §7.3, §8.5): assentos por
 * modalidade, fluxo do turno e visões por papel, sobre o motor de turno
 * (engine.js). Não conhece sockets: sm_server.js só transporta mensagens.
 *
 * Assentos:
 *   unico        'azul' (as seis estações); Vermelho = motor
 *   1x1          'azul' e 'vermelho'
 *   distribuido  um assento por estação (COMPAAz, ComemCh, 2º/1º/8º/5º DN)
 *                e, se configurada, 'celula' (Célula Branca, que também pode
 *                conduzir o Vermelho); assento vazio = política de agente
 *
 * Fluxo do turno: 'vermelho' (Vermelho humano ou Célula Branca decide; senão
 * o motor) → 'azul' (cada assento Azul humano envia suas ordens; quem não é
 * humano fica com a doutrina) → 'escalada' (se houver proposta e o COMPAAz
 * for humano, ele autoriza ou nega) → próximo turno. A Célula Branca intervém
 * a qualquer momento entre os lances, inclusive anulando um lance Azul
 * enviado e ainda não resolvido. Toda decisão passa pela regra única do C2
 * (c2.autorizarDecisao): o assento precisa controlar a estação e a estação
 * precisa ter o papel.
 */

const { PARAMS: P } = require('./params');
const CA = require('./campaign');
const C2 = require('./c2');
const EG = require('./engine');

const ESTACOES = P.ESTACOES.map(e => e.id);
const ctrl = assento => `assento:${assento}`;

function assentosDa(modalidade, celulaBranca) {
  if (modalidade === 'unico') return ['azul'];
  if (modalidade === '1x1') return ['azul', 'vermelho'];
  return [...ESTACOES, ...(celulaBranca ? ['celula'] : [])];
}

function controladoresDa(modalidade, celulaBranca) {
  if (modalidade === 'unico') return { azul: ctrl('azul') };
  if (modalidade === '1x1') return { azul: ctrl('azul'), vermelho: ctrl('vermelho') };
  return { ...Object.fromEntries(ESTACOES.map(e => [e, ctrl(e)])), vermelho: celulaBranca ? 'celula_branca' : 'motor' };
}

const ROTULO_ASSENTO = { azul: 'Força Azul (todas as estações)', vermelho: 'Força Vermelha (híbrido)', celula: 'Célula Branca',
  ...Object.fromEntries(P.ESTACOES.map(e => [e.id, `${e.id} — ${e.nome}`])) };

/**
 * @param {object} args
 * @param {string} args.codigo
 * @param {object} args.cfg  configuração do cenário (modalidade, dificuldade, áreas…)
 */
function criarSala({ codigo, cfg }, params = P) {
  const modalidade = cfg.modalidade ?? 'unico';
  const celulaBranca = !!cfg.celulaBranca;
  if (celulaBranca && modalidade !== 'distribuido') throw new Error('sala: Célula Branca é da modalidade de estações distribuídas (§8.5)');
  if (modalidade === '1x1' && cfg.trilhas?.defesa === false) throw new Error('sala: o confronto 1×1 precisa da trilha de defesa (o Vermelho é o híbrido)');
  const config = { ...cfg, modalidade, celulaBranca, controladores: controladoresDa(modalidade, celulaBranca) };
  CA.configurarCampanha(config, params);           // valida (lança se inválida)
  const assentos = assentosDa(modalidade, celulaBranca);
  const ocupantes = {};                            // assento → { id, nome, online }
  let partida = null;
  let fase = 'lobby';
  let ordens = {};                                 // assento → ordens do turno
  let proposta = null;
  const mensagens = [];                            // registro da sala (para todos)
  let ultimoResultado = null;

  const humano = a => !!ocupantes[a];
  const assentosAzuis = () => assentos.filter(a => a !== 'vermelho' && a !== 'celula');
  const estacoesDoAssento = a => (a === 'azul' ? ESTACOES : ESTACOES.includes(a) ? [a] : []);
  const assentoDaEstacao = est => (modalidade === 'distribuido' ? est : 'azul');
  const log = (texto, extra = {}) => mensagens.push({ turno: partida?.turno ?? 0, texto, ...extra });

  function ocupar(assento, jogador) {
    if (!assentos.includes(assento)) throw new Error(`sala: assento inexistente ${assento}`);
    if (ocupantes[assento] && ocupantes[assento].id !== jogador.id) throw new Error(`sala: assento ${assento} já ocupado`);
    if (Object.entries(ocupantes).some(([a, o]) => o.id === jogador.id && a !== assento)) throw new Error('sala: jogador já tem um assento');
    ocupantes[assento] = { id: jogador.id, nome: jogador.nome || 'Jogador', online: true };
    log(`${ocupantes[assento].nome} assumiu ${ROTULO_ASSENTO[assento]}`);
  }
  function liberar(assento) { if (fase === 'lobby') delete ocupantes[assento]; else if (ocupantes[assento]) ocupantes[assento].online = false; }
  function reconectar(assento, id) { if (ocupantes[assento]?.id === id) ocupantes[assento].online = true; }
  function assentoDe(id) { return Object.keys(ocupantes).find(a => ocupantes[a].id === id) ?? null; }

  function iniciar() {
    if (fase !== 'lobby') throw new Error('sala: partida já iniciada');
    if (!assentosAzuis().some(humano)) throw new Error('sala: ao menos um assento Azul precisa de jogador');
    if (modalidade === '1x1' && !humano('vermelho')) throw new Error('sala: o confronto 1×1 precisa do jogador Vermelho');
    partida = EG.criarPartida(config, {}, params);
    log(`Partida iniciada — ${modalidade}, ${config.dificuldade ?? 'intermediario'}, ${partida.config.duracaoDias} dias`);
    fase = 'vermelho';
    avancar();
  }

  /** Avança as etapas que não esperam humano. */
  function avancar() {
    for (;;) {
      if (fase === 'vermelho') {
        const quemVermelho = modalidade === '1x1' ? 'vermelho' : celulaBranca ? 'celula' : null;
        if (quemVermelho && humano(quemVermelho)) return;
        partida.iniciarTurno(null);
        fase = 'azul'; ordens = {};
        continue;
      }
      if (fase === 'azul') {
        const faltam = assentosAzuis().filter(a => humano(a) && !(a in ordens));
        if (faltam.length) return;
        const r = partida.decidirAzul(juntarOrdens());
        proposta = r.proposta;
        r.recusas.forEach(x => log(`Ordem não executada — ${x}`, { tipo: 'recusa' }));
        fase = 'escalada';
        continue;
      }
      if (fase === 'escalada') {
        if (proposta && humano(assentoDaEstacao('COMPAAz'))) return;
        fechar(undefined);
        continue;
      }
      return;                                       // lobby / encerrada
    }
  }

  function fechar(autorizacao) {
    const r = partida.fecharTurno(autorizacao);
    if (proposta) log(`Escalada ${proposta.direcao} N${proposta.de}→N${proposta.para}: ${autorizacao === false ? 'negada' : 'autorizada'} pelo COMPAAz`);
    proposta = null;
    ultimoResultado = r;
    if (r.desfecho) { fase = 'encerrada'; log(`Campanha encerrada: ${r.desfecho}`); }
    else fase = 'vermelho';
  }

  function juntarOrdens() {
    const d = { estacoes: {}, prontidao: { estacoes: [], acionar: [] } };
    for (const a of assentosAzuis()) {
      if (!humano(a)) continue;
      const o = ordens[a] ?? {};
      const ests = estacoesDoAssento(a);
      d.prontidao.estacoes.push(...ests);
      d.prontidao.acionar.push(...(o.acionar ?? []));
      for (const est of ests) {
        if (est === 'COMPAAz') { d.compaaz = { pedidos: o.pedidos ?? [], campanha: o.campanha ?? null }; continue; }
        d.estacoes[est] = (o.designacoes ?? []).filter(x => x.estacao === est && !x.anulado).map(({ meio, contato, etapaAlvo, patrulha }) => ({ meio, contato, etapaAlvo, patrulha }));
      }
    }
    return d;
  }

  function exigirPapel(assento, estacao, papel) {
    C2.exigirDecisao(partida.c2, { quem: ctrl(assento), estacao, papel }, params);
  }

  /**
   * Mensagem de um assento.
   * @param {string} assento
   * @param {'vermelho'|'ordens'|'autorizar'|'celula'} tipo
   */
  function enviar(assento, tipo, payload = {}) {
    if (!humano(assento)) throw new Error('sala: assento sem jogador');
    if (fase === 'lobby' || fase === 'encerrada') throw new Error(`sala: nada a decidir (fase ${fase})`);

    if (tipo === 'vermelho') {
      if (fase !== 'vermelho') throw new Error('sala: não é a vez do Vermelho');
      const pode = (modalidade === '1x1' && assento === 'vermelho') || (celulaBranca && assento === 'celula');
      if (!pode) throw new Error('sala: só o Vermelho (ou a Célula Branca) decide o Vermelho');
      partida.iniciarTurno(payload.motor ? null : payload);
      if (assento === 'celula') log(payload.motor ? 'Célula Branca: Vermelho pelo motor neste turno' : 'Célula Branca conduziu o Vermelho neste turno');
      fase = 'azul'; ordens = {};
      return avancar();
    }

    if (tipo === 'ordens') {
      if (fase !== 'azul') throw new Error('sala: não é a vez do Azul');
      if (!assentosAzuis().includes(assento)) throw new Error('sala: assento não é Azul');
      const ests = estacoesDoAssento(assento);
      const des = (payload.designacoes ?? []).map((x, k) => ({ ...x, lance: `L${partida.turno}-${assento}-${k + 1}` }));
      for (const x of des) {
        if (!ests.includes(x.estacao)) throw new Error(`sala: ${assento} não comanda ${x.estacao}`);
        exigirPapel(assento, x.estacao, x.estacao === 'ComemCh' ? 'empregar_esquadra' : 'responder_ocorrencia');
      }
      if ((payload.pedidos?.length || payload.campanha) && !ests.includes('COMPAAz')) throw new Error('sala: apoios e campanhas são do COMPAAz');
      for (const p of payload.pedidos ?? []) exigirPapel(assento, 'COMPAAz', p.apoio === 'mpa' ? 'solicitar_mpa' : 'solicitar_apoio');
      if (payload.campanha) exigirPapel(assento, 'COMPAAz', 'campanha_informacional');
      ordens[assento] = { designacoes: des, pedidos: payload.pedidos ?? [], campanha: payload.campanha ?? null, acionar: payload.acionar ?? [] };
      log(`${ROTULO_ASSENTO[assento]} enviou ordens (${des.length} designações)`);
      return avancar();
    }

    if (tipo === 'autorizar') {
      if (fase !== 'escalada' || !proposta) throw new Error('sala: não há proposta de escalada');
      if (assento !== assentoDaEstacao('COMPAAz')) throw new Error('sala: só o COMPAAz autoriza a escalada');
      exigirPapel(assento, 'COMPAAz', 'autorizar_escalada');
      fechar(!!payload.autorizado);
      return avancar();
    }

    if (tipo === 'celula') {
      if (assento !== 'celula') throw new Error('sala: só a Célula Branca intervém');
      if (payload.tipo === 'anular_lance') {
        if (fase !== 'azul') throw new Error('sala: só se anula lance Azul ainda não resolvido');
        const alvo = Object.values(ordens).flatMap(o => o.designacoes).find(x => x.lance === payload.payload?.lanceId);
        if (!alvo) throw new Error('sala: lance não encontrado');
        if (!payload.justificativa?.trim()) throw new Error('sala: intervenção sem justificativa');
        alvo.anulado = true;
      }
      const reg = partida.intervir({ ator: 'celula_branca', tipo: payload.tipo, payload: payload.payload ?? {}, justificativa: payload.justificativa });
      log(`Célula Branca — ${reg.tipo}: ${reg.justificativa}`, { tipo: 'celula' });
      return undefined;
    }
    throw new Error(`sala: mensagem desconhecida ${tipo}`);
  }

  function aguardando() {
    if (fase === 'vermelho') return [modalidade === '1x1' ? 'vermelho' : 'celula'].filter(humano);
    if (fase === 'azul') return assentosAzuis().filter(a => humano(a) && !(a in ordens));
    if (fase === 'escalada') return proposta ? [assentoDaEstacao('COMPAAz')] : [];
    return [];
  }

  /** Visão de um assento (com a névoa do seu papel). */
  function vista(assento) {
    const meta = {
      codigo, modalidade, fase, turno: partida?.turno ?? 0, celulaBranca, meuAssento: assento,
      // Dia em curso: durante o lance Vermelho o motor ainda está no dia anterior.
      dia: partida ? (fase === 'vermelho' ? partida.turno + 1 : partida.turno) : 0,
      minhasEstacoes: estacoesDoAssento(assento),
      assentos: assentos.map(a => ({ id: a, rotulo: ROTULO_ASSENTO[a], jogador: ocupantes[a]?.nome ?? null,
        online: ocupantes[a]?.online ?? false, agente: !ocupantes[a] && fase !== 'lobby' })),
      aguardando: aguardando(), enviado: assento in ordens, proposta: fase === 'escalada' ? proposta : null,
      mensagens: mensagens.slice(-40), ultimoResultado,
      config: { modalidade, dificuldade: config.dificuldade ?? 'intermediario', duracaoDias: config.duracaoDias ?? P.DURACAO_DIAS.padrao,
                areasAtivas: config.areasAtivas ?? P.AREAS_DN.map(a => a.id), celulaBranca },
    };
    if (!partida) return { meta, situacao: null };
    const papel = assento === 'vermelho' ? 'vermelho' : assento === 'celula' ? 'celula' : 'azul';
    const situacao = papel === 'vermelho' ? partida.situacaoVermelho() : papel === 'celula' ? partida.situacaoCelula() : partida.situacaoAzul();
    if (papel === 'celula') meta.lancesPendentes = Object.entries(ordens).flatMap(([a, o]) => o.designacoes.map(x => ({ ...x, assento: a })));
    return { meta: { ...meta, papel }, situacao };
  }

  return {
    codigo, assentos, ocupar, liberar, reconectar, assentoDe, iniciar, enviar, vista,
    get fase() { return fase; }, get partida() { return partida; }, humano,
  };
}

module.exports = { criarSala, assentosDa, controladoresDa, ROTULO_ASSENTO };
