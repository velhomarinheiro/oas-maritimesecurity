'use strict';

/**
 * questionario_xlsx.js — Questionário de validação de face em planilha (.xlsx),
 * em linguagem profissional militar, e importação da planilha respondida.
 *
 * O respondente vê perguntas sobre conhecimento profissional (desempenho de
 * meios, incidência de ilícitos, prazos, critérios de escalada, opinião
 * pública), com a hipótese atual do modelo em unidades do ofício; não vê
 * parâmetros nem código. O vínculo pergunta → parâmetro → conversão está em
 * questionario_profissional.js e no arquivo de rastreamento
 * (docs/sm/validacao_face/rastreamento.json), que o importador usa:
 *
 *   node scripts/sm_questionario_importar.js respondido.xlsx revisado.json
 *   node scripts/sm_lote.js --params revisado.json
 *
 * Abas: Apresentação (com os dados do respondente), Questionário, Questões
 * abertas, Meios e infraestrutura (para consulta).
 */

const ExcelJS = require('exceljs');
const { PARAMS: P } = require('./params');
const QP = require('./questionario_profissional');
const SO = require('./sobrescrita');
const { zerarDatasZip } = require('../ob_spreadsheet');

const FONTE = { name: 'Arial', size: 10 };
const AMARELO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const CABECALHO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1E3A' } };
const QUESTAO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
const CINZA = { argb: 'FF808080' };
const BORDA = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
                left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } };
const PAGINA = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
const LISTA_CONCORDA = ['sim', 'não', 'não sei'];
const LISTA_CONFIANCA = ['baixa', 'média', 'alta'];
const DADOS_RESPONDENTE = { 'Nome': '_respondente', 'Posto / função': '_funcao', 'Experiência relevante (áreas, anos)': '_experiencia', 'Data (AAAA-MM-DD)': '_data' };

const COLS = [
  { chave: 'n', titulo: 'Nº', largura: 10 },
  { chave: 'tema', titulo: 'Tema', largura: 20 },
  { chave: 'prioridade', titulo: 'Prioridade', largura: 11 },
  { chave: 'pergunta', titulo: 'Pergunta / item', largura: 60 },
  { chave: 'hipotese', titulo: 'Hipótese atual do modelo', largura: 16 },
  { chave: 'unidade', titulo: 'Unidade', largura: 18 },
  { chave: 'concorda', titulo: 'Concorda?', largura: 11, entrada: true, lista: LISTA_CONCORDA },
  { chave: 'estimativa', titulo: 'Sua estimativa', largura: 15, entrada: true },
  { chave: 'fundamento', titulo: 'Fundamento / experiência', largura: 40, entrada: true },
  { chave: 'confianca', titulo: 'Confiança', largura: 11, entrada: true, lista: LISTA_CONFIANCA },
  { chave: 'observacoes', titulo: 'Observações', largura: 36, entrada: true },
];
const COLS_ABERTAS = [
  { chave: 'n', titulo: 'Nº', largura: 6 },
  { chave: 'titulo', titulo: 'Tema', largura: 26 },
  { chave: 'pergunta', titulo: 'Pergunta', largura: 80 },
  { chave: 'resposta', titulo: 'Resposta', largura: 70, entrada: true },
  { chave: 'confianca', titulo: 'Confiança', largura: 11, entrada: true, lista: LISTA_CONFIANCA },
];

/** Formata a hipótese para leitura (vírgula decimal, até 2 casas). */
function exibir(h) {
  if (h == null) return null;
  if (typeof h === 'string') return h;
  const r = Math.round(h * 100) / 100;
  return Number.isInteger(r) ? r : r;
}

function cabecalho(ws, cols) {
  ws.columns = cols.map(c => ({ key: c.chave, width: c.largura }));
  const r = ws.getRow(1);
  cols.forEach((c, i) => {
    const cel = r.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { ...FONTE, bold: true, color: { argb: 'FFFFFFFF' } };
    cel.fill = CABECALHO;
    cel.alignment = { vertical: 'middle', wrapText: true };
    cel.border = BORDA;
  });
  r.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function linha(ws, cols, dados, { estilo = 'item', lista = null } = {}) {
  const r = ws.addRow(cols.map(c => dados[c.chave] ?? null));
  cols.forEach((c, i) => {
    const cel = r.getCell(i + 1);
    cel.font = estilo === 'exemplo' ? { ...FONTE, italic: true, color: CINZA } : estilo === 'questao' ? { ...FONTE, bold: true } : FONTE;
    cel.alignment = { vertical: 'top', wrapText: true };
    cel.border = BORDA;
    if (estilo === 'questao') { cel.fill = QUESTAO; return; }
    if (c.entrada) cel.fill = AMARELO;
    const opcoes = c.chave === 'estimativa' && lista ? lista : c.lista;
    if (c.entrada && opcoes) cel.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${opcoes.join(',')}"`],
      showErrorMessage: true, errorTitle: c.titulo, error: `Escolha: ${opcoes.join(', ')}.` };
  });
  return r;
}

/** @returns {Promise<Buffer>} */
/**
 * @param {object} [o]
 * @param {object} [o.prioridades]  bloco de parâmetros → 'alta' | 'média' | 'baixa' | … (da análise de sensibilidade)
 */
async function exportarQuestionario({ params = P, prioridades = {} } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OAS-SM — validação de face';
  wb.created = new Date(0);
  wb.modified = new Date(0);
  const Q = QP.questoes(params);
  const todas = QP.linhas(params);

  // Apresentação
  const wa = wb.addWorksheet('Apresentação', { pageSetup: PAGINA });
  wa.columns = [{ width: 34 }, { width: 100 }];
  const txt = (a, b, estilo = {}) => {
    const r = wa.addRow([a, b]);
    r.eachCell(c => { c.font = { ...FONTE, ...estilo }; c.alignment = { vertical: 'top', wrapText: true }; });
    return r;
  };
  txt('Operação Atlântico Sul — Segurança Marítima', null, { bold: true, size: 14 }).getCell(1).alignment = { wrapText: false };
  txt('Questionário de validação por especialistas', null, { bold: true, size: 12 }).getCell(1).alignment = { wrapText: false };
  wa.addRow([]);
  txt(null, 'Este questionário colhe a sua experiência profissional para calibrar um jogo de guerra de segurança marítima: patrulha naval, repressão a ilícitos, ameaças híbridas à infraestrutura marítima, apoio interagências e escalada até o conflito aberto, no litoral do 2º ao 5º Distrito Naval.');
  txt(null, 'Para cada item, a coluna "Hipótese atual do modelo" mostra o valor adotado até agora, escolhido sem base em dados. Diga se concorda e, se não, dê a sua estimativa. Não há resposta certa: interessa a sua avaliação profissional e o fundamento dela.');
  wa.addRow([]);
  txt('Como responder', null, { bold: true });
  [
    'Responda nas células amarelas. As demais são referência.',
    '"Concorda?": sim, não ou não sei. Se não concorda, escreva "Sua estimativa" na unidade indicada. Se concorda, deixe a estimativa em branco.',
    'Números com vírgula ou ponto (0,85). Onde houver lista, escolha uma opção.',
    'Questões em que se pede para distribuir 100% (fontes de dados, modos de ação, tipos de embarcação): as estimativas do grupo podem não somar exatamente 100 — o valor relativo é o que conta.',
    'Em "Fundamento", indique a base da resposta (experiência em comissão, doutrina, estatísticas, exercícios). Em "Confiança": baixa = palpite informado; média = experiência direta; alta = dado documentado.',
    'Responda só o que estiver no seu campo de experiência. Itens em branco mantêm a hipótese atual. Com pouco tempo, comece pelos de prioridade "alta": são os que mais mudam os resultados do jogo.',
    'A aba "Questões abertas" pede comentários livres; a aba "Meios e infraestrutura" lista o que o jogo considera, para consulta.',
  ].forEach((s, i) => txt(`${i + 1}.`, s));
  wa.addRow([]);
  const leg = txt('Legenda', 'Célula amarela = a preencher.', { bold: true });
  leg.getCell(2).fill = AMARELO;
  leg.getCell(2).font = FONTE;
  wa.addRow([]);
  txt('Dados do respondente', null, { bold: true });
  for (const rot of Object.keys(DADOS_RESPONDENTE)) {
    const r = txt(rot, null);
    r.getCell(2).fill = AMARELO;
    r.getCell(2).border = BORDA;
  }

  // Questionário
  const wq = wb.addWorksheet('Questionário', { pageSetup: { ...PAGINA, printTitlesRow: '1:1' } });
  cabecalho(wq, COLS);
  linha(wq, COLS, { n: 'EXEMPLO', tema: 'Desempenho dos meios', prioridade: 'alta', pergunta: 'Detecção do contato', hipotese: 85, unidade: '%',
    concorda: 'não', estimativa: 75, fundamento: 'Comissões em NPaOc, 2019–2023 (exemplo)', confianca: 'média',
    observacoes: 'Exemplo de preenchimento: esta linha é ignorada.' }, { estilo: 'exemplo' });
  for (const x of Q.filter(x => x.linhas.some(l => l.conv !== 'manual'))) {
    const pq = QP.prioridadeDe(x.linhas, prioridades);
    linha(wq, COLS, { n: x.id, tema: x.tema, prioridade: pq, pergunta: `${x.titulo}. ${x.pergunta}` }, { estilo: 'questao' });
    for (const l of x.linhas) {
      const h = QP.hipotese(l, params, todas);
      linha(wq, COLS, { n: l.id, tema: x.tema, prioridade: QP.prioridadeDe([l], prioridades), pergunta: l.item, hipotese: exibir(h),
        unidade: l.conv === 'categoria' ? 'escolha uma opção' : (l.unidade ?? QP.CONVERSOES[l.conv].unidade) },
        { lista: l.conv === 'categoria' ? Object.keys(l.opcoes) : null });
    }
  }
  wq.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };

  // Questões abertas
  const wo = wb.addWorksheet('Questões abertas', { pageSetup: { ...PAGINA, printTitlesRow: '1:1' } });
  cabecalho(wo, COLS_ABERTAS);
  for (const x of Q.filter(x => x.linhas.every(l => l.conv === 'manual'))) linha(wo, COLS_ABERTAS, { n: x.id, titulo: x.titulo, pergunta: x.pergunta });

  // Meios e infraestrutura (consulta)
  const wm = wb.addWorksheet('Meios e infraestrutura', { pageSetup: PAGINA });
  wm.columns = [{ width: 32 }, { width: 30 }, { width: 26 }, { width: 28 }];
  const titulo = t => { const r = wm.addRow([t]); r.getCell(1).font = { ...FONTE, bold: true }; };
  const tab = (cab, linhas) => {
    const h = wm.addRow(cab);
    h.eachCell(c => { c.font = { ...FONTE, bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = CABECALHO; c.border = BORDA; });
    for (const l of linhas) { const r = wm.addRow(l); r.eachCell(c => { c.font = FONTE; c.border = BORDA; }); }
    wm.addRow([]);
  };
  const MI = QP.meiosEInfra();
  titulo('Meios considerados, por comando (os da última coluna só existem quando a capacidade está em avaliação)');
  tab(['Comando', 'Meio', 'Classe / tipo', 'Capacidade em avaliação'], MI.meios.map(m => [m.comando, m.meio, m.classe, m.capacidade_em_avaliacao]));
  titulo('Bases de operação');
  tab(['Base'], MI.bases.map(b => [b]));
  titulo('Infraestrutura crítica (importância relativa: 1 = menor)');
  tab(['Instalação', 'Tipo', 'Importância relativa'], MI.infra.map(i => [i.nome, i.tipo, i.importancia]));

  return zerarDatasZip(Buffer.from(await wb.xlsx.writeBuffer()));
}

// ─── Importar ────────────────────────────────────────────────────────────────

function bruto(cel) {
  const v = cel?.value;
  if (v == null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('');
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
  }
  return v;
}
const vazio = v => v == null || (typeof v === 'string' && v.trim() === '');
function numero(x) {
  if (typeof x === 'number') return x;
  const s = String(x).trim().replace(/\s/g, '').replace('%', '');
  return Number(/^-?\d+(,\d+)?$/.test(s) ? s.replace(',', '.') : s);
}

function colunas(ws, cols) {
  const idx = {};
  ws.getRow(1).eachCell((c, n) => { const col = cols.find(x => x.titulo === String(bruto(c)).trim()); if (col) idx[col.chave] = n; });
  const faltam = cols.filter(c => !(c.chave in idx)).map(c => c.titulo);
  if (faltam.length) throw new Error(`Aba "${ws.name}": colunas ausentes: ${faltam.join(', ')}.`);
  return idx;
}

/**
 * Lê a planilha respondida e converte as estimativas em sobrescrita de
 * parâmetros, pelo rastreamento de questionario_profissional.js.
 * @returns {Promise<{ sobrescrita, propostas: number, erros: string[], discordaSemEstimativa: string[] }>}
 */
async function importarQuestionario(buffer, params = P) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const aba = n => { const w = wb.getWorksheet(n); if (!w) throw new Error(`Aba "${n}" não encontrada.`); return w; };
  const porId = Object.fromEntries(QP.linhas(params).map(l => [l.id, l]));

  const meta = {};
  aba('Apresentação').eachRow(r => {
    const k = DADOS_RESPONDENTE[String(bruto(r.getCell(1)) ?? '').trim()];
    if (k && !vazio(bruto(r.getCell(2)))) meta[k] = String(bruto(r.getCell(2))).trim();
  });

  const respostas = {}, avaliacoes = [], erros = [], discorda = [];
  const wq = aba('Questionário');
  const ic = colunas(wq, COLS);
  wq.eachRow((r, n) => {
    if (n === 1) return;
    const id = String(bruto(r.getCell(ic.n)) ?? '').trim();
    const l = porId[id];
    if (!l || l.conv === 'manual') return;
    const val = k => { const v = bruto(r.getCell(ic[k])); return vazio(v) ? null : v; };
    const a = { id, item: l.item, concorda: val('concorda'), estimativa: val('estimativa'), fundamento: val('fundamento'), confianca: val('confianca'), observacoes: val('observacoes') };
    if (Object.values(a).slice(2).every(v => v == null)) return;
    avaliacoes.push(Object.fromEntries(Object.entries(a).filter(([, v]) => v != null)));
    if (a.estimativa == null) { if (String(a.concorda).trim() === 'não') discorda.push(id); return; }
    if (l.conv === 'categoria') respostas[id] = String(a.estimativa).trim();
    else {
      const x = numero(a.estimativa);
      if (!Number.isFinite(x)) { erros.push(`${id} (linha ${n}): "${a.estimativa}" não é número`); return; }
      respostas[id] = x;
    }
  });

  const abertas = [];
  const wo = aba('Questões abertas');
  const io = colunas(wo, COLS_ABERTAS);
  wo.eachRow((r, n) => {
    if (n === 1) return;
    const resp = bruto(r.getCell(io.resposta));
    if (vazio(resp)) return;
    const id = String(bruto(r.getCell(io.n)) ?? '').trim();
    abertas.push({ id, tema: bruto(r.getCell(io.titulo)), resposta: String(resp),
      ...(vazio(bruto(r.getCell(io.confianca))) ? {} : { confianca: bruto(r.getCell(io.confianca)) }) });
  });

  const conv = QP.converterRespostas(respostas, params);
  erros.push(...conv.erros);
  const sobrescrita = {
    ...meta,
    _gerado_por: 'scripts/sm_questionario_importar.js (rastreamento: docs/sm/validacao_face/rastreamento.json)',
    ...(avaliacoes.length ? { _avaliacoes: avaliacoes } : {}),
    ...(discorda.length ? { _discorda_sem_estimativa: discorda } : {}),
    ...(abertas.length ? { _questoes_abertas: abertas } : {}),
    ...conv.sobrescrita,
  };
  if (!erros.length) SO.aplicarSobrescritas(sobrescrita, params);
  return { sobrescrita, propostas: Object.keys(respostas).length, erros, discordaSemEstimativa: discorda };
}

module.exports = { exportarQuestionario, importarQuestionario, COLS, COLS_ABERTAS };
