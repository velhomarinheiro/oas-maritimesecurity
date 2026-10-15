'use strict';
/**
 * sm_validacao_face.js — Gera o pacote de validação de face da OAS-SM (SM-10)
 * para a revisão por especialistas (Conceito v1.6 §13; Desenho v1.3, aviso
 * inicial: dados validados por especialistas antes de qualquer uso analítico).
 *
 * Saídas em docs/sm/validacao_face/:
 *   questionario.xlsx / .md          questionário em linguagem profissional militar
 *                                    (questionario_profissional.js), para especialistas
 *                                    sem conhecimento do código; a planilha respondida
 *                                    volta ao modelo por scripts/sm_questionario_importar.js;
 *   rastreamento.json / .md          vínculo de cada item do questionário com os
 *                                    parâmetros, a regra de conversão e o valor atual
 *                                    (uso do analista; não vai ao respondente);
 *   inventario_tecnico.md            um item por bloco de parâmetros marcado
 *                                    `// TODO: validar com especialista`, com o
 *                                    valor atual e a prioridade (uso interno);
 *   params_especialista.exemplo.json modelo de sobrescrita (sobrescrita.js),
 *                                    com os valores atuais dos blocos prioritários;
 *   narrativa_*.md                   campanhas jogadas pelo motor, turno a turno,
 *                                    para o julgamento de plausibilidade.
 *
 * Uso:
 *   node scripts/sm_sensibilidade.js          # antes, para as prioridades
 *   node scripts/sm_validacao_face.js [--saida dir]
 */

const fs = require('fs');
const path = require('path');
const { PARAMS: P } = require('../shared/sm/params');
const OB = require('../shared/sm/oob_sm');
const R = require('../shared/sm/runner');
const QX = require('../shared/sm/questionario_xlsx');
const QP = require('../shared/sm/questionario_profissional');

const args = process.argv.slice(2);
const RAIZ = path.join(__dirname, '..');
const SAIDA = path.resolve(args.includes('--saida') ? args[args.indexOf('--saida') + 1] : path.join(RAIZ, 'docs', 'sm', 'validacao_face'));
const ARQ_SENS = path.join(RAIZ, 'data', 'sm', 'sensibilidade_oas_sm.json');
const sens = fs.existsSync(ARQ_SENS) ? JSON.parse(fs.readFileSync(ARQ_SENS, 'utf8')) : null;

// ─── Blocos marcados no código ────────────────────────────────────────────────

/** Blocos `// TODO: validar com especialista` de um arquivo: seção, nome, comentário. */
function blocosDe(arquivo) {
  const linhas = fs.readFileSync(arquivo, 'utf8').split('\n');
  const out = [];
  let secao = '', comentario = [], pendente = null;
  for (const l of linhas) {
    const t = l.trim();
    const sec = t.match(/^\/\/ ─── (.+?) ─/);
    if (sec) { secao = sec[1]; comentario = []; continue; }
    const todo = t.match(/^\/\/ TODO: validar com especialista\s*(.*)$/);
    if (todo) { pendente = { secao, comentario: comentario.join(' '), nota: todo[1].replace(/^\(|\)$/g, '') }; comentario = []; continue; }
    if (t.startsWith('//')) { comentario.push(t.replace(/^\/\/\s?/, '')); continue; }
    const c = t.match(/^const ([A-Z][A-Z0-9_]+)\s*=/);
    if (c && pendente) { out.push({ ...pendente, nome: c[1], arquivo: path.relative(RAIZ, arquivo) }); pendente = null; }
    if (t && !t.startsWith('//')) comentario = [];
  }
  return out;
}

const blocos = [
  ...blocosDe(path.join(RAIZ, 'shared', 'sm', 'params.js')).map(b => ({ ...b, valor: P[b.nome], json: b.nome in P })),
  ...blocosDe(path.join(RAIZ, 'shared', 'sm', 'oob_sm.js')).map(b => ({ ...b, secao: b.secao || 'OOB de MarSec (Conceito §10)', valor: OB[b.nome], json: false })),
];

// ─── Formatação ───────────────────────────────────────────────────────────────

const virg = v => (typeof v === 'number' ? String(v).replace('.', ',') : v);
function folhas(v, caminho = '') {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return [[caminho, v]];
  return Object.entries(v).flatMap(([k, x]) => folhas(x, caminho ? `${caminho}.${k}` : k));
}
const mostra = v => (Array.isArray(v) ? `[${v.map(x => (typeof x === 'object' ? JSON.stringify(x) : virg(x))).join(', ')}]` : typeof v === 'string' ? `'${v}'` : virg(v));

// Prioridade fixada por achado fora da varredura OAT.
const PRIORIDADE_MANUAL = {
  DESFECHO: { nivel: 'alta', detalhe: 'o limiar de ordem está acima do máximo de E5 no lote (análise do lote, §7)' },
};

function prioridade(b) {
  if (PRIORIDADE_MANUAL[b.nome]) return PRIORIDADE_MANUAL[b.nome];
  if (!sens || !b.json) return { nivel: b.json ? 'não medida' : 'estrutural', detalhe: '' };
  const es = sens.entradas.filter(e => e.alvo.split('.')[0] === b.nome);
  if (!es.length) return { nivel: 'não medida', detalhe: 'fora do catálogo de sensibilidade' };
  const max = Math.max(...es.map(e => e.maxD));
  const fragil = es.filter(e => !e.robustoFusao);
  const inerte = es.every(e => e.maxD === 0);
  const nivel = fragil.length || max >= 1 ? 'alta' : max >= 0.3 ? 'média' : inerte ? 'inerte' : 'baixa';
  const det = es.map(e => `${e.id} (|d| máx. ${e.maxD.toFixed(2).replace('.', ',')}${e.robustoFusao ? '' : ', muda a conclusão sobre C_Fusão'})`).join('; ');
  return { nivel, detalhe: det };
}

// ─── Questionário ─────────────────────────────────────────────────────────────

const Q = [];
Q.push('# OAS-SM — Inventário técnico dos parâmetros a validar', '');
Q.push('Uso interno do analista. O questionário enviado aos especialistas, em linguagem profissional, é `questionario.xlsx` (e `questionario.md`); o vínculo de cada pergunta com os parâmetros abaixo está em `rastreamento.md`.', '');
Q.push('Revisão por especialistas dos parâmetros de projeto da variante de Segurança Marítima (SM-10). ' +
  'Todos os valores abaixo são **placeholders**: foram escolhidos para que o modelo funcione, não a partir de dados. ' +
  'Nada do que o lote produz deve ser usado analiticamente antes desta revisão (Desenho Experimental v1.3, aviso).', '');
Q.push('## Como responder', '');
Q.push('1. Para cada item, indique se o valor é plausível. Se não for, proponha um valor (ou uma faixa) e a fonte ou o raciocínio.');
Q.push('2. Registre a confiança: **baixa** (palpite informado), **média** (experiência direta) ou **alta** (dado documentado).');
Q.push('3. Os itens de prioridade **alta** mudam as métricas em mais de um desvio-padrão, ou mudam a conclusão principal do lote. Comece por eles.');
Q.push('4. Valores revisados entram no modelo sem mudar o código: copie `params_especialista.exemplo.json`, edite e rode `node scripts/sm_lote.js --params arquivo.json` (e `sm_sensibilidade.js --params` para a sensibilidade em torno deles). Chaves que começam com "_" registram revisor, data e fonte.');
Q.push('5. Itens marcados **estrutural** (ordem de batalha, bases, infraestrutura) são editados no próprio código (`shared/sm/oob_sm.js`).', '');
Q.push(sens ? `Prioridades calculadas a partir de \`node scripts/sm_sensibilidade.js\` (${sens.replicas} réplicas).` : 'Prioridades não calculadas: rode `node scripts/sm_sensibilidade.js` antes deste script.', '');

const ordemP = { alta: 0, 'média': 1, baixa: 2, inerte: 3, 'não medida': 4, estrutural: 5 };
const itens = blocos.map(b => ({ ...b, prio: prioridade(b) }));
Q.push('## Resumo por prioridade', '', '| # | Parâmetro | Seção | Prioridade |', '|---|---|---|---|');
itens.slice().sort((a, b) => ordemP[a.prio.nivel] - ordemP[b.prio.nivel]).forEach(b => Q.push(`| ${itens.indexOf(b) + 1} | \`${b.nome}\` | ${b.secao} | ${b.prio.nivel} |`));
Q.push('');

Q.push('## Questões de coerência do modelo', '');
Q.push('Pontos que a análise de sensibilidade e do lote revelaram na SM-10, com os parâmetros placeholder (números de `docs/sm/resultados/`), e que pedem decisão de quem conhece o domínio antes dos valores:', '');
const COERENCIA = [
  '**Um só limiar de "atribuição robusta"?** O valor 70 aparece em quatro parâmetros: `CLASSES_ATRIBUICAO` (classe "robusta"), `GATILHOS_ESCALADA.N2/N3.atribuicaoMin` e `HIBRIDO.investigacao.robusta`. Mover só um deles muda a atribuição sem mudar a escalada (item A6 da sensibilidade). Devem ser o mesmo limiar?',
  '**Excesso de força e danos a terceiros (respondida na revisão; SM-11).** As três situações apontadas — interrupção desnecessária da navegação mercante; uso de força desnecessário contra mercantes e pesqueiros; ações militares que provoquem danos ambientais — agora são geradas pelo modelo (bloco `TERCEIROS`). As frequências são placeholders: falsos alarmes (λ por área e turno e quanto a fusão os reduz), chance de esclarecer na interrogação, chance de força desnecessária por nível N0–N3, chance de dano ambiental por vetor. Estão plausíveis?',
  '**Cadeia de repressão.** Narcotráfico, contrabando e pesca IUU só contam como reprimidos no apresamento, depois de detecção, identificação, interrogação, abordagem e inspeção em sequência (crime ambiental termina na inspeção; pirataria e imigração, na abordagem — `TIPOS_OCORRENCIA.*.etapaRepressao`). Por isso E5_ordem fica perto de 0,12 mesmo com todas as capacidades, e ±30% em `P_BASE` move E5 em 13 desvios-padrão. A repressão desses tipos exige mesmo o apresamento? As etapas devem ser independentes, ou o êxito numa torna a seguinte mais provável?',
  '**Limiar de vitória fora do alcance.** `DESFECHO.ordemVitoriaAzul` = 0,4 está acima do máximo de E5 no lote (≈ 0,21); por isso 83% das partidas terminam "indecisa". O limiar deve ser calibrado junto com a cadeia de repressão.',
  '**Saturação da fusão.** Os pesos das fontes somam 1: com todas as fontes, a fusão já é plena, e os bônus de MPA e CENSIPAM e o fator A_MPA quase não agem quando C_Fusão está presente. A fusão plena deve exigir todas as fontes, ou as fontes devem ter retornos decrescentes?',
  '**C_Fusão separa a escalada a N3.** No fatorial não há nenhuma escalada a N3 nem perda do KCV sem C_Fusão: sem fusão ampliada a atribuição robusta não é alcançada. É plausível que, sem o SisGAAz ampliado, o país nunca chegue a atribuir um ataque com robustez suficiente para o conflito aberto?',
  '**Custo político dominado pela atribuição.** Os parâmetros de atribuição (ganho de evidência, negabilidade, ritmo, limiares) movem E4_custopol em 11 a 14 desvios-padrão: a doutrina aceita agir à frente da atribuição quando o efeito do híbrido é iminente (`DOUTRINA.urgencia`). O custo de agir sem atribuição está no tamanho certo?',
  '**Erosão do apoio público.** Em 45 dias o apoio cai de 60 para cerca de 24 com todas as capacidades e para cerca de 5 sem C_Fusão; o efeito-base da desinformação (`INFOCOG.desinformacao.base`) move o apoio final em 4 desvios-padrão. A desinformação adversária deve ter esse peso, e o retorno do apoio (`INFOCOG.retornoPorTurno`) deve ser tão lento?',
  '**O compromisso E5 × E1 não aparece com a doutrina fixa.** O Desenho §4 prevê que perseguir ocorrências tire foco do híbrido. Com o agente doutrinário, E5 e E1 sobem juntas com a fusão (correlação positiva). O compromisso depende de escolha; deve ser examinado em partidas com humanos ou com doutrinas alternativas.',
];
COERENCIA.forEach((c, i) => Q.push(`${i + 1}. ${c}`, '', '   Resposta: ', ''));

Q.push('## Itens', '');
itens.forEach((b, i) => {
  Q.push(`### ${i + 1}. \`${b.nome}\` — ${b.secao}`, '');
  Q.push(`*${b.arquivo}* · prioridade **${b.prio.nivel}**${b.prio.detalhe ? ` — ${b.prio.detalhe}` : ''} · ${b.json ? 'sobrescrevível por JSON' : 'editar no código'}`, '');
  if (b.comentario) Q.push(b.comentario, '');
  if (b.nota) Q.push(`Foco da revisão: ${b.nota}.`, '');
  if (b.json) {
    const fs_ = folhas(b.valor, b.nome);
    if (fs_.length <= 60) {
      Q.push('| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |', '|---|---|---|---|---|');
      fs_.forEach(([c, v]) => Q.push(`| \`${c}\` | ${mostra(v)} | | | |`));
    } else {
      Q.push(`${fs_.length} valores — ver \`${b.arquivo}\`. Proposta: | | Fonte: | | Confiança: |`);
    }
  } else {
    const n = Array.isArray(b.valor) ? b.valor.length : Object.keys(b.valor ?? {}).length;
    Q.push(`${n} entradas — ver \`${b.arquivo}\`.`, '', 'Correções propostas: ', '');
  }
  Q.push('', 'Plausível? ☐ sim ☐ não ☐ não sei · Comentário: ', '');
});

// ─── Modelo de sobrescrita ────────────────────────────────────────────────────

const modelo = {
  _revisor: 'nome e função',
  _data: 'AAAA-MM-DD',
  _fonte: 'documentos, experiência ou dados que fundamentam os valores',
  _nota: 'Valores ATUAIS (placeholders) dos blocos de maior prioridade. Edite os que revisar; apague os demais ou deixe-os como estão. Chaves com "_" são ignoradas pelo modelo.',
};
for (const b of itens.filter(x => x.json && x.prio.nivel === 'alta')) modelo[b.nome] = b.valor;
if (Object.keys(modelo).length === 4) for (const n of ['P_BASE', 'GANHO_EVIDENCIA', 'FATOR_NEGABILIDADE', 'DESFECHO']) modelo[n] = P[n];

// ─── Narrativas ───────────────────────────────────────────────────────────────

const todos = { A_MPA: 1, B_NPaOc: 1, C_Fusao: 1, D_USV: 1, E_GVI: 1 };
const NARRATIVAS = [
  { arq: 'narrativa_C0_intermediario.md', titulo: 'C0 (todas as capacidades), intermediário', cfg: { ...R.CFG_PESQUISA, seed: 5001, fatores: todos, apoioExterno: 1 } },
  { arq: 'narrativa_C3_sem_fusao.md', titulo: 'C3 (sem C_Fusão), intermediário', cfg: { ...R.CFG_PESQUISA, seed: 5001, fatores: { ...todos, C_Fusao: -1 }, apoioExterno: 1 } },
];
const PERGUNTAS = [
  'O ritmo de incidentes no mar — ilícitos e ações hostis — é plausível para o litoral considerado?',
  'As chances de êxito em cada fase da ação ("provável", "arriscado"…) correspondem ao que se espera desses meios?',
  'A convicção sobre a autoria dos incidentes cresce na velocidade certa? A postura (Rotina, Tensão, Crise, Conflito) muda pelos motivos e no tempo plausíveis?',
  'O apoio da opinião pública e o desgaste político reagem aos fatos de forma crível?',
  'Em algum dia, a conduta dos comandos seria claramente diferente da de um comandante real? Em qual, e o que ele faria?',
];
const DESFECHO_TXT = { indecisa: 'resultado indefinido', vitoria_azul: 'êxito da Força Azul', vitoria_vermelha: 'êxito do adversário',
  derrota_estrategica_azul: 'perda de sustentação política da operação', derrota_vermelha_kcv: 'conflito aberto, com perda do navio-capitânia adversário',
  conflito_vitoria_azul: 'conflito aberto, com êxito da Força Azul', conflito_vitoria_vermelha: 'conflito aberto, com êxito do adversário', conflito_indeciso: 'conflito aberto, indefinido' };
function narrativa(n) {
  const r = R.jogarPartida(n.cfg, { boletins: true });
  const m = r.metricas;
  const L = [`# Narrativa de campanha — ${n.titulo}`, ''];
  L.push(`Campanha de ${n.cfg.duracaoDias} dias conduzida pelo próprio jogo, dos dois lados. Cada dia traz o boletim de situação que o comandante recebe: ações dos meios, fase alcançada e chance de êxito de cada uma, convicção sobre a autoria, situação da ordem no mar e da opinião pública.`, '');
  L.push('## Perguntas ao revisor', '');
  PERGUNTAS.forEach((p, i) => L.push(`${i + 1}. ${p}`, '', '   Resposta: ', ''));
  L.push('## Resultado', '');
  const pc = x => `${Math.round(100 * (x ?? 0))}%`;
  L.push(`**${DESFECHO_TXT[r.desfecho] ?? r.desfecho}**, após ${r.turnos} dias.`, '');
  L.push(`- Ações hostis frustradas ou com autoria esclarecida: ${pc(m.E1_atrib)}`,
    `- Infraestrutura crítica preservada: ${Math.round(m.E2_infra)}%`,
    `- Dias abaixo do limiar de conflito: ${m.E3_escalada}`,
    `- Ilícitos reprimidos: ${pc(m.E5_ordem)}`,
    `- Postura máxima alcançada: ${['Rotina', 'Tensão', 'Crise', 'Conflito'][m.nivel_max]}`,
    `- Apoio da opinião pública ao fim: ${Math.round(m.apoio_publico_final)}%`, '');
  L.push('## Turnos', '');
  r.boletins.forEach(b => { L.push(`### ${b[0]}`, '', ...b.slice(1).map(x => `- ${x}`), ''); });
  return L.join('\n') + '\n';
}

fs.mkdirSync(SAIDA, { recursive: true });
fs.writeFileSync(path.join(SAIDA, 'inventario_tecnico.md'), Q.join('\n') + '\n', 'utf8');
const prioridades = Object.fromEntries(itens.map(b => [b.nome, b.prio.nivel]));
fs.writeFileSync(path.join(SAIDA, 'questionario.md'), questionarioMd(prioridades), 'utf8');
const RA = QP.rastreamento(P, prioridades);
fs.writeFileSync(path.join(SAIDA, 'rastreamento.json'), JSON.stringify(RA, null, 1) + '\n', 'utf8');
fs.writeFileSync(path.join(SAIDA, 'rastreamento.md'), rastreamentoMd(RA), 'utf8');
fs.writeFileSync(path.join(SAIDA, 'params_especialista.exemplo.json'), JSON.stringify(modelo, null, 2) + '\n', 'utf8');
for (const n of NARRATIVAS) fs.writeFileSync(path.join(SAIDA, n.arq), narrativa(n), 'utf8');
QX.exportarQuestionario({ prioridades }).then(buf => {
  fs.writeFileSync(path.join(SAIDA, 'questionario.xlsx'), buf);
  console.log(`${QP.questoes().length} questões / ${RA.itens.length} itens no questionário profissional (.md, .xlsx), rastreamento, ` +
              `inventário técnico de ${itens.length} blocos, ${NARRATIVAS.length} narrativas → ${SAIDA}`);
});

// ─── Questionário profissional (leitura) e rastreamento ───────────────────────

function questionarioMd(prioridades) {
  const fmt = h => (h == null ? '—' : typeof h === 'string' ? h : String(Math.round(h * 100) / 100).replace('.', ','));
  const L = ['# Operação Atlântico Sul — Segurança Marítima', '', '## Questionário de validação por especialistas', ''];
  L.push('Este questionário colhe a sua experiência profissional para calibrar um jogo de guerra de segurança marítima: patrulha naval, repressão a ilícitos, ameaças híbridas à infraestrutura marítima, apoio interagências e escalada até o conflito aberto, no litoral do 2º ao 5º Distrito Naval.', '');
  L.push('Para cada item, a "hipótese atual" é o valor adotado até agora, escolhido sem base em dados. Diga se concorda e, se não, dê a sua estimativa e o fundamento. Responda só o que estiver no seu campo de experiência; com pouco tempo, comece pelos itens de prioridade alta. A versão para preencher é a planilha `questionario.xlsx`.', '');
  let tema = null;
  for (const x of QP.questoes()) {
    if (x.tema !== tema) { tema = x.tema; L.push(`## ${tema}`, ''); }
    const pq = QP.prioridadeDe(x.linhas, prioridades);
    L.push(`### ${x.id}. ${x.titulo}${pq ? ` (prioridade ${pq})` : ''}`, '', x.pergunta, '');
    if (x.linhas.every(l => l.conv === 'manual')) { L.push('Resposta: ', ''); continue; }
    L.push('| Nº | Item | Hipótese atual | Unidade | Concorda? | Sua estimativa |', '|---|---|---|---|---|---|');
    for (const l of x.linhas) {
      const un = l.conv === 'categoria' ? `escolha: ${Object.keys(l.opcoes).join(' / ')}` : (l.unidade ?? QP.CONVERSOES[l.conv].unidade);
      L.push(`| ${l.id} | ${l.item} | ${fmt(QP.hipotese(l))} | ${un} | | |`);
    }
    L.push('');
  }
  return L.join('\n') + '\n';
}

function rastreamentoMd(RA) {
  const fmt = v => (v == null ? '—' : typeof v === 'number' ? String(Math.round(v * 10000) / 10000).replace('.', ',') : String(v));
  const L = ['# Rastreamento do questionário profissional → parâmetros', ''];
  L.push('Uso do analista. Liga cada item do questionário de validação (`questionario.xlsx`) aos parâmetros de `shared/sm/params.js`, com a regra que converte a resposta profissional em valor técnico. ' +
    'A conversão é automática em `scripts/sm_questionario_importar.js`; os itens "manual" pedem interpretação do analista. A fonte é `shared/sm/questionario_profissional.js`; este arquivo e `rastreamento.json` são gerados por `npm run sm:validacao`.', '');
  L.push('## Regras de conversão', '', '| Conversão | Unidade da resposta | Regra |', '|---|---|---|');
  for (const [k, c] of Object.entries(RA.conversoes)) L.push(`| ${k} | ${c.unidade} | ${c.regra} |`);
  L.push('', '## Itens', '', '| Nº | Item | Parâmetro(s) | Conversão | Regra | Hipótese (unidade profissional) | Valor atual | Prioridade |', '|---|---|---|---|---|---|---|---|');
  for (const i of RA.itens) {
    const pars = i.parametros.map(c => `\`${c}\``).join('<br>');
    const regra = (i.regra + (i.referencia ? ` (referência: ${i.referencia})` : '') + (i.grupo ? ` (grupo: ${i.grupo})` : '') +
      (i.opcoes ? ` (opções: ${Object.entries(i.opcoes).map(([a, b]) => `${a} → ${b}`).join('; ')})` : '')).replace(/\|/g, '/');
    L.push(`| ${i.id} | ${i.item.replace(/\|/g, '/')} | ${pars} | ${i.conversao} | ${regra} | ${fmt(i.hipotese_atual)} ${i.unidade} | ${fmt(i.valor_atual)} | ${i.prioridade ?? '—'} |`);
  }
  L.push('', '## Parâmetros fora do questionário (decisões de projeto)', '', '| Parâmetro | Motivo |', '|---|---|');
  for (const d of RA.decisoes_de_projeto) L.push(`| \`${d.prefixo}\` | ${d.motivo} |`);
  return L.join('\n') + '\n';
}
