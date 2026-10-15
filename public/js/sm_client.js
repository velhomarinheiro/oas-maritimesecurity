'use strict';

// ═════════════════════════════════════════════════════════════════════════════
// sm_client.js — Interface da OAS-SM (jogador único, confronto 1×1, estações
// distribuídas). Reusa a carta, a grade e os contadores do jogo base (hex.js,
// terrain.js, units.js). Toda regra está no servidor (shared/sm/sala.js); o
// cliente só monta ordens e mostra a visão do seu assento.
// ═════════════════════════════════════════════════════════════════════════════

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...filhos) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null) n.append(f.nodeType ? f : document.createTextNode(String(f)));
  return n;
};
const opcoes = (pares, sel) => pares.map(([v, r]) => el('option', { value: v, selected: v === sel }, r));

// ─── Constantes espelhadas (rótulos; as regras vivem no servidor) ────────────
const ETAPAS = ['deteccao', 'identificacao', 'interrogacao', 'abordagem', 'inspecao', 'apresamento'];
const ROT_ETAPA = { deteccao: 'detecção', identificacao: 'identificação', interrogacao: 'interrogação',
  abordagem: 'abordagem (GVI)', inspecao: 'inspeção', apresamento: 'apresamento' };
const ESTACOES = ['COMPAAz', 'ComemCh', 'Com2ºDN', 'Com1ºDN', 'Com8ºDN', 'Com5ºDN'];
const AREAS = [{ id: '2DN', est: 'Com2ºDN', linhas: [0, 5], rot: '2º DN' }, { id: '1DN', est: 'Com1ºDN', linhas: [6, 9], rot: '1º DN' },
               { id: '8DN', est: 'Com8ºDN', linhas: [10, 11], rot: '8º DN' }, { id: '5DN', est: 'Com5ºDN', linhas: [12, 19], rot: '5º DN' }];
const APOIOS = [['mpa', 'Patrulha marítima (FAB)'], ['pf', 'Polícia Federal'], ['rf', 'Receita Federal'], ['ibama', 'IBAMA'],
                ['censipam', 'CENSIPAM (imageamento)'], ['intl', 'Inteligência internacional']];
const CAMPANHAS = [['comunicacao_estrategica', 'Comunicação estratégica'], ['transparencia', 'Transparência proativa'],
                   ['prova_documentada', 'Divulgação de prova documentada'], ['prebunking', 'Prebunking']];
const CRISES = [['crimes_ilicitos', 'Crimes e ilícitos no mar'], ['sabotagem_ic', 'Sabotagem de infraestrutura'],
                ['pesca_massa', 'Pesca ilegal em massa'], ['sar', 'SAR'], ['desastre', 'Resposta a desastres']];
const OCORRENCIAS = [['narcotrafico', 'Narcotráfico'], ['contrabando', 'Contrabando'], ['pesca_iuu', 'Pesca IUU'],
                     ['crime_ambiental', 'Crime ambiental'], ['pirataria', 'Pirataria'], ['imigracao', 'Imigração irregular']];
const rotuloChance = p => (p >= 0.9 ? 'quase certo' : p >= 0.6 ? 'provável' : p >= 0.3 ? 'arriscado' : 'remoto');

// Ícones extras (sem tocar units.js): tipo → [sigla, PNG existente]
const EXTRA = {
  inspecao_naval: ['IN', 'barco 2.png'], mcm: ['MC', 'navio.png'], usv: ['US', 'barco 2.png'], rov: ['RV', 'submarino.png'],
  uav: ['UA', 'aviao-de-combate.png'], gvi: ['FN', 'navio-de-guerra.png'],
  oc_narcotrafico: ['NC', 'navio.png'], oc_contrabando: ['CT', 'barco-de-carga.png'], oc_pesca_iuu: ['PE', 'barco-de-pesca.png'],
  oc_crime_ambiental: ['AM', 'navio.png'], oc_pirataria: ['PI', 'barco 2.png'], oc_imigracao: ['IM', 'navio.png'],
  hx_frota_sombra: ['FS', 'petroleiro.png'], hx_milicia_maritima: ['MI', 'barco-de-pesca.png'], hx_sabotagem_submarina: ['SB', 'submarino 2.png'],
  hx_usv_uav: ['UV', 'barco 2.png'], hx_gnss: ['GN', 'navio.png'], hx_minagem: ['MN', 'navio.png'], hx_null: ['??', 'navio.png'],
};
for (const [t, [ab, png]] of Object.entries(EXTRA)) { TYPE_ABBR[t] = ab; PNG_TYPE_MAP[t] = png; if (!ICON_TYPES.includes(t)) ICON_TYPES.push(t); }

// ─── Estado do cliente ───────────────────────────────────────────────────────
const socket = io('/sm');
let sessao = null;
try { sessao = JSON.parse(sessionStorage.getItem('smSessao') || 'null'); } catch { sessao = null; }
let ultimo = null;                       // { meta, situacao }
let plano = novoPlano();
let planoVerm = { acoes: [], desinformacao: false, gatilho: '', intensidade: 0.5, empregoAberto: false };
let estacaoAtiva = null, contatoSel = null, turnoPlano = -1;
let zoom = 1, panX = 0, panY = 0;
function novoPlano() { return { designacoes: [], pedidos: [], campanha: null, acionar: new Set() }; }

// ─── Lobby ───────────────────────────────────────────────────────────────────
const fc = $('form-criar');
function assentosDaModalidade() {
  const m = fc.modalidade.value;
  $('lbl-celula').style.display = m === 'distribuido' ? '' : 'none';
  const lista = m === 'unico' ? [['azul', 'Força Azul']] : m === '1x1' ? [['azul', 'Força Azul'], ['vermelho', 'Força Vermelha']]
    : [...ESTACOES.map(e => [e, e]), ...(fc.celulaBranca.checked ? [['celula', 'Célula Branca']] : [])];
  $('criar-assento').replaceChildren(...opcoes(lista));
}
fc.addEventListener('change', assentosDaModalidade);
assentosDaModalidade();
fc.addEventListener('submit', e => {
  e.preventDefault();
  const marcados = n => [...fc.querySelectorAll(`input[name=${n}]:checked`)].map(i => i.value);
  const cfg = {
    modalidade: fc.modalidade.value, dificuldade: fc.dificuldade.value, duracaoDias: Number(fc.duracaoDias.value),
    intensidadeHibrida: Number(fc.intensidadeHibrida.value), nivelInicial: Number(fc.nivelInicial.value),
    areasAtivas: marcados('area'), fontesAtivas: marcados('fonte'),
    trilhas: { defesa: fc.defesa.checked, constabular: fc.constabular.checked },
    apoioExterno: fc.apoioExterno.checked ? 1 : 0, celulaBranca: fc.modalidade.value === 'distribuido' && fc.celulaBranca.checked,
  };
  socket.emit('sm:criar', { cfg, assento: $('criar-assento').value, nome: fc.nome.value });
});
const fe = $('form-entrar');
$('btn-consultar').addEventListener('click', () => socket.emit('sm:consultar', { codigo: fe.codigo.value.trim() }));
socket.on('sm:sala', s => {
  $('entrar-assentos').replaceChildren(el('div', { class: 'sm-nota' }, `Sala ${s.codigo} · ${s.modalidade} · ${s.fase}`),
    ...s.assentos.map(a => el('button', { class: 'act-btn', type: 'button', disabled: !!a.jogador,
      onclick: () => socket.emit('sm:entrar', { codigo: s.codigo, assento: a.id, nome: fe.nome.value }) },
      a.jogador ? `${a.rotulo} — ${a.jogador}` : `Assumir: ${a.rotulo}`)));
});
socket.on('sm:sessao', s => { sessao = s; sessionStorage.setItem('smSessao', JSON.stringify(s)); });
socket.on('connect', () => { if (sessao?.token) socket.emit('sm:entrar', { codigo: sessao.codigo, token: sessao.token }); });
socket.on('sm:erro', msg => {
  if (/Sala não encontrada/.test(msg) && sessao) { sessionStorage.removeItem('smSessao'); sessao = null; }
  if (!$('jogo').classList.contains('hidden')) { const f = $('sm-erro'); f.textContent = msg; f.classList.remove('hidden'); setTimeout(() => f.classList.add('hidden'), 6000); }
  else $('lobby-erro').textContent = msg;
});
socket.on('sm:estado', estado => { ultimo = estado; mostrar(); });
$('btn-iniciar').addEventListener('click', () => socket.emit('sm:iniciar'));

// ─── Roteamento das telas ────────────────────────────────────────────────────
function mostrar() {
  const { meta } = ultimo;
  const lobby = meta.fase === 'lobby';
  $('lobby').classList.add('hidden');
  $('espera').classList.toggle('hidden', !lobby);
  $('jogo').classList.toggle('hidden', lobby);
  document.body.classList.toggle('em-jogo', !lobby);
  if (lobby) return mostrarEspera(meta);
  if (meta.dia !== turnoPlano) { plano = novoPlano(); planoVerm.acoes = []; planoVerm.empregoAberto = false; turnoPlano = meta.dia; contatoSel = null; }
  if (!estacaoAtiva || !meta.minhasEstacoes.includes(estacaoAtiva)) estacaoAtiva = meta.minhasEstacoes.find(e => e !== 'COMPAAz') ?? meta.minhasEstacoes[0] ?? null;
  cabecalho(); abaOrdens(); abaBoletim(); abaRegistro(); desenhar();
}
function mostrarEspera(meta) {
  $('espera-codigo').textContent = meta.codigo; $('espera-codigo2').textContent = meta.codigo;
  $('espera-modalidade').textContent = { unico: 'Jogador único', '1x1': 'Confronto 1×1', distribuido: 'Estações distribuídas' }[meta.modalidade];
  $('espera-assentos').replaceChildren(...meta.assentos.map(a => el('li', {}, el('span', {}, a.rotulo),
    a.jogador ? el('b', {}, a.jogador + (a.id === meta.meuAssento ? ' (você)' : '')) : el('span', { class: 'livre' }, meta.modalidade === 'distribuido' ? 'agente (doutrina)' : 'livre'))));
}

// ─── Cabeçalho ───────────────────────────────────────────────────────────────
function cabecalho() {
  const { meta, situacao: s } = ultimo;
  const papel = meta.papel;
  const b = $('sm-papel');
  b.textContent = papel === 'vermelho' ? 'FORÇA VERMELHA' : papel === 'celula' ? 'CÉLULA BRANCA' : meta.modalidade === 'distribuido' ? meta.meuAssento : 'FORÇA AZUL';
  b.className = `team-badge ${papel === 'vermelho' ? 'red' : papel === 'celula' ? 'facilitator' : 'blue'}`;
  $('sm-turno').textContent = `Dia ${meta.dia}/${s.duracao}`;
  const pz = $('sm-postura');
  pz.textContent = `${s.postura.sigla} ${s.postura.postura}`; pz.className = `sm-postura n${s.postura.nivel}`;
  const ap = s.informacional.apoio, cu = s.informacional.custoPolitico, teto = s.informacional.teto;
  $('sm-apoio-bar').firstElementChild.style.width = `${ap}%`; $('sm-apoio-txt').textContent = `${Math.round(ap)}%`;
  $('sm-custo-bar').firstElementChild.style.width = `${Math.min(100, 100 * cu / teto)}%`; $('sm-custo-txt').textContent = `${cu.toFixed(1)}/${teto}`;
  const minha = meta.aguardando.includes(meta.meuAssento);
  $('sm-vez').style.display = minha ? '' : 'none';
  const nomes = meta.aguardando.map(a => meta.assentos.find(x => x.id === a)?.rotulo ?? a);
  $('sm-fase').textContent = meta.fase === 'encerrada' ? 'Encerrada' : minha ? `Sua vez · ${rotFase(meta.fase)}` : nomes.length ? `Aguardando: ${nomes.join(', ')}` : rotFase(meta.fase);
}
const rotFase = f => ({ vermelho: 'lance Vermelho', azul: 'ordens Azuis', escalada: 'decisão de escalada', encerrada: 'encerrada' }[f] ?? f);

// ─── Aba Ordens ──────────────────────────────────────────────────────────────
function abaOrdens() {
  const { meta, situacao: s } = ultimo;
  const raiz = $('aba-ordens');
  const blocos = [];
  if (meta.fase === 'encerrada') blocos.push(fim(s));
  if (meta.papel === 'azul') blocos.push(...ordensAzuis(meta, s));
  else if (meta.papel === 'vermelho') blocos.push(...lanceVermelho(meta, s, false));
  else blocos.push(...painelCelula(meta, s));
  raiz.replaceChildren(...blocos);
}

function fim(s) {
  const m = s.metricas;
  return el('div', { class: 'sm-fim' }, el('b', {}, `Campanha encerrada: ${s.desfecho}`),
    el('div', { class: 'sub' }, `E1 atribuição ${fmt(m.E1_atrib)} · E2 infraestrutura ${fmt(m.E2_infra, 1)} · E3 ${m.E3_escalada} dias abaixo de N3 · E4 custo ${fmt(m.E4_custopol, 1)} · E5 ordem ${fmt(m.E5_ordem)} · E6 dispersão ${fmt(m.E6_dispersao)} · SLOC ${fmt(m.sloc_idx)}`),
    s.terminal ? el('div', { class: 'sub' }, `Escalada terminal: vencedor ${s.terminal.vencedor ?? '—'} · KCV ${s.terminal.kcvPerdido ? 'perdido' : 'preservado'} · atrito Azul ${s.terminal.atrito}%`) : null);
}
const fmt = (v, d = 2) => (v == null ? '—' : Number(v).toFixed(d));

function ordensAzuis(meta, s) {
  const out = [];
  const minha = meta.aguardando.includes(meta.meuAssento);
  if (meta.fase === 'escalada' && meta.proposta) {
    const p = meta.proposta;
    out.push(el('div', { class: 'sm-proposta' },
      el('b', {}, `Proposta de escalada (ComemCh): N${p.de} → N${p.para}`), el('span', { class: 'sub' }, `Gatilho: ${p.gatilho}. ${p.para === 3 ? 'N3 aciona a salva (conflito aberto) e encerra a campanha.' : ''}`),
      minha ? el('div', { class: 'sm-linha' },
        el('button', { class: 'act-btn red', onclick: () => socket.emit('sm:enviar', { tipo: 'autorizar', payload: { autorizado: true } }) }, 'Autorizar'),
        el('button', { class: 'act-btn', onclick: () => socket.emit('sm:enviar', { tipo: 'autorizar', payload: { autorizado: false } }) }, 'Negar'))
        : el('span', { class: 'sub' }, 'Aguardando a decisão do COMPAAz.')));
  }
  out.push(el('div', { class: 'sm-sec' }, el('h3', {}, 'Situação'),
    el('div', { class: 'sub' }, `ROE efetiva: até ${ROT_ETAPA[s.roe.tetoRoe]}${s.roe.largura < 0 ? ' (estreitada pelo apoio baixo)' : s.roe.largura > 0 ? ' (ampliada pelo apoio alto)' : ''} · constabular: até apresamento`),
    el('div', { class: 'sub' }, `${s.ocorrencias.length} ocorrências e ${s.contatosHibridos.length} contatos de interesse no quadro · ${s.tarefas.length} tarefas SAR/desastre`),
    ...s.crises.filter(c => c.status === 'ativa').map(c => el('div', { class: 'sub' }, `⚠ Crise: ${c.rotulo} (${c.area})`))));
  if (meta.fase !== 'azul') { out.push(el('div', { class: 'sm-espera' }, meta.fase === 'vermelho' ? 'Aguardando o lance Vermelho…' : '')); return out; }
  if (!minha) { out.push(el('div', { class: 'sm-espera' }, meta.enviado ? 'Ordens enviadas. Aguardando as demais estações…' : 'Aguardando…')); return out; }

  // Seletor de estação
  out.push(el('div', { class: 'sm-linha' }, 'Estação',
    el('select', { onchange: e => { estacaoAtiva = e.target.value; contatoSel = null; abaOrdens(); desenhar(); } },
      ...opcoes(meta.minhasEstacoes.map(e => [e, e]), estacaoAtiva))));
  if (estacaoAtiva === 'COMPAAz') out.push(...painelCOMPAAz(s));
  else if (estacaoAtiva) out.push(...painelEstacao(s, estacaoAtiva));
  out.push(planoResumo(s));
  out.push(el('button', { class: 'act-btn blue sm-enviar', onclick: enviarOrdens }, `Enviar ordens (${meta.minhasEstacoes.length > 1 ? 'todas as minhas estações' : meta.meuAssento})`));
  return out;
}

function painelCOMPAAz(s) {
  let apoio = 'pf', area = s.config.areasAtivas[0];
  const vig = s.apoios.map(p => `${p.apoio}@${p.area} ${p.concedido ? `vigente ${p.vigenteDe}–${p.vigenteAte}` : 'negado'}`);
  return [
    el('div', { class: 'sm-sec' }, el('h3', {}, 'Apoio externo (via COMPAAz)'),
      el('div', { class: 'sm-linha' },
        el('select', { onchange: e => { apoio = e.target.value; } }, ...opcoes(APOIOS, apoio)),
        el('select', { onchange: e => { area = e.target.value; } }, ...opcoes(s.config.areasAtivas.map(a => [a, a]), area)),
        el('button', { class: 'sm-mini', onclick: () => { plano.pedidos.push({ apoio, area }); abaOrdens(); } }, 'Pedir')),
      el('div', { class: 'sub' }, vig.length ? `Pedidos: ${vig.join(' · ')}` : 'Nenhum apoio pedido.')),
    el('div', { class: 'sm-sec' }, el('h3', {}, 'Campanha informacional (1 por turno)'),
      el('div', { class: 'sm-linha' },
        el('select', { onchange: e => { const t = e.target.value; plano.campanha = t ? { tipo: t, esclarece: s.gatilhos[0] ?? null } : null; abaOrdens(); } },
          ...opcoes([['', '— nenhuma —'], ...CAMPANHAS], plano.campanha?.tipo ?? '')),
        s.gatilhos.length && plano.campanha && ['transparencia', 'prova_documentada'].includes(plano.campanha.tipo)
          ? el('select', { onchange: e => { plano.campanha.esclarece = e.target.value; } }, ...opcoes(s.gatilhos.map(g => [g, `esclarecer ${g}`]), plano.campanha.esclarece))
          : null),
      el('div', { class: 'sub' }, `Ações frágeis exploráveis pela desinformação: ${s.gatilhos.length || 'nenhuma'}${s.provaDisponivel ? ` · prova disponível (${Math.round(s.provaDisponivel.atribuicao)}%)` : ''}`)),
  ];
}

function jurisdicao(s, est) {
  const hib = s.contatosHibridos.filter(h => est === 'ComemCh' || h.responsavel === est).map(h => ({ ...h, hib: true }));
  const oc = est === 'ComemCh' ? [] : s.ocorrencias.filter(o => o.responsavel === est).map(o => ({ ...o, hib: false }));
  return [...hib, ...oc];
}
function meioPronto(m) {
  return m.disponivel || (plano.acionar.has(m.id) && m.escalao === 'sar') || (m.escalao === null && (m.type === 'usv' || m.type === 'rov'));
}
function painelEstacao(s, est) {
  const orc = s.orcamentos[est];
  const usadas = plano.designacoes.filter(d => d.estacao === est).length;
  const contatos = jurisdicao(s, est);
  const meios = s.meios.filter(m => m.estacao === est && !['gvi', 'centro_fusao'].includes(m.type));
  return [
    el('div', { class: 'sm-sec' }, el('h3', {}, `Contatos sob ${est}`),
      el('div', { class: 'sub' }, contatos.length ? 'Selecione um contato e depois um meio.' : 'Nenhum contato no quadro.'),
      el('div', { class: 'sm-itens' }, ...contatos.map(c => el('div', {
        class: `sm-item ${c.hib ? 'hib' : 'oc'} ${contatoSel === c.id ? 'sel' : ''}`,
        onclick: () => { contatoSel = contatoSel === c.id ? null : c.id; abaOrdens(); desenhar(); } },
        el('span', {}, c.hib ? `◆ ${c.rotulo}` : `● ${c.rotulo}`),
        el('span', { class: 'sm-tag' }, c.hib ? `efeito em ${c.restante}d` : `foge em ${c.turnosRestantes}d`),
        el('small', {}, c.hib ? `${c.id} · ${c.area} · atribuição ${Math.round(c.atribuicao)}% (${c.classe})${c.exigeMcm ? ' · exige MCM' : ''}`
                              : `${c.id} · ${c.area} · reprime com ${ROT_ETAPA[c.etapaRepressao]}`))))),
    el('div', { class: 'sm-sec' }, el('h3', {}, `Meios · ${usadas}/${orc.n} ações${orc.surto ? ' (surto: −' + 2 + ' no próximo turno)' : ''}`),
      el('div', { class: 'sm-linha' }, el('button', { class: 'sm-mini', onclick: () => { meios.filter(m => ['sar', 'fpe'].includes(m.escalao) && !m.acionado).forEach(m => plano.acionar.add(m.id)); abaOrdens(); } }, 'Acionar SAR + FPE'),
        el('span', { class: 'sub' }, 'SAR: pronto já · FPE: em 24 h · demais: 48 h')),
      el('div', { class: 'sm-itens' }, ...meios.map(m => {
        const pronto = meioPronto(m) && !plano.designacoes.some(d => d.meio === m.id);
        const status = m.disponivel ? 'pronto' : m.acionado ? `pronto no dia ${m.prontoEm}` : plano.acionar.has(m.id) ? 'acionar ✓' : m.escalao === null ? (pronto ? 'pronto' : 'apoio') : 'não acionado';
        return el('div', { class: `sm-item ${pronto ? '' : 'off'}`, onclick: () => designar(m, est, pronto) },
          el('span', {}, `${m.nome}`),
          el('span', {}, m.escalao ? el('span', { class: `sm-tag ${m.escalao}` }, m.escalao.toUpperCase()) : null, ' ', el('span', { class: `sm-tag ${pronto ? 'pronto' : ''}` }, status)),
          el('small', {}, `${m.classe}${m.fator ? ' · ' + m.fator : ''}`,
            !m.acionado && !plano.acionar.has(m.id) && m.escalao ? el('button', { class: 'sm-mini', onclick: ev => { ev.stopPropagation(); plano.acionar.add(m.id); abaOrdens(); } }, 'acionar') : null,
            pronto && ['fragata', 'corveta', 'patrulha_oc', 'patrulha_c', 'inspecao_naval', 'submarino', 'usv'].includes(m.type)
              ? el('button', { class: 'sm-mini', onclick: ev => { ev.stopPropagation(); plano.designacoes.push({ estacao: est, meio: m.id, patrulha: true, rotulo: `${m.nome} → patrulha` }); abaOrdens(); } }, 'patrulhar') : null));
      }))),
  ];
}
function designar(m, est, pronto) {
  if (!contatoSel || !pronto) return;
  const s = ultimo.situacao;
  const c = jurisdicao(s, est).find(x => x.id === contatoSel);
  if (!c) return;
  const teto = c.hib ? s.roe.tetoRoe : 'apresamento';
  const padrao = c.hib ? teto : c.etapaRepressao;
  plano.designacoes.push({ estacao: est, meio: m.id, contato: c.id, etapaAlvo: padrao, teto, rotulo: `${m.nome} → ${c.rotulo} (${c.id})` });
  contatoSel = null; abaOrdens(); desenhar();
}
function planoResumo() {
  const linhas = [
    ...plano.designacoes.map((d, k) => el('div', {}, el('span', {}, d.rotulo),
      d.patrulha ? null : el('select', { onchange: e => { d.etapaAlvo = e.target.value; } },
        ...opcoes(ETAPAS.slice(0, ETAPAS.indexOf(d.teto) + 1).map(x => [x, `até ${ROT_ETAPA[x]}`]), d.etapaAlvo)),
      el('button', { onclick: () => { plano.designacoes.splice(k, 1); abaOrdens(); } }, '✕'))),
    ...[...plano.acionar].map(id => el('div', {}, el('span', {}, `acionar ${id}`), el('button', { onclick: () => { plano.acionar.delete(id); abaOrdens(); } }, '✕'))),
    ...plano.pedidos.map((p, k) => el('div', {}, el('span', {}, `pedir ${p.apoio} para ${p.area}`), el('button', { onclick: () => { plano.pedidos.splice(k, 1); abaOrdens(); } }, '✕'))),
    plano.campanha ? el('div', {}, el('span', {}, `campanha: ${plano.campanha.tipo}${plano.campanha.esclarece ? ' (' + plano.campanha.esclarece + ')' : ''}`)) : null,
  ].filter(Boolean);
  return el('div', { class: 'sm-sec' }, el('h3', {}, 'Ordens do turno'),
    el('div', { class: 'sub' }, 'Etapa-alvo acima do que a atribuição fundamenta gera custo político; a ROE é o limite.'),
    el('div', { class: 'sm-plano' }, ...(linhas.length ? linhas : [el('div', { class: 'sub' }, 'Nenhuma ordem (as estações ficam paradas).')])));
}
function enviarOrdens() {
  socket.emit('sm:enviar', { tipo: 'ordens', payload: {
    designacoes: plano.designacoes.map(({ estacao, meio, contato, etapaAlvo, patrulha }) => ({ estacao, meio, contato, etapaAlvo, patrulha })),
    pedidos: plano.pedidos, campanha: plano.campanha, acionar: [...plano.acionar] } });
}

// ─── Vermelho ────────────────────────────────────────────────────────────────
function lanceVermelho(meta, s, celula) {
  const v = celula ? s.vermelho : s;
  const out = [];
  out.push(el('div', { class: 'sm-sec verm' }, el('h3', {}, 'Campanha híbrida'),
    el('div', { class: 'sub' }, `Área-alvo do roteiro: ${v.areaAlvo ?? '—'} · postura Azul ${v.postura.sigla} · apoio público ${Math.round(v.informacional.apoio)}%`),
    el('div', { class: 'sm-itens' }, ...v.acoes.slice().reverse().slice(0, 30).map(a => el('div', { class: `sm-item hib ${a.status !== 'ativo' ? 'off' : ''}` },
      el('span', {}, `${a.vetor} → ${a.alvo}`), el('span', { class: 'sm-tag' }, a.status === 'ativo' ? `efeito em ${a.restante}d` : a.status),
      el('small', {}, `${a.id} · ${a.area} · ${a.percebida ? 'percebida' : 'não percebida'} · atribuição Azul ${Math.round(a.atribuicao)}%`))))));
  const vez = meta.fase === 'vermelho' && meta.aguardando.includes(meta.meuAssento);
  if (!vez) { out.push(el('div', { class: 'sm-espera' }, 'Aguardando o Azul…')); return out; }
  let vetor = v.vetores[0]?.vetor;
  const alvosDe = vt => v.infraestrutura.filter(i => i.sp > 0 && v.config.areasAtivas.includes(i.area) && (v.vetores.find(x => x.vetor === vt)?.alvos ?? []).includes(i.tipo));
  const selAlvo = el('select', {}, ...opcoes(alvosDe(vetor).map(i => [i.id, `${i.id} ${i.nome} (${i.area}, SP ${i.sp})`])));
  out.push(el('div', { class: 'sm-sec verm' }, el('h3', {}, `Lance do turno (até ${v.maxAcoes} ações)`),
    el('div', { class: 'sm-linha' },
      el('select', { onchange: e => { vetor = e.target.value; selAlvo.replaceChildren(...opcoes(alvosDe(vetor).map(i => [i.id, `${i.id} ${i.nome} (${i.area}, SP ${i.sp})`]))); } },
        ...opcoes(v.vetores.map(x => [x.vetor, x.rotulo]), vetor)), selAlvo,
      el('button', { class: 'sm-mini', onclick: () => { if (planoVerm.acoes.length < v.maxAcoes && selAlvo.value) { planoVerm.acoes.push({ vetor, alvo: selAlvo.value }); abaOrdens(); desenhar(); } } }, 'Adicionar')),
    el('div', { class: 'sm-plano' }, ...planoVerm.acoes.map((a, k) => el('div', {}, el('span', {}, `${a.vetor} → ${a.alvo}`), el('button', { onclick: () => { planoVerm.acoes.splice(k, 1); abaOrdens(); } }, '✕')))),
    v.lawfare ? el('label', { class: 'sm-linha' }, el('input', { type: 'checkbox', checked: planoVerm.desinformacao, onchange: e => { planoVerm.desinformacao = e.target.checked; } }), 'Desinformação',
      el('select', { onchange: e => { planoVerm.gatilho = e.target.value; } }, ...opcoes([['', 'fabricada'], ...v.gatilhos.map(g => [g, `explorar ${g}`])], planoVerm.gatilho))) : null,
    v.empregoAbertoPermitido ? el('label', { class: 'sm-linha' }, el('input', { type: 'checkbox', onchange: e => { planoVerm.empregoAberto = e.target.checked; } }), 'Emprego aberto de meios (gatilho de N3)') : null,
    el('div', { class: 'sm-linha' },
      el('button', { class: 'act-btn red', onclick: () => socket.emit('sm:enviar', { tipo: 'vermelho', payload: {
        acoes: planoVerm.acoes, empregoAberto: planoVerm.empregoAberto,
        desinformacao: planoVerm.desinformacao ? { gatilho: planoVerm.gatilho || null } : null } }) }, 'Enviar lance'),
      celula ? el('button', { class: 'act-btn', onclick: () => socket.emit('sm:enviar', { tipo: 'vermelho', payload: { motor: true } }) }, 'Vermelho pelo motor') : null)));
  return out;
}

// ─── Célula Branca ───────────────────────────────────────────────────────────
function painelCelula(meta, s) {
  const out = [...lanceVermelho(meta, s, true)];
  let tipo = 'injetar_crise';
  const campos = el('div', { class: 'sm-linha' });
  const just = el('input', { type: 'text', placeholder: 'Justificativa (obrigatória)' });
  const areas = s.config.areasAtivas.map(a => [a, a]);
  const montar = () => {
    const c = [];
    if (tipo === 'injetar_crise') c.push(el('select', { name: 'tipo' }, ...opcoes(CRISES)), el('select', { name: 'area' }, ...opcoes(areas)),
      el('input', { type: 'text', name: 'inicio', value: String(s.turno + 1), size: 3, title: 'Dia de início' }));
    if (tipo === 'injetar_evento') c.push(el('select', { name: 'evento' }, ...opcoes([['incidente_hibrido', 'Incidente híbrido'], ['dano_infra', 'Dano a infraestrutura'], ['ataque_armado', 'Ataque armado'], ['emprego_aberto', 'Emprego aberto']])),
      el('input', { type: 'text', name: 'atribuicao', value: '50', size: 3, title: 'Atribuição %' }));
    if (tipo === 'injetar_ocorrencia') c.push(el('select', { name: 'tipo' }, ...opcoes(OCORRENCIAS)), el('select', { name: 'area' }, ...opcoes(areas)));
    if (tipo === 'ajustar_parametro') c.push(el('select', { name: 'chave' }, ...opcoes([['intensidadeHibrida', 'intensidade híbrida'], ['areaAlvoHibrida', 'área-alvo do híbrido'], ['dificuldade', 'dificuldade'], ['mostrarNumeros', 'mostrar números']])),
      el('input', { type: 'text', name: 'valor', placeholder: 'valor' }));
    if (tipo === 'transferir_area') c.push(el('select', { name: 'area' }, ...opcoes(areas)), el('select', { name: 'para' }, ...opcoes(AREAS.map(a => [a.est, a.est]))));
    if (tipo === 'anular_lance') c.push(el('select', { name: 'lanceId' }, ...opcoes((meta.lancesPendentes ?? []).map(l => [l.lance, `${l.lance}: ${l.meio} → ${l.contato ?? 'patrulha'}`]))));
    campos.replaceChildren(...c);
  };
  montar();
  const valor = n => campos.querySelector(`[name=${n}]`)?.value;
  const enviar = () => {
    let payload = {};
    if (tipo === 'injetar_crise') payload = { tipo: valor('tipo'), area: valor('area'), inicio: Number(valor('inicio')) };
    if (tipo === 'injetar_evento') payload = { evento: { tipo: valor('evento'), atribuicao: Number(valor('atribuicao')) } };
    if (tipo === 'injetar_ocorrencia') payload = { tipo: valor('tipo'), area: valor('area') };
    if (tipo === 'ajustar_parametro') { const ch = valor('chave'), v = valor('valor'); payload = { chave: ch, valor: ch === 'intensidadeHibrida' ? Number(v) : ch === 'mostrarNumeros' ? v === 'true' : v }; }
    if (tipo === 'transferir_area') payload = { area: valor('area'), para: valor('para') };
    if (tipo === 'anular_lance') payload = { lanceId: valor('lanceId') };
    socket.emit('sm:enviar', { tipo: 'celula', payload: { tipo, payload, justificativa: just.value } });
  };
  out.push(el('div', { class: 'sm-sec cb' }, el('h3', {}, 'Arbitragem (§8.5)'),
    el('div', { class: 'sub' }, `Verdade do motor: ${s.verdade.ocorrencias.length} ocorrências abertas (${s.verdade.conhecidos.length} no quadro Azul) · ${s.verdade.hibridos.filter(h => h.status === 'ativo').length} ações híbridas ativas`),
    el('select', { onchange: e => { tipo = e.target.value; montar(); } }, ...opcoes([['injetar_crise', 'Injetar crise'], ['injetar_evento', 'Injetar evento'], ['injetar_ocorrencia', 'Injetar ocorrência'],
      ['ajustar_parametro', 'Ajustar parâmetro'], ['transferir_area', 'Transferir área'], ['anular_lance', 'Anular lance Azul']], tipo)),
    campos, just, el('button', { class: 'act-btn', onclick: enviar }, 'Registrar intervenção'),
    el('div', { class: 'sm-itens' }, ...s.registroCelula.slice().reverse().map(r => el('div', { class: 'sm-msg celula' }, `Dia ${r.turno} · ${r.tipo}: ${r.justificativa}`)))));
  return out;
}

// ─── Abas Boletim e Registro ─────────────────────────────────────────────────
function abaBoletim() {
  const { situacao: s } = ultimo;
  const num = $('tg-numeros').checked;
  const enc = (s.registro ?? []).filter(r => r.tipo === 'encontro').map(r => el('div', { class: 'sm-msg' },
    `${r.unidade} → ${r.contato}: `, r.resultado.etapas.map(x => `${ROT_ETAPA[x.etapa]} (${rotuloChance(x.p)}${num ? ` ${Math.round(x.p * 100)}%` : ''}) ${x.sucesso ? '✓' : '✗'}`).join(' · ') || 'sem encontro'));
  const m = s.metricas;
  $('aba-boletim').replaceChildren(
    el('div', { class: 'sm-sec' }, el('h3', {}, 'Boletim de situação'), el('div', { class: 'sm-boletim' }, (s.boletim ?? []).join('\n') || '—')),
    el('div', { class: 'sm-sec' }, el('h3', {}, 'Encontros do turno'), ...(enc.length ? enc : [el('div', { class: 'sub' }, '—')])),
    el('div', { class: 'sm-sec' }, el('h3', {}, 'Medidas da campanha'),
      el('div', { class: 'sub' }, `E1 atribuição ${fmt(m.E1_atrib)} · E2 infraestrutura ${fmt(m.E2_infra, 1)} · E3 ${m.E3_escalada} · E4 custo ${fmt(m.E4_custopol, 1)} · E5 ordem ${fmt(m.E5_ordem)} · E6 dispersão ${fmt(m.E6_dispersao)} · SLOC ${fmt(m.sloc_idx)} · ocorrências ${m.ocorr_reprimidas}/${m.n_ocorr_crim} · apoios ${m.n_apoios_concedidos}`)));
}
function abaRegistro() {
  const { meta } = ultimo;
  $('aba-registro').replaceChildren(el('div', { class: 'sm-sec' }, el('h3', {}, `Sala ${meta.codigo}`),
    ...meta.assentos.map(a => el('div', { class: 'sub' }, `${a.rotulo}: ${a.jogador ? a.jogador + (a.online ? '' : ' (desconectado)') : a.agente ? 'agente (doutrina)' : 'livre'}`))),
    el('div', { class: 'sm-sec' }, el('h3', {}, 'Registro'), ...meta.mensagens.slice().reverse().map(x => el('div', { class: `sm-msg ${x.tipo ?? ''}` }, `Dia ${x.turno} · ${x.texto}`))));
}
document.querySelectorAll('.sm-abas button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.sm-abas button').forEach(x => x.classList.toggle('ativa', x === b));
  for (const a of ['ordens', 'boletim', 'registro']) $(`aba-${a}`).classList.toggle('hidden', a !== b.dataset.aba);
}));
['tg-numeros', 'tg-dn', 'tg-zee'].forEach(id => $(id).addEventListener('change', () => { if (ultimo?.situacao) { abaBoletim(); desenhar(); } }));

// ─── Carta ───────────────────────────────────────────────────────────────────
const canvas = $('sm-canvas'), ctx = canvas.getContext('2d');
canvas.width = CVS_W; canvas.height = CVS_H;
const mapa = new Image(); mapa.onload = () => desenhar(); mapa.src = '/mapa.jpeg';
initIcons(() => desenhar());
const ZEE = (() => {
  const terra = []; for (let r = 0; r < GRID_H; r++) for (let c = 0; c < GRID_W; c++) if (TERRAIN_MAP[r][c] === T_LAND) terra.push([c, r]);
  const s = new Set();
  for (let r = 0; r < GRID_H; r++) for (let c = 0; c < GRID_W; c++)
    if (TERRAIN_MAP[r][c] !== T_LAND && terra.some(([tc, tr]) => hexDist(c, r, tc, tr) <= 3)) s.add(`${c},${r}`);
  return s;
})();
const tipoOcorrencia = o => `oc_${o.tipo}`;
const tipoHibrido = h => `hx_${h.vetor}`;
const tipoMeio = t => ({ centro_fusao: null }[t] === null ? null : t);

function desenhar() {
  if (!ultimo?.situacao) return;
  const { meta, situacao: s } = ultimo;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, CVS_W, CVS_H);
  ctx.setTransform(zoom, 0, 0, zoom, panX, panY);
  if (mapa.complete) ctx.drawImage(mapa, 0, 0, CVS_W, CVS_H);
  const ativas = new Set(s.config.areasAtivas);
  // Faixas dos Distritos Navais; áreas inativas esmaecidas
  for (const a of AREAS) {
    for (let r = a.linhas[0]; r <= a.linhas[1]; r++) for (let c = 0; c < GRID_W; c++) {
      const { x, y } = hexToPixel(c, r);
      if (!ativas.has(a.id)) drawHex(ctx, x, y, 'rgba(5,15,25,0.45)', null);
      else if ($('tg-zee').checked && ZEE.has(`${c},${r}`)) drawHex(ctx, x, y, 'rgba(0,229,255,0.07)', null);
    }
    if ($('tg-dn').checked) {
      const yTopo = hexToPixel(0, a.linhas[0]).y - HEX_H / 2;
      ctx.strokeStyle = 'rgba(255,213,79,0.55)'; ctx.setLineDash([10, 6]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(OX - HEX_R, yTopo); ctx.lineTo(OX + HEX_R * 1.5 * GRID_W, yTopo); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,213,79,0.9)'; ctx.font = `bold ${Math.round(HEX_R * 0.42)}px Courier New`; ctx.textAlign = 'right';
      ctx.fillText(`${a.rot} · ${s.responsavelPorArea?.[a.id] ?? a.est}`, OX + HEX_R * 1.5 * (GRID_W - 1), yTopo + HEX_R * 0.6);
    }
  }
  // Infraestrutura crítica
  for (const i of s.infraestrutura) {
    ctx.strokeStyle = i.sp > 0 ? 'rgba(255,204,2,0.8)' : 'rgba(255,82,82,0.9)'; ctx.lineWidth = 3;
    if (i.hexes.length > 1) {
      ctx.beginPath(); i.hexes.forEach(([c, r], k) => { const p = hexToPixel(c, r); k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.stroke();
    }
    const [c, r] = i.hexes[i.tipo === 'cabo' || i.tipo === 'duto' ? Math.floor(i.hexes.length / 2) : 0];
    const p = hexToPixel(c, r);
    const w = HEX_R * 0.9, f = i.sp / i.spMax;
    ctx.fillStyle = '#050d15'; ctx.fillRect(p.x - w / 2, p.y + HEX_R * 0.55, w, 4);
    ctx.fillStyle = f > 0.6 ? '#69f0ae' : f > 0.3 ? '#ffca28' : '#ff5252'; ctx.fillRect(p.x - w / 2, p.y + HEX_R * 0.55, w * f, 4);
  }
  const marcas = [];
  if (meta.papel !== 'vermelho') {
    for (const o of s.ocorrencias) marcas.push({ c: o.col, r: o.row, u: { team: 'neutral', type: tipoOcorrencia(o), hp: o.turnosRestantes, maxHp: 3 }, id: o.id });
    for (const h of s.contatosHibridos) marcas.push({ c: h.col, r: h.row, u: { team: 'red', type: h.vetor ? tipoHibrido(h) : 'hx_null', hp: 100 - h.atribuicao, maxHp: 100 }, id: h.id });
    const porHex = new Map();
    for (const m of s.meios) { if (!tipoMeio(m.type) || m.category === 'embarked') continue; const k = `${m.col},${m.row}`; (porHex.get(k) ?? porHex.set(k, []).get(k)).push(m); }
    for (const [k, ms] of porHex) { const [c, r] = k.split(',').map(Number); marcas.push({ c, r, u: { team: 'blue', type: ms[0].type, hp: 1, maxHp: 1 }, n: ms.length, dy: 0.35 }); }
  }
  const acoesV = meta.papel === 'vermelho' ? s.acoes : meta.papel === 'celula' ? s.vermelho.acoes : [];
  for (const a of acoesV.filter(x => x.status === 'ativo')) marcas.push({ c: a.col, r: a.row, u: { team: 'red', type: tipoHibrido(a), hp: a.restante, maxHp: 3 }, id: a.id, dy: -0.35 });
  // Desenha agrupando por hexágono (deslocamento simples para não sobrepor)
  const vistos = new Map();
  for (const m of marcas) {
    const k = `${m.c},${m.r}`; const n = vistos.get(k) ?? 0; vistos.set(k, n + 1);
    const p = hexToPixel(m.c, m.r);
    const dx = (n % 3 - 1) * HEX_R * 0.55 * (n ? 1 : 0), dy = (m.dy ?? 0) * HEX_R + Math.floor(n / 3) * HEX_R * 0.5;
    drawUnitCounter(ctx, m.u, p.x + dx, p.y + dy, m.id && m.id === contatoSel);
    if (m.n > 1) { ctx.fillStyle = '#ffd54f'; ctx.font = `bold ${Math.round(HEX_R * 0.32)}px Courier New`; ctx.textAlign = 'left'; ctx.fillText(`×${m.n}`, p.x + dx + HEX_R * 0.45, p.y + dy - HEX_R * 0.3); }
  }
}

// ─── Zoom, arrasto e clique na carta ─────────────────────────────────────────
function paraJogo(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) * CVS_W / r.width - panX) / zoom, y: ((ev.clientY - r.top) * CVS_H / r.height - panY) / zoom };
}
function aplicarZoom(f, cx = CVS_W / 2, cy = CVS_H / 2) {
  const z = Math.max(1, Math.min(5, zoom * f));
  panX = cx - (cx - panX) * (z / zoom); panY = cy - (cy - panY) * (z / zoom); zoom = z;
  panX = Math.max(CVS_W * (1 - zoom), Math.min(0, panX)); panY = Math.max(CVS_H * (1 - zoom), Math.min(0, panY));
  desenhar();
}
$('zoom-in').onclick = () => aplicarZoom(1.25); $('zoom-out').onclick = () => aplicarZoom(0.8);
$('zoom-reset').onclick = () => { zoom = 1; panX = panY = 0; desenhar(); };
canvas.addEventListener('wheel', e => { e.preventDefault(); const r = canvas.getBoundingClientRect(); aplicarZoom(e.deltaY < 0 ? 1.15 : 0.87, (e.clientX - r.left) * CVS_W / r.width, (e.clientY - r.top) * CVS_H / r.height); }, { passive: false });
let arrasto = null;
canvas.addEventListener('mousedown', e => { arrasto = { x: e.clientX, y: e.clientY, px: panX, py: panY, moveu: false }; });
window.addEventListener('mouseup', () => { setTimeout(() => { arrasto = null; }, 0); });
canvas.addEventListener('mousemove', e => {
  if (arrasto && (e.buttons & 1)) {
    const r = canvas.getBoundingClientRect();
    const dx = (e.clientX - arrasto.x) * CVS_W / r.width, dy = (e.clientY - arrasto.y) * CVS_H / r.height;
    if (Math.abs(dx) + Math.abs(dy) > 4) arrasto.moveu = true;
    panX = Math.max(CVS_W * (1 - zoom), Math.min(0, arrasto.px + dx)); panY = Math.max(CVS_H * (1 - zoom), Math.min(0, arrasto.py + dy)); desenhar();
    return;
  }
  if (!ultimo?.situacao) return;
  const { x, y } = paraJogo(e), h = pixelToHex(x, y), s = ultimo.situacao;
  const aqui = [...(s.ocorrencias ?? []).filter(o => o.col === h.col && o.row === h.row).map(o => `● ${o.rotulo} ${o.id}`),
                ...(s.contatosHibridos ?? []).filter(o => o.col === h.col && o.row === h.row).map(o => `◆ ${o.rotulo} ${o.id} (${Math.round(o.atribuicao)}%)`),
                ...s.infraestrutura.filter(i => i.hexes.some(([c, r]) => c === h.col && r === h.row)).map(i => `▲ ${i.nome} SP ${i.sp}/${i.spMax}`)];
  const tip = $('sm-tip');
  tip.textContent = `${hexLabel(h.col)}${h.row + 1} · ${T_NAME[TERRAIN_MAP[h.row][h.col]]}${aqui.length ? ' · ' + aqui.join(' · ') : ''}`;
  tip.style.display = 'block';
});
canvas.addEventListener('click', e => {
  if (arrasto?.moveu || !ultimo?.situacao || ultimo.meta.papel !== 'azul') return;
  const { x, y } = paraJogo(e), h = pixelToHex(x, y);
  const c = jurisdicao(ultimo.situacao, estacaoAtiva ?? 'ComemCh').find(o => o.col === h.col && o.row === h.row);
  if (c) { contatoSel = c.id; abaOrdens(); desenhar(); }
});
