'use strict';

/**
 * questionario_xlsx.js — Questionário de validação de face em planilha (.xlsx)
 * e importação da planilha preenchida (SM-10/SM-11).
 *
 * O questionário em Markdown (docs/sm/validacao_face/questionario.md) serve à
 * leitura no repositório; esta planilha serve à revisão fora dele: o
 * especialista edita as células amarelas e a planilha volta ao modelo como
 * JSON de sobrescrita (sobrescrita.js), sem edição de código:
 *
 *   node scripts/sm_questionario_importar.js preenchido.xlsx revisado.json
 *   node scripts/sm_lote.js --params revisado.json
 *
 * Abas: Instruções (com os dados do revisor), Coerência, Parâmetros (uma linha
 * por valor de parâmetro), Blocos (um por bloco, inclusive os estruturais,
 * que se corrigem no código).
 */

const ExcelJS = require('exceljs');
const { PARAMS: P } = require('./params');
const SO = require('./sobrescrita');
const { zerarDatasZip } = require('../ob_spreadsheet');

const FONTE = { name: 'Arial', size: 10 };
const AMARELO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
const CABECALHO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1E3A' } };
const CINZA = { argb: 'FF808080' };
const BORDA = { top: { style: 'thin', color: { argb: 'FFBFBFBF' } }, bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
                left: { style: 'thin', color: { argb: 'FFBFBFBF' } }, right: { style: 'thin', color: { argb: 'FFBFBFBF' } } };
const LISTA_PLAUSIVEL = ['sim', 'não', 'não sei'];
const LISTA_CONFIANCA = ['baixa', 'média', 'alta'];
const ROTULOS_REVISOR = ['Revisor', 'Função / organização', 'Data (AAAA-MM-DD)', 'Fontes gerais'];
const CHAVE_REVISOR = { Revisor: '_revisor', 'Função / organização': '_funcao', 'Data (AAAA-MM-DD)': '_data', 'Fontes gerais': '_fonte' };

const COLS_PARAM = [
  { chave: 'item', titulo: 'Item', largura: 10 },
  { chave: 'bloco', titulo: 'Bloco', largura: 24 },
  { chave: 'caminho', titulo: 'Parâmetro (caminho)', largura: 46 },
  { chave: 'prioridade', titulo: 'Prioridade', largura: 11 },
  { chave: 'atual', titulo: 'Valor atual', largura: 22 },
  { chave: 'plausivel', titulo: 'Plausível?', largura: 11, entrada: true, lista: LISTA_PLAUSIVEL },
  { chave: 'proposto', titulo: 'Valor proposto', largura: 18, entrada: true },
  { chave: 'fonte', titulo: 'Fonte / justificativa', largura: 40, entrada: true },
  { chave: 'confianca', titulo: 'Confiança', largura: 11, entrada: true, lista: LISTA_CONFIANCA },
  { chave: 'comentario', titulo: 'Comentário', largura: 40, entrada: true },
];
const COLS_BLOCO = [
  { chave: 'item', titulo: 'Item', largura: 7 },
  { chave: 'bloco', titulo: 'Bloco', largura: 24 },
  { chave: 'secao', titulo: 'Seção', largura: 32 },
  { chave: 'prioridade', titulo: 'Prioridade', largura: 11 },
  { chave: 'motivo', titulo: 'Motivo da prioridade', largura: 40 },
  { chave: 'descricao', titulo: 'Descrição', largura: 70 },
  { chave: 'alteracao', titulo: 'Como alterar', largura: 22 },
  { chave: 'plausivel', titulo: 'Plausível?', largura: 11, entrada: true, lista: LISTA_PLAUSIVEL },
  { chave: 'correcoes', titulo: 'Correções propostas / comentário geral', largura: 50, entrada: true },
  { chave: 'confianca', titulo: 'Confiança', largura: 11, entrada: true, lista: LISTA_CONFIANCA },
];
const COLS_COER = [
  { chave: 'n', titulo: '#', largura: 5 },
  { chave: 'questao', titulo: 'Questão', largura: 90 },
  { chave: 'resposta', titulo: 'Resposta', largura: 60, entrada: true },
  { chave: 'confianca', titulo: 'Confiança', largura: 11, entrada: true, lista: LISTA_CONFIANCA },
];

const semMarkdown = s => String(s ?? '').replace(/\*\*/g, '').replace(/`/g, '');
const tipo = v => (Array.isArray(v) ? 'lista' : v === null ? 'nulo' : typeof v);

/** Valores folha de um bloco: objetos descem; listas e primitivos são folhas. Rótulos de exibição ficam de fora. */
function folhas(v, caminho) {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return [[caminho, v]];
  return Object.entries(v).filter(([k]) => k !== 'rotulo').flatMap(([k, x]) => folhas(x, `${caminho}.${k}`));
}

const PAGINA = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

/** Texto de uma lista na planilha: números e textos separados por "; "; objetos em JSON. */
function listaParaTexto(v) {
  if (v.some(x => x !== null && typeof x === 'object')) return JSON.stringify(v);
  return v.map(x => (typeof x === 'number' ? String(x).replace('.', ',') : String(x))).join('; ');
}

function valorParaCelula(v) {
  if (Array.isArray(v)) return listaParaTexto(v);
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return v;
}

/** Valor bruto de uma célula do exceljs (texto rico, fórmula, hiperlink). */
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

function numero(x, caminho) {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  const s = String(x).trim().replace(/\s/g, '');
  const n = Number(/^-?\d+(,\d+)?$/.test(s) ? s.replace(',', '.') : s);
  if (!Number.isFinite(n)) throw new Error(`"${x}" não é número (${caminho})`);
  return n;
}

/** Converte o texto proposto no tipo do valor atual. */
function converter(x, atual, caminho) {
  const t = tipo(atual);
  if (t === 'number') return numero(x, caminho);
  if (t === 'boolean') {
    const s = String(x).trim().toLowerCase();
    if (['sim', 'true', 'verdadeiro', '1'].includes(s)) return true;
    if (['não', 'nao', 'false', 'falso', '0'].includes(s)) return false;
    throw new Error(`"${x}" não é sim/não (${caminho})`);
  }
  if (t === 'lista') {
    const s = String(x).trim();
    if (s.startsWith('[')) return JSON.parse(s);
    const partes = s.split(';').map(p => p.trim()).filter(Boolean);
    const elem = atual.length ? typeof atual[0] : 'number';
    return partes.map(p => (elem === 'number' ? numero(p, caminho) : p));
  }
  if (t === 'object') return JSON.parse(String(x));
  return String(x);
}

function mesclarObj(a, b) {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] ? mesclarObj(a[k], v) : v;
  return a;
}

// ─── Exportar ────────────────────────────────────────────────────────────────

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

function linha(ws, cols, dados, { exemplo = false } = {}) {
  const r = ws.addRow(cols.map(c => dados[c.chave] ?? null));
  cols.forEach((c, i) => {
    const cel = r.getCell(i + 1);
    cel.font = exemplo ? { ...FONTE, italic: true, color: CINZA } : FONTE;
    cel.alignment = { vertical: 'top', wrapText: true };
    cel.border = BORDA;
    if (c.entrada) cel.fill = AMARELO;
    if (c.lista) cel.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${c.lista.join(',')}"`],
      showErrorMessage: true, errorTitle: c.titulo, error: `Escolha: ${c.lista.join(', ')}.` };
  });
  return r;
}

/**
 * @param {object} q
 * @param {object[]} q.itens      blocos do questionário (sm_validacao_face.js): {nome, secao, arquivo,
 *                                comentario, nota, valor, json, prio: {nivel, detalhe}}
 * @param {string[]} q.coerencia  questões de coerência (Markdown simples)
 * @param {string} [q.origem]     de onde vieram as prioridades
 * @returns {Promise<Buffer>}
 */
async function exportarQuestionario({ itens, coerencia, origem = '' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OAS-SM — validação de face';
  wb.created = new Date(0);
  wb.modified = new Date(0);

  // Instruções
  const wi = wb.addWorksheet('Instruções', { pageSetup: PAGINA });
  wi.columns = [{ width: 28 }, { width: 100 }];
  const txt = (a, b, estilo = {}) => {
    const r = wi.addRow([a, b]);
    r.eachCell(c => { c.font = { ...FONTE, ...estilo }; c.alignment = { vertical: 'top', wrapText: true }; });
    return r;
  };
  txt('OAS-SM — Questionário de validação de face', null, { bold: true, size: 14 }).getCell(1).alignment = { vertical: 'top', wrapText: false };
  txt(null, 'Revisão por especialistas dos parâmetros de projeto da variante de Segurança Marítima. Todos os valores são placeholders, escolhidos para que o modelo funcione, não a partir de dados. Nada do que o lote produz deve ser usado analiticamente antes desta revisão.');
  txt(null, origem);
  wi.addRow([]);
  txt('Como preencher', null, { bold: true });
  [
    'Preencha só as células amarelas. As demais são referência e não são lidas na importação.',
    'Aba Parâmetros: uma linha por valor. Marque "Plausível?" e, se não for, escreva o "Valor proposto", a fonte ou o raciocínio e a confiança (baixa = palpite informado; média = experiência direta; alta = dado documentado).',
    'Formato do valor proposto: o mesmo do valor atual. Números com vírgula ou ponto (0,85). Listas separadas por ponto e vírgula (0,05; 0,1; 0,2). Listas de objetos em JSON, como no valor atual. Sim/não para verdadeiro/falso.',
    'Valor proposto em branco = o valor atual fica. A linha EXEMPLO (cinza) mostra o formato e é ignorada.',
    'Comece pela prioridade "alta": esses valores mudam as métricas em mais de um desvio-padrão ou mudam a conclusão principal do lote. Use o filtro do cabeçalho para ordenar ou filtrar.',
    'Aba Coerência: questões sobre o modelo que pedem decisão antes dos valores. Aba Blocos: descrição de cada bloco; os blocos "estrutural" (ordem de batalha, bases, infraestrutura) se corrigem no código — descreva a correção ali.',
    'Aplicar: node scripts/sm_questionario_importar.js preenchido.xlsx revisado.json gera o JSON de sobrescrita (com o revisor, as respostas e os comentários como metadados); node scripts/sm_lote.js --params revisado.json roda o lote com os valores revisados.',
  ].forEach((s, i) => txt(`${i + 1}.`, s));
  wi.addRow([]);
  const leg = txt('Legenda', 'Célula amarela = a preencher.', { bold: true });
  leg.getCell(2).fill = AMARELO;
  leg.getCell(2).font = FONTE;
  wi.addRow([]);
  txt('Dados do revisor', null, { bold: true });
  for (const r of ROTULOS_REVISOR) {
    const row = txt(r, null);
    row.getCell(2).fill = AMARELO;
    row.getCell(2).border = BORDA;
  }

  // Coerência
  const wc = wb.addWorksheet('Coerência', { pageSetup: PAGINA });
  cabecalho(wc, COLS_COER);
  coerencia.forEach((q, i) => linha(wc, COLS_COER, { n: i + 1, questao: semMarkdown(q) }));

  // Parâmetros
  const wp = wb.addWorksheet('Parâmetros', { pageSetup: { ...PAGINA, printTitlesRow: '1:1' } });
  cabecalho(wp, COLS_PARAM);
  linha(wp, COLS_PARAM, { item: 'EXEMPLO', bloco: 'P_BASE', caminho: 'P_BASE.deteccao', prioridade: 'alta', atual: 0.85,
    plausivel: 'não', proposto: 0.8, fonte: 'Relatórios de patrulha 2019–2023 (exemplo)', confianca: 'média',
    comentario: 'Exemplo de preenchimento: esta linha é ignorada na importação.' }, { exemplo: true });
  itens.forEach((b, i) => {
    if (!b.json) return;
    folhas(b.valor, b.nome).forEach(([caminho, v], k) => {
      const r = linha(wp, COLS_PARAM, { item: i + 1, bloco: b.nome, caminho, prioridade: b.prio.nivel, atual: valorParaCelula(v) });
      if (k === 0 && b.comentario) r.getCell(2).note = semMarkdown(b.comentario).slice(0, 1500);
    });
  });
  wp.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS_PARAM.length } };

  // Blocos
  const wbk = wb.addWorksheet('Blocos', { pageSetup: { ...PAGINA, printTitlesRow: '1:1' } });
  cabecalho(wbk, COLS_BLOCO);
  itens.forEach((b, i) => linha(wbk, COLS_BLOCO, {
    item: i + 1, bloco: b.nome, secao: b.secao, prioridade: b.prio.nivel, motivo: b.prio.detalhe || null,
    descricao: [semMarkdown(b.comentario), b.nota ? `Foco da revisão: ${b.nota}.` : ''].filter(Boolean).join(' ') || null,
    alteracao: b.json ? 'aba Parâmetros' : `no código (${b.arquivo})`,
  }));
  wbk.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS_BLOCO.length } };

  return zerarDatasZip(Buffer.from(await wb.xlsx.writeBuffer()));
}

// ─── Importar ────────────────────────────────────────────────────────────────

function porCabecalho(ws, cols) {
  const idx = {};
  ws.getRow(1).eachCell((c, n) => { const col = cols.find(x => x.titulo === String(bruto(c)).trim()); if (col) idx[col.chave] = n; });
  const faltam = cols.filter(c => !(c.chave in idx)).map(c => c.titulo);
  if (faltam.length) throw new Error(`Aba "${ws.name}": colunas ausentes: ${faltam.join(', ')}.`);
  return idx;
}

/**
 * Lê a planilha preenchida e devolve a sobrescrita para sobrescrita.js.
 * @param {Buffer} buffer
 * @returns {Promise<{ sobrescrita: object, propostas: number, erros: string[] }>}
 *   `sobrescrita` traz os valores propostos e, em chaves "_", o revisor, as
 *   respostas de coerência, as avaliações por parâmetro e os comentários dos blocos.
 */
async function importarQuestionario(buffer, base = P) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const aba = n => { const w = wb.getWorksheet(n); if (!w) throw new Error(`Aba "${n}" não encontrada.`); return w; };
  const meta = {};
  aba('Instruções').eachRow(r => {
    const rot = String(bruto(r.getCell(1)) ?? '').trim();
    if (CHAVE_REVISOR[rot] && !vazio(bruto(r.getCell(2)))) meta[CHAVE_REVISOR[rot]] = String(bruto(r.getCell(2))).trim();
  });

  const erros = [];
  const over = {};
  const revisao = [];
  let propostas = 0;
  const wp = aba('Parâmetros');
  const ip = porCabecalho(wp, COLS_PARAM);
  wp.eachRow((r, n) => {
    if (n === 1) return;
    const item = bruto(r.getCell(ip.item));
    if (String(item).trim().toUpperCase() === 'EXEMPLO') return;
    const caminho = String(bruto(r.getCell(ip.caminho)) ?? '').trim();
    if (!caminho) return;
    const val = k => { const v = bruto(r.getCell(ip[k])); return vazio(v) ? null : v; };
    const av = { caminho, plausivel: val('plausivel'), proposto: val('proposto'), fonte: val('fonte'), confianca: val('confianca'), comentario: val('comentario') };
    if (Object.values(av).slice(1).every(v => v == null)) return;
    revisao.push(Object.fromEntries(Object.entries(av).filter(([, v]) => v != null)));
    if (av.proposto == null) return;
    const atual = SO.ler(base, caminho);
    if (atual === undefined) { erros.push(`linha ${n}: parâmetro inexistente ${caminho}`); return; }
    try {
      const v = converter(av.proposto, atual, caminho);
      const tentativa = SO.sobrescritaDe(caminho, v);
      SO.aplicarSobrescritas(tentativa, base);       // valida a linha isoladamente
      mesclarObj(over, tentativa);
      propostas++;
    } catch (e) { erros.push(`linha ${n} (${caminho}): ${e.message}`); }
  });

  const coer = [];
  const wc = aba('Coerência');
  const ic = porCabecalho(wc, COLS_COER);
  wc.eachRow((r, n) => {
    if (n === 1) return;
    const resp = bruto(r.getCell(ic.resposta));
    if (vazio(resp)) return;
    coer.push({ n: bruto(r.getCell(ic.n)), questao: String(bruto(r.getCell(ic.questao)) ?? '').slice(0, 120), resposta: String(resp),
                ...(vazio(bruto(r.getCell(ic.confianca))) ? {} : { confianca: bruto(r.getCell(ic.confianca)) }) });
  });

  const blocos = [];
  const wbk = aba('Blocos');
  const ib = porCabecalho(wbk, COLS_BLOCO);
  wbk.eachRow((r, n) => {
    if (n === 1) return;
    const c = { bloco: bruto(r.getCell(ib.bloco)), plausivel: bruto(r.getCell(ib.plausivel)), correcoes: bruto(r.getCell(ib.correcoes)), confianca: bruto(r.getCell(ib.confianca)) };
    if ([c.plausivel, c.correcoes, c.confianca].every(vazio)) return;
    blocos.push(Object.fromEntries(Object.entries(c).filter(([, v]) => !vazio(v))));
  });

  const sobrescrita = {
    ...meta,
    _gerado_por: 'scripts/sm_questionario_importar.js',
    ...(coer.length ? { _coerencia: coer } : {}),
    ...(revisao.length ? { _revisao: revisao } : {}),
    ...(blocos.length ? { _blocos: blocos } : {}),
    ...over,
  };
  if (!erros.length) SO.aplicarSobrescritas(sobrescrita, base);   // o conjunto também é válido
  return { sobrescrita, propostas, erros };
}

module.exports = { exportarQuestionario, importarQuestionario, converter, folhas, COLS_PARAM, COLS_BLOCO, COLS_COER };
