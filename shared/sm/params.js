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

// ─── Trilha constabular (Conceito §5, Tabela 5.1) ─────────────────────────────

// Áreas dos Distritos Navais na grade 28×20 (linhas 0-indexadas, inclusivas),
// de norte a sul. Só hexágonos de mar a até DIST_MAX_COSTA da terra (≈ ZEE,
// 200 mn com hexágono de ~75 mn) recebem ocorrências.
// TODO: validar com especialista (limites jurisdicionais na carta)
const AREAS_DN = [
  { id: '2DN', estacao: 'Com2ºDN', nome: 'Flanco norte (BA–SE)',   linhas: [0, 5]   },
  { id: '1DN', estacao: 'Com1ºDN', nome: 'Campos/Búzios (RJ–ES)',  linhas: [6, 9]   },
  { id: '8DN', estacao: 'Com8ºDN', nome: 'Bacia de Santos (SP)',   linhas: [10, 11] },
  { id: '5DN', estacao: 'Com5ºDN', nome: 'Flanco sul (SC–RS)',     linhas: [12, 19] },
];
const DIST_MAX_COSTA = 3;

// Tipos de ocorrência. Por tipo:
//   lambda       incidência média por turno de 24 h, por área (Poisson);
//   terrenos     terrenos onde a ocorrência pode surgir (board.js T_*);
//   etapaRepressao  etapa do motor de encontro que conta como reprimida;
//   duracao      turnos até a ocorrência se encerrar sem resposta (escapa);
//   evasao       evasão do contato nas etapas de percepção (SM-1);
//   exploravel   peso relativo do tipo quando o híbrido instrumentaliza
//                ocorrências para saturação (0 = nunca).
// Terrenos: 1 águas rasas, 2 plataforma, 3 águas profundas, 4 bacia petrolífera.
// TODO: validar com especialista
const TIPOS_OCORRENCIA = {
  narcotrafico:    { rotulo: 'Narcotráfico',             terrenos: [1, 2, 3],
                     lambda: { '2DN': 0.15, '1DN': 0.20, '8DN': 0.30, '5DN': 0.15 },
                     etapaRepressao: 'apresamento', duracao: 2, evasao: 0.30, exploravel: 1 },
  contrabando:     { rotulo: 'Contrabando / descaminho', terrenos: [1, 2],
                     lambda: { '2DN': 0.10, '1DN': 0.15, '8DN': 0.20, '5DN': 0.15 },
                     etapaRepressao: 'apresamento', duracao: 2, evasao: 0.20, exploravel: 1 },
  pesca_iuu:       { rotulo: 'Pesca irregular (IUU)',    terrenos: [1, 2, 3, 4],
                     lambda: { '2DN': 0.25, '1DN': 0.15, '8DN': 0.15, '5DN': 0.30 },
                     etapaRepressao: 'apresamento', duracao: 3, evasao: 0.10, exploravel: 3 },
  crime_ambiental: { rotulo: 'Crime ambiental',          terrenos: [1, 2, 4],
                     lambda: { '2DN': 0.05, '1DN': 0.15, '8DN': 0.10, '5DN': 0.05 },
                     etapaRepressao: 'inspecao',    duracao: 3, evasao: 0.20, exploravel: 2 },
  pirataria:       { rotulo: 'Pirataria / roubo armado', terrenos: [1, 2, 4],
                     lambda: { '2DN': 0.05, '1DN': 0.10, '8DN': 0.10, '5DN': 0.05 },
                     etapaRepressao: 'abordagem',   duracao: 1, evasao: 0.25, exploravel: 1 },
  imigracao:       { rotulo: 'Imigração irregular',      terrenos: [1, 2],
                     lambda: { '2DN': 0.10, '1DN': 0.05, '8DN': 0.05, '5DN': 0.10 },
                     etapaRepressao: 'abordagem',   duracao: 2, evasao: 0.05, exploravel: 2 },
};

// Autoridade de polícia marítima: a resposta constabular é aplicação da lei,
// não escalada — seu teto no motor de encontro independe do nível N0–N3.
const TETO_CONSTABULAR = 'apresamento';

// Acoplamento com o híbrido (Conceito §4.2, §5.2).
// TODO: validar com especialista
const ACOPLAMENTO = {
  // Probabilidade de uma ocorrência de rotina ser, sem que se saiba,
  // cobertura para a trilha de defesa (escala com a intensidade híbrida).
  pCoberturaMax: 0.15,
  // Ocorrências extras de saturação por turno, à intensidade híbrida 1,
  // distribuídas pelas áreas que NÃO são o alvo do híbrido (o flanco oposto).
  lambdaSaturacaoMax: 1.5,
  // Etapa a partir da qual o encontro com uma ocorrência de cobertura revela
  // o vínculo com o híbrido (gera evento para a escada de escalada).
  etapaRevelaVinculo: 'inspecao',
};

// Sal das sub-sequências aleatórias: a sequência de rotina não depende do
// acoplamento (mesma semente ⇒ mesmas ocorrências de rotina em toda condição).
const SAL_CONSTAB = { rotina: 0x9E3779B9, saturacao: 0x85EBCA6B };

// ─── C2: estações, papéis e fusão (Conceito §7) ───────────────────────────────

// As seis estações Azuis (Tabela 7.1). `papeis` são as decisões que só a
// estação pode tomar; `area` liga os Distritos Navais às áreas de AREAS_DN.
const ESTACOES = [
  { id: 'COMPAAz', nome: 'Comando de Patrulha Azul',     nivel: 'apice',   trilha: 'transversal',
    papeis: ['autorizar_escalada', 'priorizar_esforco', 'alocar_isr', 'solicitar_mpa', 'solicitar_apoio', 'alocar_npaoc'] },
  { id: 'ComemCh', nome: 'Comando-em-Chefe da Esquadra', nivel: 'subord', trilha: 'defesa',
    papeis: ['propor_escalada', 'empregar_esquadra', 'engajar_n3'] },
  { id: 'Com2ºDN', nome: 'Comando do 2º Distrito Naval', nivel: 'subord', trilha: 'constabular', area: '2DN',
    papeis: ['responder_ocorrencia', 'empregar_meios_distrito'] },
  { id: 'Com1ºDN', nome: 'Comando do 1º Distrito Naval', nivel: 'subord', trilha: 'constabular', area: '1DN',
    papeis: ['responder_ocorrencia', 'empregar_meios_distrito'] },
  { id: 'Com8ºDN', nome: 'Comando do 8º Distrito Naval', nivel: 'subord', trilha: 'constabular', area: '8DN',
    papeis: ['responder_ocorrencia', 'empregar_meios_distrito'] },
  { id: 'Com5ºDN', nome: 'Comando do 5º Distrito Naval', nivel: 'subord', trilha: 'constabular', area: '5DN',
    papeis: ['responder_ocorrencia', 'empregar_meios_distrito'] },
];

// Modalidades (§7.3). Só muda quem decide cada estação; as regras não mudam.
const MODALIDADES = ['unico', '1x1', 'distribuido'];

// Fontes de dados de embarcações (Tabela 8.3). `peso` é a contribuição para
// a qualidade da fusão; `confiabilidade`, a confiança de um contato reportado
// só por ela; `latencia`, turnos até o reporte chegar ao barramento.
// TODO: validar com especialista
const FONTES = {
  ais:          { rotulo: 'AIS',                              peso: 0.20, confiabilidade: 0.70, latencia: 0 },
  preps:        { rotulo: 'PREPS',                            peso: 0.10, confiabilidade: 0.80, latencia: 0 },
  radar:        { rotulo: 'Radares costeiros',                peso: 0.15, confiabilidade: 0.85, latencia: 0 },
  unidades:     { rotulo: 'Contatos de unidades em patrulha', peso: 0.20, confiabilidade: 0.95, latencia: 0 },
  satelite:     { rotulo: 'Satélite',                         peso: 0.20, confiabilidade: 0.60, latencia: 1 },
  inteligencia: { rotulo: 'Sistemas de inteligência',         peso: 0.15, confiabilidade: 0.50, latencia: 1 },
};
// Sem o fator C_Fusão (SisGAAz ampliado), a fusão não passa deste teto.
// TODO: validar com especialista
const TETO_FUSAO_SEM_C = 0.55;

// ─── Apoio externo via COMPAAz (Conceito §7.4, Tabela 7.2) ────────────────────

// Por apoio: `prazo` em turnos até entrar em vigor; `duracao` em turnos de
// vigência; `disponibilidade` = probabilidade de o pedido ser atendido;
// `pertinencia` = tipos de ação/ocorrência sobre os quais atua; efeito:
//   fatorCapacidade  multiplica a capacidade da unidade no encontro;
//   bonusFusao       soma à qualidade da fusão no encontro;
//   fatorRitmo       multiplica o ritmo de evidência (atribuição).
// 'hibrido' na pertinência = contatos da trilha de defesa.
// TODO: validar com especialista
const APOIOS = {
  mpa:      { rotulo: 'Patrulha marítima (FAB)',  prazo: 1, duracao: 1, disponibilidade: 0.80,
              pertinencia: ['*'],                      bonusFusao: 0.20 },
  pf:       { rotulo: 'Polícia Federal',          prazo: 1, duracao: 3, disponibilidade: 0.90,
              pertinencia: ['narcotrafico'],           fatorCapacidade: 1.30 },
  rf:       { rotulo: 'Receita Federal',          prazo: 1, duracao: 3, disponibilidade: 0.90,
              pertinencia: ['contrabando'],            fatorCapacidade: 1.30 },
  ibama:    { rotulo: 'IBAMA',                    prazo: 2, duracao: 3, disponibilidade: 0.80,
              pertinencia: ['crime_ambiental', 'pesca_iuu'], fatorCapacidade: 1.30 },
  censipam: { rotulo: 'CENSIPAM (imageamento)',   prazo: 1, duracao: 2, disponibilidade: 0.90,
              pertinencia: ['*'],                      bonusFusao: 0.10 },
  intl:     { rotulo: 'Inteligência internacional', prazo: 3, duracao: 5, disponibilidade: 0.60,
              pertinencia: ['hibrido'],                fatorRitmo: 1.50 },
};
// Sal da sub-sequência dos apoios concedidos (independente das demais).
const SAL_APOIO = 0xC2B2AE35;

// ─── Campanha (Conceito §8) ───────────────────────────────────────────────────

// Duração da campanha em turnos de 24 h (§9.5).
const DURACAO_DIAS = { min: 30, max: 60, padrao: 45 };

// Vetores do ator híbrido (Tabela 4.1), com a negabilidade que o motor de
// encontro usa no ganho de evidência. Lawfare não é contato no mar.
const VETORES_HIBRIDOS = {
  frota_sombra:        { rotulo: 'Frota-sombra (dark shipping)', negabilidade: 'alta' },
  milicia_maritima:    { rotulo: 'Milícia marítima',             negabilidade: 'alta' },
  sabotagem_submarina: { rotulo: 'Sabotagem submarina',          negabilidade: 'muito_alta' },
  usv_uav:             { rotulo: 'USV/UAV anônimos',             negabilidade: 'alta' },
  gnss:                { rotulo: 'Interferência GNSS',           negabilidade: 'media' },
  ciber:               { rotulo: 'Ciberataque a terminais/portos', negabilidade: 'media' },
  minagem:             { rotulo: 'Minagem encoberta',            negabilidade: 'alta' },
  lawfare:             { rotulo: 'Lawfare e narrativas',         negabilidade: null },
};

// Fatores de capacidade da variante (Desenho §2) — o mapeamento para a OOB é
// da SM-6; aqui o configurador só os valida e registra (−1/+1).
const FATORES_SM = ['A_MPA', 'B_NPaOc', 'C_Fusao', 'D_USV', 'E_GVI'];

// Dificuldade como névoa de atribuição (§8.2, Tabela 8.1). Não altera a
// física: só o ritmo de evidência (atribuição), o que o Azul vê da intenção
// e dos meios do híbrido, e a adaptação do adversário (respostas repetidas
// rendem menos evidência).
//   ritmo                multiplicador do ganho de evidência (SM-1)
//   intencaoAPartirDe    atribuição a partir da qual a intenção do híbrido aparece
//   ocultacaoAteContato  meios do híbrido fora do quadro até um encontro efetivo
//   adaptacao            { fator, piso }: ritmo × fator^(repetições), ≥ piso
// TODO: validar com especialista
const DIFICULDADES = {
  basico:        { rotulo: 'Básico',        ritmo: 1.5, intencaoAPartirDe: 0,  ocultacaoAteContato: false, adaptacao: null },
  intermediario: { rotulo: 'Intermediário', ritmo: 1.0, intencaoAPartirDe: 40, ocultacaoAteContato: false, adaptacao: null },
  avancado:      { rotulo: 'Avançado',      ritmo: 0.6, intencaoAPartirDe: 70, ocultacaoAteContato: true,
                   adaptacao: { fator: 0.85, piso: 0.4 } },
};

// Repertório de crises (Tabela 8.2). Por tipo: trilha; marcos de Detecção e
// de Resposta com prazo ideal (nota 1) e prazo máximo (nota 0), em turnos
// contados do início do episódio; efeito que o episódio injeta.
// TODO: validar com especialista
const CRISES = {
  crimes_ilicitos: { rotulo: 'Crimes e ilícitos no mar',            trilha: 'constabular',
                     deteccao: { ideal: 1, max: 3 }, resposta: { ideal: 2, max: 5 },
                     efeito: { ocorrencias: { tipo: 'narcotrafico', n: 3 } } },
  sabotagem_ic:    { rotulo: 'Sabotagem de infraestrutura crítica', trilha: 'defesa',
                     deteccao: { ideal: 1, max: 4 }, resposta: { ideal: 2, max: 6 },
                     efeito: { hibrido: { tipo: 'dano_infra', atribuicao: 20 } } },
  pesca_massa:     { rotulo: 'Pesca ilegal em massa',               trilha: 'constabular',
                     deteccao: { ideal: 1, max: 3 }, resposta: { ideal: 3, max: 6 },
                     efeito: { ocorrencias: { tipo: 'pesca_iuu', n: 8 } } },
  sar:             { rotulo: 'Salvaguarda da vida humana no mar (SAR)', trilha: 'constabular',
                     deteccao: { ideal: 0, max: 2 }, resposta: { ideal: 1, max: 3 },
                     efeito: { sar: { pessoas: 30 } } },
  desastre:        { rotulo: 'Resposta a desastres',                trilha: 'constabular',
                     deteccao: { ideal: 1, max: 3 }, resposta: { ideal: 2, max: 5 },
                     efeito: { desastre: { escala: 1 } } },
};
const N_CRISES = { min: 2, max: 3 };
const SAL_CRISES = 0x27D4EB2F;

// Parâmetros que a Célula Branca pode ajustar durante o exercício (§8.5).
const AJUSTAVEIS_CELULA_BRANCA = ['intensidadeHibrida', 'areaAlvoHibrida', 'mostrarNumeros', 'dificuldade'];

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
  AREAS_DN, DIST_MAX_COSTA, TIPOS_OCORRENCIA, TETO_CONSTABULAR, ACOPLAMENTO, SAL_CONSTAB,
  ESTACOES, MODALIDADES, FONTES, TETO_FUSAO_SEM_C, APOIOS, SAL_APOIO,
  DURACAO_DIAS, VETORES_HIBRIDOS, FATORES_SM, DIFICULDADES, CRISES, N_CRISES, SAL_CRISES,
  AJUSTAVEIS_CELULA_BRANCA,
};

module.exports = { PARAMS, ...PARAMS };
