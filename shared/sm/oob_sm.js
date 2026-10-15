'use strict';

/**
 * oob_sm.js — Ordem de batalha da OAS-SM e prontidão (Conceito §10).
 *
 * Estende a OOB do jogo base sem alterá-la (shared/order_of_battle.js segue
 * sendo a do wargame e da escalada terminal N3). Aqui ficam:
 *   - os meios Azuis de Segurança Marítima, por estação: Esquadra (ComemCh) e
 *     os pacotes dos Distritos Navais, com classes em serviço na MB
 *     (Tabelas 10.1 e 10.2), abstraídas;
 *   - os NPaOc Classe Amazonas no conjunto do COMPAAz, alocados às áreas
 *     ativas conforme a prioridade (§10.3);
 *   - os fatores de capacidade (Tabela 10.3): cada meio tem no máximo um
 *     fator; desligar o fator retira exatamente os meios marcados com ele;
 *   - os meios Vermelhos negáveis (proxies) e a reserva estratégica, que é
 *     a força Vermelha do jogo base, empregável só em N3 (§10.6);
 *   - a infraestrutura crítica (FPSOs, portos, cabos e dutos), com a força
 *     inicial do configurador;
 *   - os escalões de prontidão (Tabela 10.4): Navio SAR (imediato), Força de
 *     Pronto Emprego (≤ 24 h) e demais (48 h após o acionamento), em turnos.
 *
 * Quantitativos, cascos e lotações são parâmetros de projeto (§10.1).
 * Sem aleatoriedade; estruturas novas a cada chamada.
 */

const { PARAMS: P } = require('./params');
const { ORDER_OF_BATTLE } = require('../order_of_battle');
const EN = require('./encounter');

// Hexágonos-base (navegáveis) de cada estação, na grade 28×20.
// TODO: validar com especialista
const BASES = {
  ComemCh:   { col: 9,  row: 9,  nome: 'BN Rio de Janeiro (J-10)' },
  'Com1ºDN': { col: 8,  row: 9,  nome: 'Rio de Janeiro (I-10)' },
  'Com2ºDN': { col: 13, row: 0,  nome: 'Salvador (N-1)' },
  'Com8ºDN': { col: 6,  row: 11, nome: 'Santos (G-12)' },
  'Com5ºDN': { col: 1,  row: 18, nome: 'Rio Grande (B-19)' },
  COMPAAz:   { col: 8,  row: 9,  nome: 'Rio de Janeiro (I-10)' },
  BASC:      { col: 7,  row: 8,  nome: 'BA Santa Cruz (H-9)' },
};

// Meios Azuis. `prioridade` ordena a designação de prontidão (menor primeiro);
// `sar` marca o meio apto a ser Navio SAR.
// TODO: validar com especialista (composição, quantitativos, lotação)
const u = (id, nome, classe, type, category, estacao, extra = {}) =>
  ({ id, nome, classe, type, category, estacao, base: extra.base ?? estacao, fator: extra.fator ?? null,
     prioridade: extra.prioridade ?? 9, sar: !!extra.sar });
const MEIOS_AZUIS = [
  // Esquadra (Tabela 10.1)
  u('ESQ-FCN-1',  'F Niterói',              'Classe Niterói',        'fragata',   'surface',   'ComemCh', { prioridade: 2 }),
  u('ESQ-FCN-2',  'F Independência',        'Classe Niterói',        'fragata',   'surface',   'ComemCh', { prioridade: 3 }),
  u('ESQ-FCT-1',  'F Tamandaré',            'Classe Tamandaré',      'fragata',   'surface',   'ComemCh', { prioridade: 1, sar: true }),
  u('ESQ-CVB-1',  'CV Barroso',             'Classe Barroso',        'corveta',   'surface',   'ComemCh', { prioridade: 1, sar: true }),
  u('ESQ-SBT-1',  'S Tikuna',               'Classe Tupi/Tikuna',    'submarino', 'submarine', 'ComemCh', { prioridade: 5 }),
  u('ESQ-SBR-1',  'S Riachuelo',            'Classe Riachuelo',      'submarino', 'submarine', 'ComemCh', { prioridade: 4 }),
  u('ESQ-SBR-2',  'S Humaitá',              'Classe Riachuelo',      'submarino', 'submarine', 'ComemCh', { prioridade: 5 }),
  u('ESQ-NAM',    'NAM Atlântico',          'A140',                  'carrier',   'surface',   'ComemCh', { prioridade: 6 }),
  u('ESQ-NDM',    'NDM Bahia',              'G40',                   'amphib',    'surface',   'ComemCh', { prioridade: 6 }),
  u('ESQ-NT',     'NT Alte Gastão Motta',   'Gastão Motta',          'tanque',    'surface',   'ComemCh', { prioridade: 8 }),
  u('ESQ-RbAM',   'RbAM Triunfo',           'Classe Triunfo',        'logistico', 'surface',   'ComemCh', { prioridade: 8 }),
  // Distritos Navais (Tabela 10.2) — patrulha (B_NPaOc), inspeção naval, MCM
  u('2DN-NPA-1',  'NPa Grajaú',             'Classe Grajaú',         'patrulha_c', 'surface', 'Com2ºDN', { fator: 'B_NPaOc', prioridade: 1, sar: true }),
  u('2DN-NPA-2',  'NPa Guaíba',             'Classe Grajaú',         'patrulha_c', 'surface', 'Com2ºDN', { fator: 'B_NPaOc', prioridade: 2, sar: true }),
  u('2DN-INS',    'Aviso de Inspeção (2º DN)', 'Inspeção naval',     'inspecao_naval', 'surface', 'Com2ºDN', { prioridade: 3, sar: true }),
  u('1DN-NPA-1',  'NPa Bracuí',             'Classe Bracuí',         'patrulha_c', 'surface', 'Com1ºDN', { fator: 'B_NPaOc', prioridade: 1, sar: true }),
  u('1DN-NPA-2',  'NPa Guanabara',          'Classe Grajaú',         'patrulha_c', 'surface', 'Com1ºDN', { fator: 'B_NPaOc', prioridade: 2, sar: true }),
  u('1DN-MSA-1',  'NV Aratu',               'Classe Aratu',          'mcm',        'surface', 'Com1ºDN', { prioridade: 6 }),
  u('1DN-MSA-2',  'NV Anhatomirim',         'Classe Aratu',          'mcm',        'surface', 'Com1ºDN', { prioridade: 6 }),
  u('1DN-MCM',    'NCM Amorim do Valle',    'Amorim do Valle',       'mcm',        'surface', 'Com1ºDN', { prioridade: 6 }),
  u('1DN-INS',    'Aviso de Inspeção (1º DN)', 'Inspeção naval',     'inspecao_naval', 'surface', 'Com1ºDN', { prioridade: 3, sar: true }),
  u('8DN-NPA-1',  'NPa Macaé',              'Classe Macaé',          'patrulha_c', 'surface', 'Com8ºDN', { fator: 'B_NPaOc', prioridade: 1, sar: true }),
  u('8DN-NPA-2',  'NPa Macau',              'Classe Macaé',          'patrulha_c', 'surface', 'Com8ºDN', { fator: 'B_NPaOc', prioridade: 2, sar: true }),
  u('8DN-INS',    'Aviso de Inspeção (8º DN)', 'Inspeção naval',     'inspecao_naval', 'surface', 'Com8ºDN', { prioridade: 3, sar: true }),
  u('5DN-NPA-1',  'NPa Gravataí',           'Classe Grajaú',         'patrulha_c', 'surface', 'Com5ºDN', { fator: 'B_NPaOc', prioridade: 1, sar: true }),
  u('5DN-NPA-2',  'NPa Babitonga',          'Classe Grajaú',         'patrulha_c', 'surface', 'Com5ºDN', { fator: 'B_NPaOc', prioridade: 2, sar: true }),
  u('5DN-INS',    'Aviso de Inspeção (5º DN)', 'Inspeção naval',     'inspecao_naval', 'surface', 'Com5ºDN', { prioridade: 3, sar: true }),
  // NPaOc Classe Amazonas — conjunto do COMPAAz, alocado às áreas ativas
  u('NPAOC-P120', 'NPaOc Amazonas',         'Classe Amazonas',       'patrulha_oc', 'surface', 'COMPAAz', { fator: 'B_NPaOc', prioridade: 0, sar: true }),
  u('NPAOC-P121', 'NPaOc Apa',              'Classe Amazonas',       'patrulha_oc', 'surface', 'COMPAAz', { fator: 'B_NPaOc', prioridade: 0, sar: true }),
  u('NPAOC-P122', 'NPaOc Araguari',         'Classe Amazonas',       'patrulha_oc', 'surface', 'COMPAAz', { fator: 'B_NPaOc', prioridade: 0, sar: true }),
  // A_MPA — aviação de patrulha (ativada via FAB, §7.4)
  u('MPA-1',      'P-3AM Orion (1)',        'P-3AM',                 'patrulha',  'air', 'COMPAAz', { fator: 'A_MPA', base: 'BASC' }),
  u('MPA-2',      'P-3AM Orion (2)',        'P-3AM',                 'patrulha',  'air', 'COMPAAz', { fator: 'A_MPA', base: 'BASC' }),
  // C_Fusao — SisGAAz ampliado (centro de fusão do COMPAAz)
  u('SISGAAZ',    'SisGAAz / centro de fusão', 'SisGAAz',            'centro_fusao', 'fixed', 'COMPAAz', { fator: 'C_Fusao' }),
  // D_USV — sistemas não tripulados (inclui MCM não tripulada)
  u('USV-1',      'USV de vigilância (Esquadra)', 'USV',             'usv', 'surface', 'ComemCh', { fator: 'D_USV' }),
  u('UAV-1',      'UAV de patrulha (COMPAAz)',    'UAV',             'uav', 'air',     'COMPAAz', { fator: 'D_USV' }),
  u('ROV-1',      'ROV de inspeção/MCM (1º DN)',  'ROV',             'rov', 'surface', 'Com1ºDN', { fator: 'D_USV' }),
  u('USV-8',      'USV de vigilância (8º DN)',    'USV',             'usv', 'surface', 'Com8ºDN', { fator: 'D_USV' }),
  // E_GVI — grupamentos de Fuzileiros Navais embarcados
  u('GVI-ESQ',    'GptFN embarcado (Esquadra)', 'Fuzileiros Navais', 'gvi', 'embarked', 'ComemCh', { fator: 'E_GVI' }),
  u('GVI-2DN',    'GptFN embarcado (2º DN)',    'Fuzileiros Navais', 'gvi', 'embarked', 'Com2ºDN', { fator: 'E_GVI' }),
  u('GVI-1DN',    'GptFN embarcado (1º DN)',    'Fuzileiros Navais', 'gvi', 'embarked', 'Com1ºDN', { fator: 'E_GVI' }),
  u('GVI-8DN',    'GptFN embarcado (8º DN)',    'Fuzileiros Navais', 'gvi', 'embarked', 'Com8ºDN', { fator: 'E_GVI' }),
  u('GVI-5DN',    'GptFN embarcado (5º DN)',    'Fuzileiros Navais', 'gvi', 'embarked', 'Com5ºDN', { fator: 'E_GVI' }),
];

// Meios Vermelhos negáveis (§10.6), por vetor da Tabela 4.1.
const PROXIES_VERMELHOS = [
  { id: 'RP-SOMBRA-1', nome: 'Mercante de frota-sombra',  vetor: 'frota_sombra' },
  { id: 'RP-SOMBRA-2', nome: 'Petroleiro de frota-sombra', vetor: 'frota_sombra' },
  { id: 'RP-MILICIA',  nome: 'Flotilha de milícia marítima', vetor: 'milicia_maritima' },
  { id: 'RP-SABOT',    nome: 'Célula de sabotagem submarina', vetor: 'sabotagem_submarina' },
  { id: 'RP-USV',      nome: 'Célula de USV/UAV',          vetor: 'usv_uav' },
  { id: 'RP-GNSS',     nome: 'Interferidor GNSS embarcado', vetor: 'gnss' },
  { id: 'RP-CIBER',    nome: 'Célula cibernética / GE',     vetor: 'ciber' },
  { id: 'RP-MINAS',    nome: 'Lançador encoberto de minas', vetor: 'minagem' },
];

// Infraestrutura crítica (centro de gravidade, §2.2). Posições da carta
// OAS-MAP-001; cabos e dutos são traçados abstratos entre hexágonos.
// TODO: validar com especialista (traçados, SP)
const INFRA = [
  { id: 'PLT-01', nome: 'Bacia de Santos Sul',  tipo: 'fpso',  hexes: [[8, 11]],  sp: 6 },
  { id: 'PLT-02', nome: 'Bacia de Santos Norte', tipo: 'fpso', hexes: [[7, 10]],  sp: 6 },
  { id: 'PLT-03', nome: 'Bacia de Búzios',      tipo: 'fpso',  hexes: [[10, 10]], sp: 6 },
  { id: 'PLT-04', nome: 'Bacia de Campos Sul',  tipo: 'fpso',  hexes: [[11, 8]],  sp: 6 },
  { id: 'PLT-05', nome: 'Bacia de Campos Norte', tipo: 'fpso', hexes: [[12, 8]],  sp: 6 },
  { id: 'PRT-01', nome: 'Porto de Santos',      tipo: 'porto', hexes: [[6, 10]],  sp: 20 },
  { id: 'PRT-02', nome: 'Porto do Rio de Janeiro', tipo: 'porto', hexes: [[8, 9]], sp: 20 },
  { id: 'PRT-03', nome: 'Vitória / Tubarão',    tipo: 'porto', hexes: [[11, 6]],  sp: 16 },
  { id: 'PRT-04', nome: 'Porto do Açu',         tipo: 'porto', hexes: [[10, 8]],  sp: 12 },
  { id: 'PRT-07', nome: 'Porto de Salvador',    tipo: 'porto', hexes: [[12, 0]],  sp: 14 },
  { id: 'PRT-10', nome: 'Porto do Rio Grande',  tipo: 'porto', hexes: [[1, 18]],  sp: 14 },
  { id: 'DUTO-CAMPOS', nome: 'Duto Campos → Açu', tipo: 'duto', hexes: [[12, 8], [11, 8], [10, 8]], sp: 4 },
  { id: 'DUTO-SANTOS', nome: 'Duto Santos → São Sebastião', tipo: 'duto', hexes: [[8, 11], [7, 10], [6, 10]], sp: 4 },
  { id: 'CABO-RJ',  nome: 'Cabo submarino (Rio)',    tipo: 'cabo', hexes: [[8, 9], [9, 10], [10, 11], [11, 12], [12, 12]], sp: 3 },
  { id: 'CABO-NE',  nome: 'Cabo submarino (Salvador)', tipo: 'cabo', hexes: [[13, 0], [14, 1], [15, 1], [16, 2]], sp: 3 },
];

// ─── Montagem ────────────────────────────────────────────────────────────────

function copia(x) { return JSON.parse(JSON.stringify(x)); }

/** Lista completa (todos os fatores ligados), antes da alocação dos NPaOc. */
function meiosAzuis() {
  return MEIOS_AZUIS.map(m => ({ ...copia(m), col: BASES[m.base].col, row: BASES[m.base].row }));
}

/**
 * Interruptores de fator: retira exatamente os meios do fator desligado.
 * @param {object[]} meios
 * @param {object} fatores  { A_MPA: ±1, … }
 */
function aplicarFatores(meios, fatores = {}, params = P) {
  for (const f of Object.keys(fatores)) if (!params.FATORES_SM.includes(f)) throw new Error(`oob_sm: fator desconhecido ${f}`);
  return meios.filter(m => m.fator === null || (fatores[m.fator] ?? 1) === 1);
}

/**
 * Aloca os NPaOc do COMPAAz às áreas ativas, um por área, na ordem de
 * prioridade das áreas (padrão: a ordem de AREAS_DN); sobras ficam com o
 * COMPAAz. O NPaOc passa a responder ao DN da área e parte da base dele.
 */
function alocarNPaOc(meios, areasAtivas, prioridade = areasAtivas, params = P) {
  const ordem = prioridade.filter(a => areasAtivas.includes(a));
  const estacaoDe = a => params.AREAS_DN.find(x => x.id === a).estacao;
  let k = 0;
  return meios.map(m => {
    if (m.type !== 'patrulha_oc' || m.estacao !== 'COMPAAz' || k >= ordem.length) return m;
    const est = estacaoDe(ordem[k++]);
    return { ...m, estacao: est, base: est, col: BASES[est].col, row: BASES[est].row, alocadoPor: 'COMPAAz' };
  });
}

/**
 * OOB da campanha a partir da configuração (campaign.configurarCampanha).
 * @returns {{azul: object[], vermelho: {proxies: object[], reservaEstrategica: string[]}, infraestrutura: object[]}}
 */
function montarOOB(config, { prioridadeNPaOc } = {}, params = P) {
  const azul = alocarNPaOc(aplicarFatores(meiosAzuis(), config.fatores, params), config.areasAtivas, prioridadeNPaOc ?? config.areasAtivas, params);
  const proxies = copia(PROXIES_VERMELHOS).filter(p => (config.vetoresHibridos ?? []).includes(p.vetor));
  const reservaEstrategica = ORDER_OF_BATTLE.forces.red.map(r => r.id);
  const fi = config.forcaInicial ?? { plataformas: 1, portos: 1 };
  const infraestrutura = copia(INFRA).map(i => {
    const f = i.tipo === 'fpso' ? fi.plataformas : i.tipo === 'porto' ? fi.portos : 1;
    return { ...i, spMax: i.sp, sp: Math.max(1, Math.round(i.sp * f)) };
  });
  return { azul, vermelho: { proxies, reservaEstrategica }, infraestrutura };
}

/** Fusão ampliada presente (o SisGAAz do fator C_Fusao está na OOB)? */
function cFusaoAtiva(azul) { return azul.some(m => m.type === 'centro_fusao'); }

/**
 * Capacidade do meio para o motor de encontro: a da tabela por tipo, com a
 * abordagem reduzida a FATOR_SEM_GVI quando a estação não tem grupamento de
 * Fuzileiros embarcado (fator E_GVI desligado).
 */
function unidadeParaEncontro(meio, azul, params = P) {
  const comGvi = azul.some(m => m.type === 'gvi' && m.estacao === meio.estacao);
  const sensor = EN.capacidadeUnidade({ type: meio.type }, 'sensor', params);
  const gvi = EN.capacidadeUnidade({ type: meio.type }, 'gvi', params) * (comGvi ? 1 : params.FATOR_SEM_GVI);
  return { id: meio.id, type: meio.type, capSM: { sensor, gvi } };
}

// ─── Prontidão ───────────────────────────────────────────────────────────────

const ehNavio = m => m.category === 'surface' || m.category === 'submarine';
const ehTripulado = m => !['usv', 'rov'].includes(m.type);

/**
 * Designa os escalões por estação (Tabela 10.4): 1 Navio SAR (o primeiro
 * apto, por prioridade), depois a FPE (2 por DN, 3 na Esquadra); o resto é
 * "demais". Só navios tripulados entram nos escalões; aeronaves, sistemas
 * não tripulados, o centro de fusão e os GptFN ficam fora (null).
 *
 * @returns {Object<string, {escalao: 'sar'|'fpe'|'demais'|null, atraso: number}>}
 */
function designarProntidao(azul, params = P) {
  const out = {};
  const porEstacao = new Map();
  for (const m of azul) {
    if (!ehNavio(m) || !ehTripulado(m)) { out[m.id] = { escalao: null, atraso: 0 }; continue; }
    if (!porEstacao.has(m.estacao)) porEstacao.set(m.estacao, []);
    porEstacao.get(m.estacao).push(m);
  }
  for (const [est, navios] of porEstacao) {
    navios.sort((a, b) => a.prioridade - b.prioridade || (a.id < b.id ? -1 : 1));
    const chave = est === 'ComemCh' ? 'ComemCh' : 'DN';
    const nSar = est === 'COMPAAz' ? 0 : params.PRONTIDAO.sar.porEstacao[chave];
    const nFpe = est === 'COMPAAz' ? 0 : params.PRONTIDAO.fpe.porEstacao[chave];
    const restantes = navios.slice();
    const sar = restantes.filter(m => m.sar).slice(0, nSar);
    for (const m of sar) restantes.splice(restantes.indexOf(m), 1);
    const fpe = restantes.slice(0, nFpe);
    for (const m of navios) {
      const escalao = sar.includes(m) ? 'sar' : fpe.includes(m) ? 'fpe' : 'demais';
      out[m.id] = { escalao, atraso: params.PRONTIDAO[escalao].atraso };
    }
  }
  return out;
}

function criarEstadoProntidao(azul, params = P) {
  return { designacao: designarProntidao(azul, params), acionamentos: {} };
}

/** Aciona o meio no turno; vale o primeiro acionamento. */
function acionar(estado, id, turno) {
  if (!(id in estado.designacao)) throw new Error(`oob_sm: meio desconhecido ${id}`);
  if (id in estado.acionamentos) return estado;
  return { ...estado, acionamentos: { ...estado.acionamentos, [id]: turno } };
}

/** Turno a partir do qual o meio pode mover (null se não acionado). */
function podeMoverAPartirDe(estado, id) {
  if (!(id in estado.acionamentos)) return null;
  return estado.acionamentos[id] + estado.designacao[id].atraso;
}

function podeMover(estado, id, turno) {
  const t = podeMoverAPartirDe(estado, id);
  return t !== null && turno >= t;
}

module.exports = {
  BASES, MEIOS_AZUIS, PROXIES_VERMELHOS, INFRA,
  meiosAzuis, aplicarFatores, alocarNPaOc, montarOOB, cFusaoAtiva, unidadeParaEncontro,
  designarProntidao, criarEstadoProntidao, acionar, podeMoverAPartirDe, podeMover,
};
