'use strict';

/**
 * params.js — Parâmetros numéricos da variante de Segurança Marítima (OAS-SM).
 *
 * Todos os números da variante ficam aqui, num só lugar, para que possam ser
 * calibrados sem tocar a lógica dos módulos. São placeholders de projeto
 * (Conceito v1.6, Aviso; Desenho Experimental v1.3, Aviso): nenhum deles foi
 * validado e nenhum deve sustentar conclusão analítica antes de sê-lo.
 *
 * Os módulos recebem os parâmetros por argumento (com este objeto como padrão),
 * de modo que um lote de sensibilidade (SM-10) possa variar um valor sem
 * estado global.
 */

// ─── Motor de encontro (Conceito §9.1) ────────────────────────────────────────

// Etapas da resolução abaixo do limiar, na ordem em que se encadeiam. Cada
// etapa só é tentada se a anterior teve sucesso.
const ETAPAS = ['deteccao', 'identificacao', 'interrogacao', 'abordagem', 'inspecao', 'apresamento'];

const ROTULO_ETAPA = {
  deteccao:      'detecção',
  identificacao: 'identificação',
  interrogacao:  'interrogação',
  abordagem:     'abordagem e vistoria (GVI)',
  inspecao:      'inspeção',
  apresamento:   'apresamento',
};

// Eixo de capacidade da unidade que cada etapa exige: as três primeiras
// dependem de sensores e comunicações; as três últimas, de grupo de visita e
// inspeção embarcado (fator E_GVI).
const EIXO_ETAPA = {
  deteccao: 'sensor', identificacao: 'sensor', interrogacao: 'sensor',
  abordagem: 'gvi', inspecao: 'gvi', apresamento: 'gvi',
};

// Probabilidade-base de sucesso da etapa, para unidade de capacidade 1 com
// fusão plena (1) e contato sem evasão.
// TODO: validar com especialista
const P_BASE = {
  deteccao: 0.85, identificacao: 0.75, interrogacao: 0.80,
  abordagem: 0.70, inspecao: 0.80, apresamento: 0.75,
};

// Peso da fusão de dados por etapa: com fusão 0 a probabilidade cai a
// PISO_FUSAO × P_BASE; com fusão 1 fica em P_BASE. A fusão pesa mais na
// detecção e na identificação (consciência situacional) e pouco na execução
// da abordagem (Conceito §7.2; Desenho §3).
// TODO: validar com especialista
const PISO_FUSAO = {
  deteccao: 0.40, identificacao: 0.45, interrogacao: 0.70,
  abordagem: 0.85, inspecao: 0.80, apresamento: 0.90,
};

// Etapas em que a evasão do contato (AIS desligado, ocultação, enxameamento)
// reduz a probabilidade.
const ETAPAS_COM_EVASAO = ['deteccao', 'identificacao'];

// Capacidade da unidade por tipo de plataforma (board.js COMP_DISPLAY_TYPE),
// nos dois eixos, de 0 (incapaz) a 1. Tipo ausente = incapaz: encontro nulo.
// Uma unidade pode trazer `capSM: { sensor, gvi }` próprio, que prevalece.
// TODO: validar com especialista
const CAPACIDADE_POR_TIPO = {
  patrulha_oc:      { sensor: 0.85, gvi: 0.90 },  // NPaOc Classe Amazonas
  patrulha_c:       { sensor: 0.65, gvi: 0.80 },  // NPa Classe Grajaú/Macaé/Bracuí
  fragata:          { sensor: 1.00, gvi: 0.75 },
  corveta:          { sensor: 0.90, gvi: 0.75 },
  destroier:        { sensor: 1.00, gvi: 0.70 },
  amphib:           { sensor: 0.60, gvi: 1.00 },  // NDM Bahia: plataforma para abordagem
  carrier:          { sensor: 0.80, gvi: 0.60 },
  patrulha:         { sensor: 1.00, gvi: 0.00 },  // aviação de patrulha marítima (A_MPA)
  helicoptero:      { sensor: 0.70, gvi: 0.50 },
  aew:              { sensor: 0.90, gvi: 0.00 },
  submarino:        { sensor: 0.70, gvi: 0.00 },
  sub_nuclear:      { sensor: 0.80, gvi: 0.00 },
  specops:          { sensor: 0.40, gvi: 1.00 },
  logistico:        { sensor: 0.30, gvi: 0.20 },
  tanque:           { sensor: 0.30, gvi: 0.10 },
};

// ─── Atribuição (Conceito §9.2) ───────────────────────────────────────────────

// Fração da distância até 100% que cada etapa bem-sucedida cobre, antes dos
// moduladores (negabilidade, fusão, ritmo). A detecção pouco diz sobre quem
// está por trás; a inspeção e o apresamento produzem prova.
// TODO: validar com especialista
const GANHO_EVIDENCIA = {
  deteccao: 0.05, identificacao: 0.15, interrogacao: 0.15,
  abordagem: 0.20, inspecao: 0.30, apresamento: 0.30,
};

// Multiplicador do ganho de evidência pela negabilidade do vetor (Tabela 4.1).
// TODO: validar com especialista
const FATOR_NEGABILIDADE = {
  baixa:      1.00,
  media:      0.80,
  alta:       0.55,
  muito_alta: 0.35,
};
const NEGABILIDADE_PADRAO = 'media';

// Peso da fusão sobre o ganho de evidência: com fusão 0 o ganho cai a este
// piso; com fusão 1 é integral.
// TODO: validar com especialista
const PISO_FUSAO_EVIDENCIA = 0.50;

// Atribuição mínima (0–100) a partir da qual cada etapa é resposta
// fundamentada. Agir acima disso não é proibido (a ROE é que proíbe), mas
// gera risco político proporcional à distância.
// TODO: validar com especialista
const LIMIAR_ATRIBUICAO = {
  deteccao: 0, identificacao: 0, interrogacao: 20,
  abordagem: 40, inspecao: 40, apresamento: 70,
};

// Peso político de agir em cada etapa sem a atribuição correspondente.
// TODO: validar com especialista
const PESO_POLITICO = {
  deteccao: 0, identificacao: 0, interrogacao: 0.5,
  abordagem: 2, inspecao: 2, apresamento: 4,
};

// Faixas de classificação da atribuição (limite inferior inclusivo).
const CLASSES_ATRIBUICAO = [
  { min: 100, classe: 'plena' },
  { min: 70,  classe: 'robusta' },
  { min: 40,  classe: 'parcial' },
  { min: 1e-9, classe: 'fragil' },
  { min: 0,   classe: 'nula' },
];

// ─── Escada de escalada (Conceito §9.3, Tabela 9.1) ───────────────────────────

// Níveis de postura. `tetoRoe` é a etapa máxima do motor de encontro que a
// ROE do nível permite; `acoes` são as respostas autorizadas (catálogo
// ACOES abaixo). Em N1 a abordagem é só consentida; a coercitiva, o
// apresamento e a zona de exclusão começam em N2; o emprego de força (e a
// salva) só em N3.
const NIVEIS = [
  { nivel: 0, sigla: 'N0', postura: 'Rotina',   tetoRoe: 'identificacao',
    acoes: ['vigilancia', 'presenca', 'registro'] },
  { nivel: 1, sigla: 'N1', postura: 'Tensão',   tetoRoe: 'inspecao',
    acoes: ['vigilancia', 'presenca', 'registro', 'interrogacao', 'escolta', 'abordagem_consentida'] },
  { nivel: 2, sigla: 'N2', postura: 'Crise',    tetoRoe: 'apresamento',
    acoes: ['vigilancia', 'presenca', 'registro', 'interrogacao', 'escolta', 'abordagem_consentida',
            'abordagem_coercitiva', 'apresamento', 'zona_exclusao'] },
  { nivel: 3, sigla: 'N3', postura: 'Conflito', tetoRoe: 'apresamento',
    acoes: ['vigilancia', 'presenca', 'registro', 'interrogacao', 'escolta', 'abordagem_consentida',
            'abordagem_coercitiva', 'apresamento', 'zona_exclusao', 'emprego_forca'] },
];

// Catálogo de respostas, na ordem de coerção crescente; o índice é o "nível
// mínimo" implícito de cada uma (lido de NIVEIS).
const ACOES = [
  'vigilancia', 'presenca', 'registro', 'interrogacao', 'escolta', 'abordagem_consentida',
  'abordagem_coercitiva', 'apresamento', 'zona_exclusao', 'emprego_forca',
];

// Gatilhos de subida (Tabela 9.1), avaliados sobre os eventos do turno e a
// janela recente.
// TODO: validar com especialista
const GATILHOS_ESCALADA = {
  // N0 → N1: padrão de incidentes (N incidentes híbridos na janela) OU um
  // incidente com atribuição parcial.
  N1: { incidentesJanela: 3, janelaTurnos: 3, atribuicaoMin: 40 },
  // N1 → N2: dano a infraestrutura com atribuição robusta.
  N2: { atribuicaoMin: 70 },
  // N2 → N3: ataque armado atribuído (robusta) ou emprego aberto de meios.
  N3: { atribuicaoMin: 70 },
};

// Turnos consecutivos sem gatilho do nível corrente para propor descida de
// um nível.
// TODO: validar com especialista
const TURNOS_PARA_DESESCALAR = 4;

// ─── Boletim (Conceito §8.4) ──────────────────────────────────────────────────

// Probabilidade em palavras (limite inferior inclusivo).
const ROTULOS_PROBABILIDADE = [
  { min: 0.90, rotulo: 'quase certo' },
  { min: 0.60, rotulo: 'provável' },
  { min: 0.30, rotulo: 'arriscado' },
  { min: 0,    rotulo: 'remoto' },
];

const PARAMS = {
  ETAPAS, ROTULO_ETAPA, EIXO_ETAPA, P_BASE, PISO_FUSAO, ETAPAS_COM_EVASAO,
  CAPACIDADE_POR_TIPO, GANHO_EVIDENCIA, FATOR_NEGABILIDADE, NEGABILIDADE_PADRAO,
  PISO_FUSAO_EVIDENCIA, LIMIAR_ATRIBUICAO, PESO_POLITICO, CLASSES_ATRIBUICAO,
  ROTULOS_PROBABILIDADE,
  NIVEIS, ACOES, GATILHOS_ESCALADA, TURNOS_PARA_DESESCALAR,
};

module.exports = { PARAMS, ...PARAMS };
