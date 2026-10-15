'use strict';

/**
 * questionario_profissional.js — Questionário de validação de face em
 * linguagem profissional militar (SM-11), com o rastreamento para os
 * parâmetros do modelo.
 *
 * O respondente vê perguntas sobre desempenho de meios, incidência de
 * ilícitos, prazos de interagências, critérios de escalada, opinião pública
 * etc., em unidades do ofício (%, dias, ocorrências por mês, escala 0–10).
 * Cada item carrega, fora da vista do respondente, o rastreamento:
 *   alvo      caminho(s) do parâmetro em params.js;
 *   conv      regra de conversão resposta → parâmetro (CONVERSOES);
 * e a "hipótese do modelo" que o questionário mostra é o valor atual do
 * parâmetro convertido de volta para a unidade profissional.
 *
 * Os parâmetros que não são matéria de conhecimento profissional (níveis de
 * dificuldade do jogo, tetos técnicos) ficam em DECISOES_PROJETO, com o motivo.
 */

const { PARAMS: P } = require('./params');
const OB = require('./oob_sm');
const SO = require('./sobrescrita');

// ─── Conversões ───────────────────────────────────────────────────────────────

const arred = r => Math.round(Number(r));
const CONVERSOES = {
  percentual:  { unidade: '%', regra: 'parâmetro = resposta ÷ 100', para: r => r / 100, de: v => v * 100 },
  por_mes:     { unidade: 'por mês', regra: 'parâmetro (por turno de 24 h) = resposta ÷ 30', para: r => r / 30, de: v => v * 30 },
  dias:        { unidade: 'dias', regra: 'parâmetro (turnos de 24 h) = resposta, arredondada', para: arred, de: v => v },
  horas:       { unidade: 'horas', regra: 'parâmetro (turnos de 24 h) = resposta ÷ 24, arredondada', para: r => Math.round(r / 24), de: v => v * 24 },
  inteiro:     { unidade: 'quantidade', regra: 'parâmetro = resposta, arredondada', para: arred, de: v => v },
  pontos:      { unidade: 'pontos', regra: 'parâmetro = resposta', para: r => r, de: v => v },
  escala10:    { unidade: '0 a 10', regra: 'parâmetro = resposta ÷ 10', para: r => r / 10, de: v => v * 10 },
  ganho:       { unidade: '% de ganho', regra: 'multiplicador = 1 + resposta ÷ 100', para: r => 1 + r / 100, de: v => (v - 1) * 100 },
  prob_mensal: { unidade: '% em um mês', regra: 'probabilidade por turno = 1 − (1 − resposta ÷ 100)^(1/30)',
                 para: r => 1 - Math.pow(1 - r / 100, 1 / 30), de: v => 100 * (1 - Math.pow(1 - v, 30)) },
  meia_vida:   { unidade: 'dias', regra: 'fração recuperada por turno = 1 − 0,5^(1/resposta)',
                 para: d => 1 - Math.pow(0.5, 1 / d), de: v => Math.log(0.5) / Math.log(1 - v) },
  categoria:   { unidade: 'escolha', regra: 'opção escolhida → valor da tabela de opções' },
  normalizado: { unidade: '% do total', regra: 'participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo' },
  diferenca:   { unidade: '%', regra: 'parâmetro = (resposta − resposta da linha de referência) ÷ 100' },
  reducao:     { unidade: '%', regra: 'parâmetro = (resposta da linha de referência − resposta) ÷ 100' },
  formula:     { unidade: '', regra: 'fórmula própria do item (ver "regra" do item)' },
  manual:      { unidade: 'texto', regra: 'sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita' },
};

const ler = (params, c) => SO.ler(params, c);
const alvos = l => (Array.isArray(l.alvo) ? l.alvo : l.alvo ? [l.alvo] : []);

// ─── Rótulos profissionais ───────────────────────────────────────────────────

const ETAPA = {
  deteccao: 'Detecção do contato', identificacao: 'Identificação / classificação', interrogacao: 'Interrogação (rádio ou visual)',
  abordagem: 'Abordagem e visita', inspecao: 'Inspeção', apresamento: 'Apresamento e condução ao porto',
};
const OPC_ETAPA = { 'interrogação': 'interrogacao', 'identificação': 'identificacao', 'abordagem': 'abordagem', 'inspeção': 'inspecao', 'apresamento': 'apresamento' };
const AREA = { '2DN': '2º DN (BA–SE)', '1DN': '1º DN (RJ–ES)', '8DN': '8º DN (SP)', '5DN': '5º DN (SC–RS)' };
const POSTURA = ['Rotina', 'Tensão', 'Crise', 'Conflito'];
const VETOR = {
  frota_sombra: 'Frota-sombra (transponder desligado, bandeira de conveniência)',
  milicia_maritima: 'Milícia marítima (pesqueiros a serviço de outro Estado)',
  sabotagem_submarina: 'Sabotagem de cabos e dutos submarinos',
  usv_uav: 'Drones de superfície ou aéreos sem identificação',
  gnss: 'Interferência em navegação por satélite (GNSS)',
  ciber: 'Ataque cibernético a terminais e portos',
  minagem: 'Minagem encoberta',
};
const MEIO = {
  patrulha_oc: 'Navio-patrulha oceânico (Cl. Amazonas)', patrulha_c: 'Navio-patrulha costeiro (Cl. Grajaú, Macaé, Bracuí)',
  fragata: 'Fragata', corveta: 'Corveta', destroier: 'Contratorpedeiro', amphib: 'Navio anfíbio / doca multipropósito',
  carrier: 'Navio-aeródromo / porta-helicópteros', patrulha: 'Aeronave de patrulha marítima (P-3AM)', helicoptero: 'Helicóptero embarcado',
  aew: 'Aeronave de alarme aéreo antecipado', submarino: 'Submarino convencional', sub_nuclear: 'Submarino de propulsão nuclear',
  specops: 'Grupamento de operações especiais', logistico: 'Navio de apoio logístico', tanque: 'Navio-tanque',
  inspecao_naval: 'Lancha / aviso de inspeção naval (DN)', mcm: 'Navio de contramedidas de minagem', usv: 'Veículo de superfície não tripulado (USV)',
  uav: 'Aeronave remotamente pilotada (UAV)', rov: 'Veículo submarino remotamente operado (ROV)',
};

// ─── Construtores ─────────────────────────────────────────────────────────────

let seq = 0;
const q = (id, tema, titulo, pergunta, linhas, extra = {}) => ({ id, tema, titulo, pergunta, linhas, ...extra });
const L = (item, alvo, conv, extra = {}) => ({ item, alvo, conv, ...extra });

// Escala de gravidade (desgaste político): 10 pontos = abordagem de um navio
// suspeito sem indícios suficientes. Custo do modelo dessa situação =
// PESO_POLITICO.abordagem × (LIMIAR_ATRIBUICAO.abordagem ÷ 100).
const unidadeGravidade = p => p.PESO_POLITICO.abordagem * p.LIMIAR_ATRIBUICAO.abordagem / 100 / 10;  // custo por ponto
const grav = (item, alvo, emCusto, deCusto, regra) =>
  L(item, alvo, 'formula', { unidade: 'pontos (abordagem sem indícios = 10)', regra,
    de: (v, p) => emCusto(v, p) / unidadeGravidade(p), para: (r, p) => deCusto(r * unidadeGravidade(p), p) });

function questoes(p = P) {
  const Q = [];
  const T = {};
  const tema = (t) => (T[t] = t);

  // A. Consciência situacional marítima
  tema('Consciência situacional marítima');
  Q.push(q('A1', T['Consciência situacional marítima'], 'Contribuição das fontes de dados',
    'Para formar o quadro de superfície de uma área de Distrito Naval, qual a participação relativa de cada fonte? Distribua 100% entre elas.',
    Object.keys(p.FONTES).map(f => L(p.FONTES[f].rotulo, `FONTES.${f}.peso`, 'normalizado', { grupo: 'fontes' }))));
  Q.push(q('A2', T['Consciência situacional marítima'], 'Confiabilidade de cada fonte',
    'Quando um contato é reportado por uma única fonte, sem confirmação de outra, em que fração dos casos o reporte se confirma?',
    Object.keys(p.FONTES).map(f => L(p.FONTES[f].rotulo, `FONTES.${f}.confiabilidade`, 'percentual'))));
  Q.push(q('A3', T['Consciência situacional marítima'], 'Atraso de cada fonte',
    'Quanto tempo, tipicamente, entre o fato no mar e a informação estar disponível ao centro de operações?',
    Object.keys(p.FONTES).map(f => L(p.FONTES[f].rotulo, `FONTES.${f}.latencia`, 'horas', { unidade: 'horas (até 12 h = imediato)' }))));
  Q.push(q('A4', T['Consciência situacional marítima'], 'Valor do sistema integrado de gerenciamento',
    'Sem um sistema integrado de gerenciamento da Amazônia Azul (fusão das fontes num único quadro), que fração da consciência situacional plena se consegue obter só com as fontes isoladas?',
    [L('Consciência situacional sem o sistema integrado', 'TETO_FUSAO_SEM_C', 'percentual')]));
  Q.push(q('A5', T['Consciência situacional marítima'], 'Entrada de um contato suspeito no quadro',
    'Uma embarcação suspeita opera em uma área de Distrito Naval. Qual a chance de ela aparecer no quadro do centro de operações dentro de 24 horas?',
    [L('Com integração mínima das fontes', 'DOUTRINA.quadro.base', 'percentual', { id: 'A5.1' }),
     L('Com integração plena das fontes', 'DOUTRINA.quadro.porFusao', 'diferenca', { ref: 'A5.1' }),
     L('Acréscimo, em pontos percentuais, quando há veículos não tripulados (USV/UAV) na área', 'DOUTRINA.quadro.bonusUsv', 'percentual', { unidade: 'pontos percentuais' }),
     L('Redução, em %, quando a embarcação procura ativamente não ser detectada (transponder desligado, ocultação)', 'DOUTRINA.quadro.pesoEvasao', 'percentual',
       { regra: 'parâmetro = resposta ÷ 100; o modelo multiplica pela evasão de cada ameaça (questão F2)' })]));

  // B. Desempenho dos meios no ciclo de abordagem
  tema('Desempenho dos meios');
  Q.push(q('B1', 'Desempenho dos meios', 'Êxito em cada fase da ação',
    'Considere um navio-patrulha oceânico bem guarnecido, contra um contato que não tenta se evadir e com o quadro integrado funcionando plenamente. Em cada fase, em quantas de cada 100 tentativas há êxito?',
    Object.keys(ETAPA).map(e => L(ETAPA[e], `P_BASE.${e}`, 'percentual'))));
  Q.push(q('B2', 'Desempenho dos meios', 'Efeito da falta de quadro integrado',
    'Nas mesmas condições, mas sem o quadro integrado (o navio depende só dos próprios sensores e da sua guarnição), a chance de êxito em cada fase cai para que fração da anterior?',
    Object.keys(ETAPA).map(e => L(ETAPA[e], `PISO_FUSAO.${e}`, 'percentual', { unidade: '% do valor da questão B1' }))));
  Q.push(q('B3', 'Desempenho dos meios', 'Capacidade de vigilância de cada meio',
    'Em uma escala de 0 (incapaz) a 10 (o melhor meio disponível), qual a capacidade de cada meio para vigiar, detectar e classificar contatos de superfície?',
    Object.keys(p.CAPACIDADE_POR_TIPO).map(t => L(MEIO[t] ?? t, `CAPACIDADE_POR_TIPO.${t}.sensor`, 'escala10'))));
  Q.push(q('B4', 'Desempenho dos meios', 'Capacidade de visita e inspeção de cada meio',
    'Na mesma escala, qual a capacidade de cada meio para conduzir abordagem, visita, inspeção e apresamento?',
    Object.keys(p.CAPACIDADE_POR_TIPO).map(t => L(MEIO[t] ?? t, `CAPACIDADE_POR_TIPO.${t}.gvi`, 'escala10'))));
  Q.push(q('B5', 'Desempenho dos meios', 'Grupo de Visita e Inspeção de Fuzileiros Navais',
    'Sem um grupo de Fuzileiros Navais embarcado para visita e inspeção, a capacidade de abordagem dos navios do Distrito cai para que fração?',
    [L('Capacidade de abordagem sem o grupo embarcado', 'FATOR_SEM_GVI', 'percentual', { unidade: '% da capacidade com o grupo' })]));

  // C. Autoria e convicção
  tema('Autoria e convicção');
  Q.push(q('C1', 'Autoria e convicção', 'O quanto cada fase esclarece a autoria',
    'Diante de um incidente de autoria incerta, que parte da dúvida remanescente sobre quem está por trás cada fase bem-sucedida costuma eliminar?',
    Object.keys(ETAPA).map(e => L(ETAPA[e], `GANHO_EVIDENCIA.${e}`, 'percentual', { unidade: '% da dúvida remanescente' }))));
  Q.push(q('C2', 'Autoria e convicção', 'Dificuldade de atribuição por tipo de ameaça',
    'Em comparação com um ilícito comum (autor sem interesse em negar), quanto as mesmas ações rendem em esclarecimento da autoria quando o autor procura negar o vínculo?',
    [L('Ilícito comum (referência)', 'FATOR_NEGABILIDADE.baixa', 'percentual', { unidade: '% do esclarecimento de um ilícito comum' }),
     L('Interferência em GNSS, ataque cibernético', 'FATOR_NEGABILIDADE.media', 'percentual', { unidade: '% do esclarecimento de um ilícito comum' }),
     L('Frota-sombra, milícia marítima, drones, minagem', 'FATOR_NEGABILIDADE.alta', 'percentual', { unidade: '% do esclarecimento de um ilícito comum' }),
     L('Sabotagem de cabos e dutos submarinos', 'FATOR_NEGABILIDADE.muito_alta', 'percentual', { unidade: '% do esclarecimento de um ilícito comum' })]));
  Q.push(q('C3', 'Autoria e convicção', 'Investigação sem o quadro integrado',
    'Sem o quadro integrado, as ações de esclarecimento de autoria rendem que fração do que rendem com ele?',
    [L('Rendimento da investigação sem o quadro integrado', 'PISO_FUSAO_EVIDENCIA', 'percentual', { unidade: '% do rendimento com o quadro' })]));
  Q.push(q('C4', 'Autoria e convicção', 'Convicção mínima para agir',
    'Em uma escala de 0% (nenhum indício) a 100% (prova cabal) de convicção sobre o envolvimento do contato, a partir de que grau cada ação é tecnicamente fundamentada?',
    ['interrogacao', 'abordagem', 'inspecao', 'apresamento'].map(e => L(ETAPA[e], `LIMIAR_ATRIBUICAO.${e}`, 'pontos', { unidade: '% de convicção' }))));
  Q.push(q('C5', 'Autoria e convicção', 'O que é uma atribuição "robusta"',
    'Que grau de convicção sobre a autoria (0–100%) é necessário para cada decisão? Se, na sua avaliação, os três critérios deveriam ser o mesmo, indique o mesmo valor.',
    [L('Elevar a postura a Crise após dano a infraestrutura crítica', 'GATILHOS_ESCALADA.N2.atribuicaoMin', 'pontos', { unidade: '% de convicção' }),
     L('Propor o emprego aberto da força (Conflito) após ataque armado', 'GATILHOS_ESCALADA.N3.atribuicaoMin', 'pontos', { unidade: '% de convicção' }),
     L('Dar por concluída uma investigação de autoria', 'HIBRIDO.investigacao.robusta', 'pontos', { unidade: '% de convicção' })]));
  Q.push(q('C6', 'Autoria e convicção', 'Investigação depois do fato',
    'Depois de um ataque consumado e conhecido (perícia, cooperação de inteligência), partindo de indícios fracos:',
    [L('Em quantos dias uma investigação típica chega à convicção robusta?', 'HIBRIDO.investigacao.ganho', 'formula', {
       unidade: 'dias', regra: 'ganho diário g tal que, partindo de 10% de convicção, a convicção robusta R (C5) seja atingida em d dias: g = 1 − ((1 − R/100) ÷ 0,9)^(1/d)',
       de: (v, pp) => Math.log((1 - pp.HIBRIDO.investigacao.robusta / 100) / 0.9) / Math.log(1 - v),
       para: (d, pp) => 1 - Math.pow((1 - pp.HIBRIDO.investigacao.robusta / 100) / 0.9, 1 / d) }),
     L('Por quantos dias a investigação costuma ser mantida antes de ser arquivada sem conclusão?', 'HIBRIDO.investigacao.turnos', 'dias')]));

  // D. Escalada
  Q.push(q('D1', 'Postura e escalada', 'Passagem de Rotina a Tensão',
    'Que padrão de incidentes justifica elevar a postura de Rotina para Tensão?',
    [L('Número de incidentes de natureza híbrida…', 'GATILHOS_ESCALADA.N1.incidentesJanela', 'inteiro', { unidade: 'incidentes' }),
     L('…dentro de quantos dias', 'GATILHOS_ESCALADA.N1.janelaTurnos', 'dias'),
     L('Ou um único incidente com convicção sobre a autoria de pelo menos', 'GATILHOS_ESCALADA.N1.atribuicaoMin', 'pontos', { unidade: '% de convicção' })]));
  Q.push(q('D2', 'Postura e escalada', 'Retorno à postura anterior',
    'Quantos dias sem novos fatos que justifiquem a postura atual são necessários para propor o retorno à postura anterior?',
    [L('Dias sem novos gatilhos', 'TURNOS_PARA_DESESCALAR', 'dias')]));

  // E. Ilícitos no mar
  const tipos = Object.keys(p.TIPOS_OCORRENCIA);
  Q.push(q('E1', 'Ilícitos no mar', 'Incidência mensal por área',
    'Em um mês típico, quantas ocorrências de cada tipo, que justificariam o emprego de um meio naval, surgem em cada área de Distrito Naval?',
    tipos.flatMap(t => Object.keys(p.TIPOS_OCORRENCIA[t].lambda).map(a =>
      L(`${p.TIPOS_OCORRENCIA[t].rotulo} — ${AREA[a] ?? a}`, `TIPOS_OCORRENCIA.${t}.lambda.${a}`, 'por_mes', { unidade: 'ocorrências por mês' })))));
  Q.push(q('E2', 'Ilícitos no mar', 'Janela de oportunidade',
    'Por quantos dias, em média, a embarcação envolvida permanece ao alcance de uma interceptação antes de sair da área ou concluir o ilícito?',
    tipos.map(t => L(p.TIPOS_OCORRENCIA[t].rotulo, `TIPOS_OCORRENCIA.${t}.duracao`, 'dias'))));
  Q.push(q('E3', 'Ilícitos no mar', 'Dificuldade de detecção',
    'Quanto as práticas de ocultação de cada tipo de ilícito reduzem a chance de detecção e identificação, em relação a um contato que não se oculta?',
    tipos.map(t => L(p.TIPOS_OCORRENCIA[t].rotulo, `TIPOS_OCORRENCIA.${t}.evasao`, 'percentual', { unidade: '% de redução' }))));
  Q.push(q('E4', 'Ilícitos no mar', 'Quando a repressão se efetiva',
    'Em que fase da ação a ocorrência pode ser considerada reprimida?',
    tipos.map(t => L(p.TIPOS_OCORRENCIA[t].rotulo, `TIPOS_OCORRENCIA.${t}.etapaRepressao`, 'categoria', { opcoes: OPC_ETAPA }))));
  Q.push(q('E5', 'Ilícitos no mar', 'Ilícitos como instrumento de um ator estatal',
    'Um ator estatal pode estimular ilícitos no mar para saturar os meios de patrulha, ou usá-los como cobertura para ações hostis.',
    [...tipos.map(t => L(`Interesse do ator em explorar: ${p.TIPOS_OCORRENCIA[t].rotulo} (0 = nenhum, 3 = muito)`, `TIPOS_OCORRENCIA.${t}.exploravel`, 'inteiro', { unidade: '0 a 3' })),
     L('Ocorrências adicionais por mês, em campanha de intensidade máxima, nas áreas fora do esforço principal do ator', 'ACOPLAMENTO.lambdaSaturacaoMax', 'por_mes', { unidade: 'ocorrências por mês' }),
     L('Fração das ocorrências rotineiras que serviriam de cobertura, em campanha de intensidade máxima', 'ACOPLAMENTO.pCoberturaMax', 'percentual'),
     L('Fase da ação em que o vínculo de uma ocorrência de cobertura com o ator viria à tona', 'ACOPLAMENTO.etapaRevelaVinculo', 'categoria', { opcoes: OPC_ETAPA })]));

  // F. Ameaça híbrida
  const vet = Object.keys(VETOR).filter(v => p.HIBRIDO.vetores[v]);
  const vetMar = vet.filter(v => p.HIBRIDO.vetores[v].maritimo);
  Q.push(q('F1', 'Ameaça híbrida', 'Ritmo da campanha',
    'Em uma campanha híbrida de intensidade máxima contra a infraestrutura marítima brasileira:',
    [L('Quantas ações hostis por mês?', 'HIBRIDO.acoesPorTurno', 'por_mes', { unidade: 'ações por mês' }),
     L('Que fração delas concentrada na área de esforço principal?', 'HIBRIDO.pAreaAlvo', 'percentual'),
     L('Com a postura já em Crise, qual a chance, em um mês, de o ator passar ao emprego aberto de meios?', 'HIBRIDO.empregoAberto.pPorTurno', 'prob_mensal')]));
  Q.push(q('F2', 'Ameaça híbrida', 'Frequência relativa dos modos de ação',
    'Distribua 100% entre os modos de ação, segundo a frequência com que o ator os empregaria.',
    vet.map(v => L(VETOR[v], `HIBRIDO.vetores.${v}.peso`, 'normalizado', { grupo: 'vetores' }))));
  Q.push(q('F3', 'Ameaça híbrida', 'Prazo até o efeito',
    'Entre o início da ação (presença na área) e o dano consumado, quantos dias decorrem?',
    vetMar.map(v => L(VETOR[v], `HIBRIDO.vetores.${v}.janela`, 'dias'))));
  Q.push(q('F4', 'Ameaça híbrida', 'Gravidade do dano',
    'Que gravidade de dano cada modo de ação causa ao alvo (porto, plataforma, cabo ou duto)?',
    vet.map(v => L(VETOR[v], `HIBRIDO.vetores.${v}.dano`, 'categoria', { opcoes: { leve: 1, moderado: 2, grave: 3 } }))));
  Q.push(q('F5', 'Ameaça híbrida', 'Dificuldade de detecção',
    'Quanto as práticas de ocultação de cada modo de ação reduzem a chance de detecção e identificação?',
    vetMar.map(v => L(VETOR[v], `HIBRIDO.vetores.${v}.evasao`, 'percentual', { unidade: '% de redução' }))));
  Q.push(q('F6', 'Ameaça híbrida', 'Fase da ação que frustra a ameaça',
    'Até que fase a ação de um meio naval precisa chegar para frustrar cada modo de ação?',
    vetMar.map(v => L(VETOR[v], `HIBRIDO.vetores.${v}.etapaNeutraliza`, 'categoria', { opcoes: OPC_ETAPA }))));
  Q.push(q('F7', 'Ameaça híbrida', 'Ataque cibernético a portos',
    'Qual a chance de um ataque cibernético a um terminal portuário causar dano efetivo?',
    [L('Sem defesa cibernética integrada ao quadro', 'HIBRIDO.ciber.pDano', 'percentual', { id: 'F7.1' }),
     L('Com defesa integrada plena', 'HIBRIDO.ciber.reducaoPorFusao', 'reducao', { ref: 'F7.1' }),
     L('Convicção inicial sobre a autoria logo após o ataque', 'HIBRIDO.ciber.atribuicao', 'pontos', { unidade: '% de convicção' })]));
  Q.push(q('F8', 'Ameaça híbrida', 'Desinformação',
    'Sobre a desinformação contra a atuação da Marinha:',
    [L('Sem um fato real a explorar, a cada quantos dias surge uma campanha fabricada?', 'HIBRIDO.fabricarACada', 'dias'),
     L('Uma campanha fabricada tem que fração do efeito de uma que explora um fato real?', 'HIBRIDO.intensidadeFabricacao', 'percentual')]));

  // G. Apoio interagências
  const ap = Object.keys(p.APOIOS);
  Q.push(q('G1', 'Apoio interagências', 'Prazos e disponibilidade',
    'Para cada órgão, quando solicitado pelo comando operacional:',
    ap.flatMap(a => [
      L(`${p.APOIOS[a].rotulo}: dias até o apoio estar em ação`, `APOIOS.${a}.prazo`, 'dias'),
      L(`${p.APOIOS[a].rotulo}: dias de permanência do apoio`, `APOIOS.${a}.duracao`, 'dias'),
      L(`${p.APOIOS[a].rotulo}: em que fração das solicitações o apoio é concedido`, `APOIOS.${a}.disponibilidade`, 'percentual'),
    ])));
  Q.push(q('G2', 'Apoio interagências', 'Efeito do apoio',
    'Quando o apoio está presente, quanto ele melhora a ação naval no seu campo de atuação?',
    ap.flatMap(a => {
      const A = p.APOIOS[a], r = A.rotulo;
      return [
        ...(A.fatorCapacidade != null ? [L(`${r}: ganho de efetividade da ação de repressão`, `APOIOS.${a}.fatorCapacidade`, 'ganho')] : []),
        ...(A.bonusFusao != null ? [L(`${r}: acréscimo na qualidade do quadro (pontos percentuais)`, `APOIOS.${a}.bonusFusao`, 'percentual', { unidade: 'pontos percentuais' })] : []),
        ...(A.fatorRitmo != null ? [L(`${r}: aceleração do esclarecimento de autoria`, `APOIOS.${a}.fatorRitmo`, 'ganho')] : []),
      ];
    })));

  // H. Prontidão
  Q.push(q('H1', 'Prontidão', 'Tempo de resposta por escalão',
    'Entre a ordem de acionamento e o início do movimento, quantos dias decorrem em cada escalão de prontidão?',
    Object.keys(p.PRONTIDAO).map(e => L(p.PRONTIDAO[e].rotulo, `PRONTIDAO.${e}.atraso`, 'dias'))));
  Q.push(q('H2', 'Prontidão', 'Meios em cada escalão',
    'Quantos meios cada comando mantém em cada escalão de prontidão?',
    Object.keys(p.PRONTIDAO).filter(e => p.PRONTIDAO[e].porEstacao).flatMap(e => [
      L(`${p.PRONTIDAO[e].rotulo} — Comando-em-Chefe da Esquadra`, `PRONTIDAO.${e}.porEstacao.ComemCh`, 'inteiro', { unidade: 'meios' }),
      L(`${p.PRONTIDAO[e].rotulo} — cada Distrito Naval`, `PRONTIDAO.${e}.porEstacao.DN`, 'inteiro', { unidade: 'meios' }),
    ])));

  // I. Opinião pública e desgaste político
  const I = p.INFOCOG;
  Q.push(q('I1', 'Opinião pública e desgaste político', 'Apoio da sociedade',
    'Sobre o apoio da opinião pública à atuação da Marinha na segurança marítima (0–100%):',
    [L('Apoio no início de um período de tensão', 'INFOCOG.apoioInicial', 'pontos', { unidade: '%' }),
     L('Patamar habitual para o qual o apoio tende sem novos fatos', 'INFOCOG.apoioReferencia', 'pontos', { unidade: '%' }),
     L('Em quantos dias, sem novos fatos, o apoio recupera metade da distância até o patamar habitual', 'INFOCOG.retornoPorTurno', 'meia_vida'),
     L('Abaixo de que apoio as regras de engajamento tendem a ser restringidas', 'INFOCOG.faixasRoe.estreita', 'pontos', { unidade: '%' }),
     L('Acima de que apoio as regras de engajamento tendem a ser ampliadas', 'INFOCOG.faixasRoe.amplia', 'pontos', { unidade: '%' })]));
  Q.push(q('I2', 'Opinião pública e desgaste político', 'Efeito de fatos no mar sobre o apoio',
    'Quantos pontos percentuais de apoio público cada fato costuma somar (+) ou tirar (−)?',
    Object.entries({ reprimida: 'Ilícito reprimido e divulgado', sar_sucesso: 'Salvamento bem-sucedido', sar_falha: 'Salvamento malsucedido, com vítimas',
      dano_infra: 'Dano a infraestrutura crítica', incidente_nao_respondido: 'Incidente sem resposta visível', dano_terceiros: 'Danos a terceiros por ação da Marinha',
      dano_ambiental: 'Dano ambiental por ação militar' })
      .filter(([k]) => I.eventosMar[k] != null).map(([k, r]) => L(r, `INFOCOG.eventosMar.${k}`, 'pontos', { unidade: 'pontos percentuais' }))));
  Q.push(q('I3', 'Opinião pública e desgaste político', 'Desinformação e comunicação',
    'Sobre a disputa de narrativas:',
    [L('Pontos de apoio perdidos com uma campanha de desinformação de intensidade máxima', 'INFOCOG.desinformacao.base', 'pontos', { unidade: 'pontos percentuais' }),
     L('Quanto a mais rende a desinformação quando explora um erro real da Marinha', 'INFOCOG.desinformacao.gatilhoReal', 'ganho'),
     ...Object.entries(I.campanhas).filter(([, c]) => c.ganho > 0).map(([k, c]) => L(`Pontos de apoio recuperados por: ${c.rotulo.toLowerCase()}`, `INFOCOG.campanhas.${k}.ganho`, 'pontos', { unidade: 'pontos percentuais' })),
     L('Quanto do efeito da desinformação a comunicação preventiva (prebunking) neutraliza', 'INFOCOG.campanhas.prebunking.protecao', 'percentual'),
     L('Por quantos dias dura a proteção da comunicação preventiva', 'INFOCOG.campanhas.prebunking.duracao', 'dias')]));
  Q.push(q('I4', 'Opinião pública e desgaste político', 'Gravidade relativa de erros e excessos',
    'Atribua a cada situação um grau de desgaste político, tomando como referência: abordar um navio suspeito sem indícios suficientes = 10 pontos.',
    [grav('Interrogar um navio sem indícios', 'PESO_POLITICO.interrogacao',
       (v, pp) => v * pp.LIMIAR_ATRIBUICAO.interrogacao / 100, (c, pp) => c / (pp.LIMIAR_ATRIBUICAO.interrogacao / 100),
       'peso = pontos × u ÷ (convicção mínima da interrogação ÷ 100), com u = custo de 1 ponto (abordagem sem indícios ÷ 10)'),
     grav('Inspecionar a carga sem indícios suficientes', 'PESO_POLITICO.inspecao',
       (v, pp) => v * pp.LIMIAR_ATRIBUICAO.inspecao / 100, (c, pp) => c / (pp.LIMIAR_ATRIBUICAO.inspecao / 100),
       'peso = pontos × u ÷ (convicção mínima da inspeção ÷ 100)'),
     grav('Apresar sem prova', 'PESO_POLITICO.apresamento',
       (v, pp) => v * pp.LIMIAR_ATRIBUICAO.apresamento / 100, (c, pp) => c / (pp.LIMIAR_ATRIBUICAO.apresamento / 100),
       'peso = pontos × u ÷ (convicção mínima do apresamento ÷ 100)'),
     grav('Interromper desnecessariamente a navegação de um navio mercante', 'TERCEIROS.interrupcao.excesso',
       (v, pp) => v * pp.INFOCOG.custo.pesoExcesso, (c, pp) => c / pp.INFOCOG.custo.pesoExcesso,
       'unidades de excesso = pontos × u ÷ peso do excesso'),
     grav('Usar força desnecessária contra um mercante ou pesqueiro (sem vítimas)', 'TERCEIROS.forcaDesnecessaria.excesso',
       (v, pp) => v * pp.INFOCOG.custo.pesoExcesso, (c, pp) => c / pp.INFOCOG.custo.pesoExcesso,
       'unidades de excesso = pontos × u ÷ peso do excesso'),
     grav('Causar danos a terceiros (lesões, avarias)', 'INFOCOG.custo.pesoDanos',
       v => v, c => c, 'peso dos danos = pontos × u'),
     grav('Causar dano ambiental em ação militar', 'TERCEIROS.ambiental.danos',
       (v, pp) => v * pp.INFOCOG.custo.pesoDanos, (c, pp) => c / pp.INFOCOG.custo.pesoDanos,
       'unidades de dano = pontos × u ÷ peso dos danos'),
     grav('Desgaste acumulado a partir do qual a operação perde sustentação política', 'INFOCOG.tetoCustoPolitico',
       v => v, c => c, 'teto = pontos × u')]));
  Q.push(q('I5', 'Opinião pública e desgaste político', 'Desgaste e opinião pública',
    'Sobre a relação entre desgaste político e apoio público:',
    [L('Pontos de apoio perdidos por um episódio de abordagem sem indícios', 'INFOCOG.apoioPorCusto', 'formula', {
       unidade: 'pontos percentuais', regra: 'apoio perdido por unidade de custo = resposta ÷ (custo da abordagem sem indícios)',
       de: (v, pp) => v * 10 * unidadeGravidade(pp), para: (r, pp) => r / (10 * unidadeGravidade(pp)) }),
     L('Com o apoio público em 30%, quanto mais pesa o mesmo erro do que com o apoio no patamar habitual', 'INFOCOG.custo.modulacao', 'formula', {
       unidade: '% a mais', regra: 'multiplicador = 1 + modulação × (patamar − 30) ÷ patamar; modulação = (resposta ÷ 100) × patamar ÷ (patamar − 30)',
       de: (v, pp) => 100 * v * (pp.INFOCOG.apoioReferencia - 30) / pp.INFOCOG.apoioReferencia,
       para: (r, pp) => (r / 100) * pp.INFOCOG.apoioReferencia / (pp.INFOCOG.apoioReferencia - 30) })]));

  // J. Terceiros
  const TE = p.TERCEIROS;
  Q.push(q('J1', 'Embarcações inocentes e danos a terceiros', 'Falsos alarmes',
    'Embarcações em atividade legal são, às vezes, tomadas por suspeitas. Em cada área de Distrito Naval:',
    [L('Quantas por mês, com integração mínima do quadro?', 'TERCEIROS.falsosAlarmes.lambda', 'por_mes', { id: 'J1.1', unidade: 'embarcações por mês' }),
     L('Quantas por mês, com integração plena do quadro?', 'TERCEIROS.falsosAlarmes.reducaoPorFusao', 'formula', {
       ref: 'J1.1', unidade: 'embarcações por mês', regra: 'redução = 1 − (resposta ÷ resposta da linha J1.1)',
       de: (v, pp) => 30 * pp.TERCEIROS.falsosAlarmes.lambda * (1 - v),
       para: (r, pp, refResp) => 1 - r / (refResp ?? 30 * pp.TERCEIROS.falsosAlarmes.lambda) }),
     ...Object.entries(TE.falsosAlarmes.tipos).map(([k, x]) => L(`Fração que são: ${x.rotulo.toLowerCase()}`, `TERCEIROS.falsosAlarmes.tipos.${k}.peso`, 'normalizado', { grupo: 'inocentes' })),
     L('Fase da ação em que a inocência fica clara', 'TERCEIROS.falsosAlarmes.etapaRevela', 'categoria', { opcoes: OPC_ETAPA }),
     L('Fração esclarecida já na interrogação, antes da abordagem, com integração mínima do quadro', 'TERCEIROS.falsosAlarmes.esclareceNaInterrogacao.base', 'percentual', { id: 'J1.6' }),
     L('Idem, com integração plena do quadro', 'TERCEIROS.falsosAlarmes.esclareceNaInterrogacao.porFusao', 'diferenca', { ref: 'J1.6' })]));
  Q.push(q('J2', 'Embarcações inocentes e danos a terceiros', 'Uso de força desnecessário',
    'Na abordagem de uma embarcação que se revelará inocente, qual a chance de a situação evoluir para uso de força desnecessário, conforme a postura vigente?',
    [...POSTURA.map((r, i) => L(r, `TERCEIROS.forcaDesnecessaria.pPorNivel.${i}`, 'percentual')),
     L('Havendo uso de força, chance de causar lesões ou avarias', 'TERCEIROS.forcaDesnecessaria.pDano', 'percentual')]));
  Q.push(q('J3', 'Embarcações inocentes e danos a terceiros', 'Danos ambientais',
    'Na abordagem ou em ação mais coercitiva contra cada modo de ação hostil, em postura de Crise, qual a chance de dano ambiental (derrame, rompimento de duto, detonação)?',
    [...Object.keys(TE.ambiental.pPorVetor).map(v => L(VETOR[v] ?? v, `TERCEIROS.ambiental.pPorVetor.${v}`, 'percentual')),
     ...POSTURA.map((r, i) => L(`Risco ambiental em ${r}, em % do risco em Crise`, `TERCEIROS.ambiental.fatorNivel.${i}`, 'percentual',
       { unidade: '% do risco em Crise', faixa: [0, null] }))]));

  // K. Crises
  Q.push(q('K1', 'Crises', 'Prazos de detecção e resposta',
    'Para cada tipo de crise, em quantos dias, contados do início, deveriam ocorrer a detecção e a resposta? Indique o prazo ideal e o prazo além do qual a resposta é considerada falha.',
    Object.keys(p.CRISES).flatMap(c => ['deteccao', 'resposta'].flatMap(m => [
      L(`${p.CRISES[c].rotulo}: ${m === 'deteccao' ? 'detecção' : 'resposta'}, prazo ideal`, `CRISES.${c}.${m}.ideal`, 'dias'),
      L(`${p.CRISES[c].rotulo}: ${m === 'deteccao' ? 'detecção' : 'resposta'}, prazo máximo`, `CRISES.${c}.${m}.max`, 'dias'),
    ]))));
  Q.push(q('K2', 'Crises', 'Porte das crises',
    'Qual o porte típico de cada crise?',
    [L('Crimes e ilícitos no mar: embarcações envolvidas', 'CRISES.crimes_ilicitos.efeito.ocorrencias.n', 'inteiro', { unidade: 'embarcações' }),
     L('Pesca ilegal em massa: embarcações envolvidas', 'CRISES.pesca_massa.efeito.ocorrencias.n', 'inteiro', { unidade: 'embarcações' }),
     L('Crimes e ilícitos / pesca em massa: fração das embarcações reprimidas para considerar a resposta adequada', ['CRISES.crimes_ilicitos.resposta.fracaoReprimida', 'CRISES.pesca_massa.resposta.fracaoReprimida'], 'percentual'),
     L('Salvamento: pessoas em perigo', 'CRISES.sar.efeito.sar.pessoas', 'inteiro', { unidade: 'pessoas' }),
     L('Salvamento: meios necessários', 'CRISES.sar.efeito.sar.meios', 'inteiro', { unidade: 'meios' }),
     L('Desastre: meios necessários', 'CRISES.desastre.efeito.desastre.meios', 'inteiro', { unidade: 'meios' }),
     L('Sabotagem de infraestrutura: convicção inicial sobre a autoria', 'CRISES.sabotagem_ic.efeito.hibrido.atribuicao', 'pontos', { unidade: '% de convicção' })]));

  // L. Comando
  Q.push(q('L1', 'Condução pelo comando', 'Capacidade de um comando',
    'Sobre a capacidade de condução de um Comando de Distrito Naval ou da Esquadra:',
    [L('Quantas ações distintas (designação de meio a um contato) o comando consegue conduzir por dia', 'DOUTRINA.acoesPorEstacao', 'inteiro', { unidade: 'ações por dia' }),
     L('Quantas ações extras em um dia de sobrecarga', 'DOUTRINA.surto', 'inteiro', { unidade: 'ações' }),
     L('Quantas ações a menos no dia seguinte a uma sobrecarga', 'DOUTRINA.penalidadeSurto', 'inteiro', { unidade: 'ações' }),
     L('Faltando quantos dias para o dano, o comandante aceita agir além do que os indícios fundamentam', 'DOUTRINA.urgencia', 'dias'),
     L('Abaixo de que apoio público o comando priorizaria a comunicação estratégica', 'DOUTRINA.apoioParaComunicar', 'pontos', { unidade: '%' }),
     L('A cada quantos dias renovar a comunicação preventiva', 'DOUTRINA.prebunkingACada', 'dias')]));

  // M. Êxito
  Q.push(q('M1', 'Critérios de êxito', 'Resultado de uma campanha de 45 dias',
    'Ao fim de uma campanha de 45 dias sem conflito aberto, que resultados caracterizam:',
    [L('Êxito da Força Azul: integridade mínima da infraestrutura crítica', 'DESFECHO.infraVitoriaAzul', 'pontos', { unidade: '% preservada' }),
     L('Êxito da Força Azul: fração mínima dos ilícitos reprimidos', 'DESFECHO.ordemVitoriaAzul', 'percentual'),
     L('Êxito do adversário: integridade da infraestrutura abaixo de', 'DESFECHO.infraVitoriaVermelha', 'pontos', { unidade: '% preservada' })]));

  // O. Questões abertas
  Q.push(q('O1', 'Questões abertas', 'Áreas de responsabilidade',
    'A divisão do litoral em quatro áreas (2º DN: BA–SE; 1º DN: RJ–ES; 8º DN: SP; 5º DN: SC–RS) representa adequadamente as áreas de responsabilidade para a segurança marítima? O que mudaria?',
    [L('Comentário', 'AREAS_DN', 'manual')]));
  Q.push(q('O2', 'Questões abertas', 'Ordem de batalha e bases',
    'Veja a aba "Meios e infraestrutura". A distribuição de meios por comando e as bases de operação são realistas? O que falta ou sobra?',
    [L('Comentário', ['MEIOS_AZUIS', 'BASES'], 'manual')]));
  Q.push(q('O3', 'Questões abertas', 'Infraestrutura crítica',
    'Veja a aba "Meios e infraestrutura". A lista de plataformas, portos, cabos e dutos considerada crítica, e sua importância relativa, é adequada?',
    [L('Comentário', 'INFRA', 'manual')]));
  Q.push(q('O4', 'Questões abertas', 'Alvos de cada modo de ação',
    'Os alvos atribuídos a cada modo de ação hostil (por exemplo, frota-sombra contra portos; sabotagem contra cabos e dutos) são os mais prováveis? A minagem exige contramedidas de minagem para ser frustrada?',
    [L('Comentário', vet.map(v => `HIBRIDO.vetores.${v}.alvos`), 'manual')]));
  Q.push(q('O5', 'Questões abertas', 'Campo de atuação de cada órgão',
    'O campo de atuação de cada órgão de apoio (Polícia Federal: narcotráfico; Receita Federal: contrabando; IBAMA: crimes ambientais e pesca; patrulha aérea e imageamento: todos; inteligência internacional: ameaças híbridas) está correto?',
    [L('Comentário', ap.map(a => `APOIOS.${a}.pertinencia`), 'manual')]));
  Q.push(q('O6', 'Questões abertas', 'Onde ocorrem os ilícitos',
    'Em que ambientes ocorre cada tipo de ilícito (águas rasas, plataforma continental, águas profundas, áreas de exploração de petróleo)?',
    [L('Comentário', tipos.map(t => `TIPOS_OCORRENCIA.${t}.terrenos`), 'manual')]));
  Q.push(q('O7', 'Questões abertas', 'Comportamento do comandante',
    'Diante de ameaças híbridas, o comandante tenderia a abordar contatos suspeitos com mais frequência do que só quando os indícios fundamentam? Em que circunstâncias?',
    [L('Comentário', 'DOUTRINA', 'manual')]));

  // Identificadores das linhas.
  for (const x of Q) x.linhas.forEach((l, i) => { l.id = l.id ?? `${x.id}.${i + 1}`; });
  return Q;
}

/**
 * Parâmetros fora do questionário: decisões de projeto do jogo, não matéria de
 * conhecimento profissional. Prefixos de caminho.
 */
const DECISOES_PROJETO = [
  { prefixo: 'DIFICULDADES', motivo: 'níveis de dificuldade do jogo (névoa, ritmo para fins de jogabilidade)' },
  { prefixo: 'HIBRIDO.maxAcoesHumano', motivo: 'teto de jogabilidade para o jogador Vermelho humano' },
  { prefixo: 'HIBRIDO.empregoAberto.intensidadeMin', motivo: 'limiar da intensidade híbrida configurada no cenário' },
  { prefixo: 'HIBRIDO.empregoAberto.nivelMin', motivo: 'regra da escada (emprego aberto só a partir de Crise)' },
  { prefixo: 'DOUTRINA.quadro.teto', motivo: 'teto técnico da chance de entrar no quadro' },
  { prefixo: 'INFOCOG.campanhasPorTurno', motivo: 'ritmo de jogo (uma campanha por turno)' },
  { prefixo: 'INFOCOG.prazoCampanha', motivo: 'ritmo de jogo' },
  { prefixo: 'INFOCOG.campanhas.prebunking.ganho', motivo: 'a comunicação preventiva protege, não recupera apoio' },
  { prefixo: 'CRISES.desastre.efeito.desastre.escala', motivo: 'reservado (escala única no modelo atual)' },
  { prefixo: 'LIMIAR_ATRIBUICAO.deteccao', motivo: 'detecção e identificação não exigem fundamento (vigilância)' },
  { prefixo: 'LIMIAR_ATRIBUICAO.identificacao', motivo: 'idem' },
  { prefixo: 'PESO_POLITICO.deteccao', motivo: 'idem' },
  { prefixo: 'PESO_POLITICO.identificacao', motivo: 'idem' },
  { prefixo: 'PESO_POLITICO.abordagem', motivo: 'âncora da escala de gravidade da questão I4 (abordagem sem indícios = 10 pontos)' },
  { prefixo: 'INFOCOG.custo.pesoExcesso', motivo: 'unidade da escala de gravidade: a questão I4 move as unidades de excesso de cada situação, não o peso' },
  { prefixo: 'HIBRIDO.vetores.ciber.janela', motivo: 'o ataque cibernético resolve no próprio turno' },
  { prefixo: 'HIBRIDO.vetores.lawfare', motivo: 'lawfare age pela desinformação (questões F8 e I3), não no mar' },
];

/** Todas as linhas, com a questão de origem. */
function linhas(p = P) {
  return questoes(p).flatMap(x => x.linhas.map(l => ({ ...l, questao: x })));
}

/** Hipótese atual do modelo para a linha, na unidade profissional (número ou opção), ou null. */
function hipotese(l0, p = P, todas = null) {
  todas = todas ?? linhas(p);
  const l = l0.questao ? l0 : todas.find(x => x.id === l0.id) ?? l0;
  const cs = alvos(l);
  if (l.conv === 'manual' || !cs.length) return null;
  const v = ler(p, cs[0]);
  if (v === undefined) return undefined;
  const C = CONVERSOES[l.conv];
  if (l.conv === 'categoria') return Object.keys(l.opcoes).find(k => l.opcoes[k] === v) ?? null;
  if (l.conv === 'formula') return l.de(v, p);
  if (l.conv === 'normalizado') {
    const grupo = todas.filter(x => x.grupo === l.grupo && x.questao.id === l.questao.id);
    const soma = grupo.reduce((s, x) => s + ler(p, alvos(x)[0]), 0);
    return soma ? (100 * v) / soma : 0;
  }
  if (l.conv === 'diferenca' || l.conv === 'reducao') {
    const ref = todas.find(x => x.id === l.ref);
    const vr = ler(p, alvos(ref)[0]);
    return l.conv === 'diferenca' ? 100 * (vr + v) : 100 * (vr - v);
  }
  return C.de(v);
}

/**
 * Converte as respostas (id da linha → número ou opção) em sobrescrita.
 * @returns {{ sobrescrita: object, manuais: object[], erros: string[] }}
 */
function converterRespostas(respostas0, p = P) {
  const todas = linhas(p);
  // Item que depende de outro (diferença, redução, fórmula com referência): se
  // só a referência foi respondida, o dependente mantém a SUA hipótese, em vez
  // de se deslocar junto com a referência.
  const respostas = { ...respostas0 };
  for (const l of todas) if (l.ref && respostas[l.ref] != null && respostas[l.id] == null) respostas[l.id] = hipotese(l, p, todas);
  const over = {}, erros = [], aplicadas = [];
  const pôr = (c, v) => { mesclar(over, SO.sobrescritaDe(c, v)); };
  const valorOuHipotese = l => (respostas[l.id] != null ? respostas[l.id] : hipotese(l, p, todas));
  const feitosGrupo = new Set();
  for (const l of todas) {
    const r = respostas[l.id];
    if (r == null || l.conv === 'manual') continue;
    try {
      const num = l.conv === 'categoria' ? null : Number(r);
      if (l.conv !== 'categoria' && !Number.isFinite(num)) throw new Error(`"${r}" não é número`);
      let v;
      if (l.conv === 'categoria') {
        if (!(r in l.opcoes)) throw new Error(`opção inválida "${r}" (opções: ${Object.keys(l.opcoes).join(', ')})`);
        v = l.opcoes[r];
      } else if (l.conv === 'formula') v = l.para(num, p, l.ref ? Number(valorOuHipotese(todas.find(x => x.id === l.ref))) : undefined);
      else if (l.conv === 'diferenca' || l.conv === 'reducao') {
        const ref = todas.find(x => x.id === l.ref);
        const rr = Number(valorOuHipotese(ref));
        v = l.conv === 'diferenca' ? (num - rr) / 100 : (rr - num) / 100;
      } else if (l.conv === 'normalizado') {
        const chave = `${l.questao.id}:${l.grupo}`;
        if (feitosGrupo.has(chave)) continue;
        feitosGrupo.add(chave);
        const grupo = todas.filter(x => x.grupo === l.grupo && x.questao.id === l.questao.id);
        const soma = grupo.reduce((s, x) => s + ler(p, alvos(x)[0]), 0);
        const partes = grupo.map(x => Number(valorOuHipotese(x)));
        if (partes.some(x => !Number.isFinite(x) || x < 0)) throw new Error('participações inválidas no grupo');
        const total = partes.reduce((s, x) => s + x, 0);
        if (!(total > 0)) throw new Error('participações somam zero');
        grupo.forEach((x, i) => { const val = (partes[i] / total) * soma; for (const c of alvos(x)) pôr(c, val); aplicadas.push(x.id); });
        continue;
      } else v = CONVERSOES[l.conv].para(num);
      if (!Number.isFinite(v) && typeof v !== 'string') throw new Error('conversão sem resultado numérico');
      for (const c of alvos(l)) pôr(c, v);
      aplicadas.push(l.id);
    } catch (e) { erros.push(`${l.id} (${l.item}): ${e.message}`); }
  }
  if (!erros.length) {
    try { SO.aplicarSobrescritas(over, p); } catch (e) { erros.push(e.message); }
  }
  return { sobrescrita: over, aplicadas, erros };
}

function mesclar(a, b) {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] ? mesclar(a[k], v) : v;
  return a;
}

/** Faixa válida da resposta, na unidade profissional: [mínimo, máximo] (null = sem limite). */
function faixaDe(l) {
  if (l.faixa !== undefined) return l.faixa;
  const u = String(l.unidade ?? CONVERSOES[l.conv].unidade);
  if (l.conv === 'categoria' || l.conv === 'manual') return null;
  if (l.conv === 'escala10') return [0, 10];
  if (['percentual', 'prob_mensal', 'normalizado', 'diferenca', 'reducao'].includes(l.conv) && !/pontos percentuais/.test(u)) return [0, 100];
  if (/% de convicção|% preservada|^%$/.test(u)) return [0, 100];
  if (/pontos percentuais/.test(u) && l.conv === 'pontos') return [-100, 100];
  if (/0 a 3/.test(u)) return [0, 3];
  if (['dias', 'horas', 'inteiro', 'por_mes', 'meia_vida'].includes(l.conv)) return [0, null];
  if (l.conv === 'ganho') return [-100, null];
  if (l.conv === 'formula') return [0, null];
  return null;
}

const ORDEM_PRIO = ['alta', 'média', 'baixa', 'inerte', 'não medida', 'estrutural'];
/** Maior prioridade entre os blocos de parâmetros das linhas (mapa bloco → nível). */
function prioridadeDe(ls, prioridades = {}) {
  const niveis = ls.flatMap(alvos).map(c => prioridades[c.split('.')[0]]).filter(Boolean);
  if (!niveis.length) return null;
  return niveis.sort((a, b) => ORDEM_PRIO.indexOf(a) - ORDEM_PRIO.indexOf(b))[0];
}

/** Rastreamento: uma entrada por linha (questão, item, parâmetros, conversão, hipótese atual). */
function rastreamento(p = P, prioridades = {}) {
  const todas = linhas(p);
  return {
    gerado_por: 'shared/sm/questionario_profissional.js',
    conversoes: Object.fromEntries(Object.entries(CONVERSOES).map(([k, c]) => [k, { unidade: c.unidade, regra: c.regra }])),
    itens: todas.map(l => ({
      id: l.id, questao: l.questao.id, tema: l.questao.tema, titulo: l.questao.titulo, item: l.item,
      parametros: alvos(l), conversao: l.conv, regra: l.regra ?? CONVERSOES[l.conv].regra,
      ...(l.ref ? { referencia: l.ref } : {}), ...(l.grupo ? { grupo: l.grupo } : {}), ...(l.opcoes ? { opcoes: l.opcoes } : {}),
      unidade: l.unidade ?? CONVERSOES[l.conv].unidade,
      prioridade: prioridadeDe([l], prioridades),
      hipotese_atual: hipotese(l, p, todas),
      valor_atual: alvos(l).length === 1 && l.conv !== 'manual' ? ler(p, alvos(l)[0]) : undefined,
    })),
    decisoes_de_projeto: DECISOES_PROJETO,
  };
}

/** Meios e infraestrutura em linguagem profissional (aba de revisão). */
function meiosEInfra() {
  const EST = { ComemCh: 'Comando-em-Chefe da Esquadra', COMPAAz: 'Comando de Patrulha (COMPAAz)', 'Com1ºDN': '1º Distrito Naval', 'Com2ºDN': '2º Distrito Naval', 'Com8ºDN': '8º Distrito Naval', 'Com5ºDN': '5º Distrito Naval' };
  const FAT = { A_MPA: 'patrulha marítima aérea', B_NPaOc: 'navios-patrulha', C_Fusao: 'sistema integrado', D_USV: 'não tripulados', E_GVI: 'Fuzileiros (GVI)' };
  const TIPO_INFRA = { fpso: 'Plataforma de produção', porto: 'Porto / terminal', cabo: 'Cabo submarino', duto: 'Duto submarino' };
  return {
    meios: OB.MEIOS_AZUIS.map(m => ({ comando: EST[m.estacao] ?? m.estacao, meio: m.nome, classe: m.classe, capacidade_em_avaliacao: m.fator ? FAT[m.fator] : '' })),
    bases: Object.values(OB.BASES).map(b => b.nome),
    infra: OB.INFRA.map(i => ({ nome: i.nome, tipo: TIPO_INFRA[i.tipo] ?? i.tipo, importancia: i.sp })),
  };
}

module.exports = { questoes, linhas, hipotese, converterRespostas, rastreamento, meiosEInfra, prioridadeDe, faixaDe, CONVERSOES, DECISOES_PROJETO, alvos };
