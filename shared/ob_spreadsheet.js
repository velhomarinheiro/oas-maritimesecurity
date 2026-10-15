'use strict';

/**
 * ob_spreadsheet.js — Ordem de batalha ⇄ planilha Excel (.xlsx).
 * ==============================================================
 *
 * EXPORTAR: a OB anotada (shared/scenario.js) vira uma pasta de trabalho com
 *   Unidades     uma linha por unidade, cabeçalho congelado, listas suspensas
 *   Composição   id · tipo · quantidade (várias linhas por unidade; a 1ª define o tipo)
 *   Cenário      limiares das condições de vitória
 *   Instruções   o que cada coluna significa e o que acontece ao incluir/remover
 *   Listas       (oculta) os valores das listas suspensas
 *
 * IMPORTAR: lê a pasta de trabalho de volta num RASCUNHO de OB, com o endereço
 * de cada célula guardado em `_onde` — a validação (scenario.validarOB) usa isso
 * para apontar exatamente a célula a corrigir: "Unidades!J12: movimento deve
 * ser inteiro entre 0 e 20 (veio "quatro")".
 *
 * O arquivo vem do usuário e não é confiável. A leitura:
 *   - confere o zip antes de abri-lo (tamanho descompactado, nº de entradas);
 *   - roda num worker com memória e tempo limitados (ob_xlsx_worker.js);
 *   - mapeia colunas pelo CABEÇALHO, não pela posição — o usuário pode
 *     reordenar colunas sem quebrar nada;
 *   - extrai só valores primitivos: fórmula vale pelo resultado calculado, e
 *     nunca é avaliada; data, erro de célula ou objeto desconhecido viram erro.
 */

const ExcelJS = require('exceljs');
const { FACTOR_KEYS } = require('./capability_factors');
const { OBJECTIVE_THRESHOLDS, OBJECTIVE_LABELS } = require('./objectives');
const { GRID_W, GRID_H, colLetra } = require('./board');
const S = require('./scenario');

// ─── Vocabulário da planilha (português) ↔ códigos do motor ──────────────────

const LADO      = { azul: 'blue', vermelho: 'red' };
const LADO_PT   = { blue: 'azul', red: 'vermelho' };
const CATEG     = { superficie: 'surface', submarino: 'submarine', aereo: 'air', terrestre: 'land', opesp: 'specops' };
const CATEG_PT  = Object.fromEntries(Object.entries(CATEG).map(([pt, en]) => [en, pt]));
const LETRAS    = Array.from({ length: GRID_W }, (_, i) => colLetra(i));
const RANGE_PT  = { surface: 'superficie', air: 'aereo', submarine: 'submarino', land: 'terrestre' };
const CAP_PT    = { navalGun: 'canhao', airDefense: 'defesa_aerea', bmd: 'bmd', asw: 'asw', airAttack: 'ataque_aereo' };
const ALVO_PT   = { carrier: 'alvo_porta_avioes', logistics: 'alvo_logistico', amphib: 'alvo_anfibio',
                    nucsub: 'alvo_sub_nuclear', surface: 'alvo_superficie', fpsos: 'alvo_fpso', ports: 'alvo_porto' };
const LIMIAR_PT = {
  blueLogisticsKills: 'Azul: logísticos vermelhos a neutralizar (nº)',
  blueSurfaceDegPct:  'Azul: degradação dos combatentes de superfície vermelhos (%)',
  redFpsoKills:       'Vermelho: FPSOs a neutralizar (nº)',
  redPortDegPct:      'Vermelho: degradação dos portos azuis (%)',
};

/**
 * Colunas da aba Unidades. A mesma tabela serve para escrever e para ler.
 *   campo  — onde o valor vai no rascunho (e a chave de `_onde`)
 *   tipo   — conversão na leitura
 *   lista  — nome da lista suspensa (aba Listas)
 *   obrig  — cabeçalho obrigatório
 */
const COLUNAS = [
  { titulo: 'lado',         campo: 'lado',         tipo: 'lado',      lista: 'lados',      obrig: true, largura: 9 },
  { titulo: 'id',           campo: 'id',           tipo: 'id',        obrig: true, largura: 16 },
  { titulo: 'nome',         campo: 'name',         tipo: 'texto',     obrig: true, largura: 16 },
  { titulo: 'categoria',    campo: 'category',     tipo: 'categoria', lista: 'categorias', obrig: true, largura: 11 },
  { titulo: 'pacote',       campo: 'pacote',       tipo: 'texto',     lista: 'pacotes',    largura: 10 },
  { titulo: 'grupo',        campo: 'grupo',        tipo: 'texto',     lista: 'grupos',     largura: 9 },
  ...S.ALVOS.map(a => ({ titulo: ALVO_PT[a], campo: `alvo_${a}`, tipo: 'marca', lista: 'marca', largura: 8 })),
  { titulo: 'SP',           campo: 'stayingPower', tipo: 'inteiro',   obrig: true, largura: 5 },
  { titulo: 'movimento',    campo: 'movement',     tipo: 'inteiro',   obrig: true, largura: 10 },
  { titulo: 'coluna',       campo: 'col',          tipo: 'letra',     lista: 'colunas', obrig: true, largura: 7 },
  { titulo: 'linha',        campo: 'row',          tipo: 'inteiro',   obrig: true, largura: 6 },
  ...S.RANGE_KEYS.map(k => ({ titulo: `det_${RANGE_PT[k]}`, campo: `det_${k}`, tipo: 'inteiro', obrig: true, largura: 8 })),
  ...S.RANGE_KEYS.map(k => ({ titulo: `alc_${RANGE_PT[k]}`, campo: `alc_${k}`, tipo: 'inteiro', obrig: true, largura: 8 })),
  ...S.ARMAS.flatMap(a => [
    { titulo: `${a}_qtd`, campo: `${a}_qtd`, tipo: 'inteiro', largura: 8 },
    { titulo: `${a}_alc`, campo: `${a}_alc`, tipo: 'inteiro', largura: 8 },
  ]),
  ...S.CAPACIDADES.map(c => ({ titulo: CAP_PT[c], campo: c, tipo: 'inteiro', largura: 9 })),
  { titulo: 'embarcado_em', campo: 'embarked',     tipo: 'id',        largura: 14 },
  { titulo: 'hospedeiro',   campo: 'hostId',       tipo: 'id',        largura: 14 },
  { titulo: 'furtivo',      campo: 'stealthy',     tipo: 'simnao',    lista: 'simnao', largura: 8 },
  { titulo: 'notas',        campo: 'notes',        tipo: 'texto',     largura: 40 },
];

const LISTAS = {
  lados:      Object.keys(LADO),
  categorias: Object.keys(CATEG),
  pacotes:    FACTOR_KEYS,
  grupos:     [...new Set([...S.GRUPOS.blue, ...S.GRUPOS.red])],
  tipos:      S.TIPOS_COMPOSICAO,
  marca:      ['x'],
  simnao:     ['sim', 'não'],
  colunas:    LETRAS,
};

// Cabeçalho normalizado: minúsculas, sem acento, espaços viram _. É o que
// permite o usuário escrever "Categoria" ou "categoria " sem quebrar a leitura.
const normCab = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toLowerCase().replace(/\s+/g, '_');
const COL_POR_CAB = new Map(COLUNAS.map(c => [normCab(c.titulo), c]));

// ─── Exportar ────────────────────────────────────────────────────────────────

const LINHAS_COM_LISTA = 300;   // linhas com lista suspensa (folga para incluir unidades)

/**
 * Zera a data/hora (formato DOS) de cada entrada do zip do .xlsx. O exceljs
 * grava "agora" em cada entrada, e duas exportações do mesmo conteúdo em
 * segundos diferentes davam arquivos diferentes. Só os campos de data mudam:
 * o CRC e o conteúdo das entradas ficam intactos.
 */
function zerarDatasZip(buf) {
  const DATA_DOS = 0x0021;  // 1980-01-01, a menor data DOS
  // Percorre pelo diretório central (a partir do registro final), que aponta
  // para cada cabeçalho local — nunca varre os dados comprimidos.
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) return buf;
  const n = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    buf.writeUInt16LE(0, p + 12); buf.writeUInt16LE(DATA_DOS, p + 14);
    const local = buf.readUInt32LE(p + 42);
    if (buf.readUInt32LE(local) === 0x04034b50) {
      buf.writeUInt16LE(0, local + 10); buf.writeUInt16LE(DATA_DOS, local + 12);
    }
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return buf;
}

/** @param {object} ob  OB anotada canônica  @returns {Promise<Buffer>} */
async function exportarPlanilha(ob, { nome = 'Ordem de batalha' } = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Operação Atlântico Sul — Simulador Construtivo';
  wb.created = new Date(0);   // fixo: o mesmo conteúdo gera o mesmo arquivo
  wb.modified = new Date(0);  // idem: o exceljs grava "agora" se não fixado

  // Listas (oculta). Criada primeiro para as validações apontarem para ela.
  const wl = wb.addWorksheet('Listas', { state: 'hidden' });
  const refLista = {};
  Object.entries(LISTAS).forEach(([nomeLista, valores], i) => {
    const col = i + 1;
    wl.getCell(1, col).value = nomeLista;
    valores.forEach((v, j) => { wl.getCell(j + 2, col).value = v; });
    const letra = wl.getColumn(col).letter;
    refLista[nomeLista] = `Listas!$${letra}$2:$${letra}$${valores.length + 1}`;
  });

  // ── Unidades ──
  const wu = wb.addWorksheet('Unidades', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  wu.columns = COLUNAS.map(c => ({ header: c.titulo, key: c.campo, width: c.largura }));
  estiloCabecalho(wu.getRow(1));
  for (const side of ['blue', 'red']) {
    for (const u of ob.forces[side]) wu.addRow(linhaDeUnidade(side, u));
  }
  wu.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUNAS.length } };
  COLUNAS.forEach((c, i) => {
    if (!c.lista) return;
    for (let r = 2; r <= LINHAS_COM_LISTA; r++) {
      wu.getCell(r, i + 1).dataValidation = {
        type: 'list', allowBlank: true, formulae: [refLista[c.lista]],
        // 'stop' (e não 'error'): o padrão OOXML só aceita stop/warning/
        // information, e um valor fora dele faz o Excel acusar arquivo danificado.
        showErrorMessage: true, errorStyle: 'stop',
        errorTitle: c.titulo, error: `Escolha um valor da lista (${c.titulo}).`,
      };
    }
  });

  // ── Composição ──
  const wc = wb.addWorksheet('Composição', { views: [{ state: 'frozen', ySplit: 1 }] });
  wc.columns = [
    { header: 'id', key: 'id', width: 16 },
    { header: 'tipo', key: 'tipo', width: 24 },
    { header: 'quantidade', key: 'quantidade', width: 11 },
  ];
  estiloCabecalho(wc.getRow(1));
  for (const side of ['blue', 'red']) {
    for (const u of ob.forces[side]) {
      for (const c of u.composition) wc.addRow({ id: u.id, tipo: c.type, quantidade: c.quantity });
    }
  }
  for (let r = 2; r <= LINHAS_COM_LISTA * 2; r++) {
    wc.getCell(r, 2).dataValidation = {
      type: 'list', allowBlank: true, formulae: [refLista.tipos],
      showErrorMessage: true, errorStyle: 'stop', error: 'Escolha um tipo da lista.',
    };
  }

  // ── Cenário ──
  const wn = wb.addWorksheet('Cenário');
  wn.columns = [
    { header: 'parametro', key: 'parametro', width: 22 },
    { header: 'valor', key: 'valor', width: 8 },
    { header: 'descricao', key: 'descricao', width: 62 },
  ];
  estiloCabecalho(wn.getRow(1));
  for (const k of S.LIMIARES) {
    wn.addRow({ parametro: k, valor: ob.limiares?.[k] ?? OBJECTIVE_THRESHOLDS[k], descricao: LIMIAR_PT[k] });
  }

  // ── Instruções ──
  const wi = wb.addWorksheet('Instruções');
  wi.getColumn(1).width = 110;
  instrucoes(nome).forEach((l, i) => {
    const cell = wi.getCell(i + 1, 1);
    cell.value = l;
    cell.alignment = { wrapText: true, vertical: 'top' };
    if (i === 0 || /^[A-ZÇÃÕÁÉÍÓÚ ]{6,}$/.test(l)) cell.font = { bold: true };
  });

  // Ordem das abas: Instruções primeiro, para quem abre pela primeira vez.
  wb.worksheets.forEach(ws => { ws.orderNo = ({ 'Instruções': 0, Unidades: 1, 'Composição': 2, 'Cenário': 3, Listas: 4 })[ws.name]; });
  return zerarDatasZip(Buffer.from(await wb.xlsx.writeBuffer()));
}

function estiloCabecalho(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A2E55' } };
  row.alignment = { vertical: 'middle' };
}

function linhaDeUnidade(side, u) {
  const r = {
    lado: LADO_PT[side], id: u.id, name: u.name, category: CATEG_PT[u.category],
    pacote: u.pacote || null, grupo: u.grupo || null,
    stayingPower: u.stayingPower, movement: u.movement,
    col: LETRAS[u.position.col], row: u.position.row + 1,
    embarked: u.embarked || null, hostId: u.hostId || null,
    stealthy: u.stealthy ? 'sim' : null, notes: u.notes || null,
  };
  for (const a of S.ALVOS) r[`alvo_${a}`] = (u.alvos || []).includes(a) ? 'x' : null;
  for (const k of S.RANGE_KEYS) { r[`det_${k}`] = u.detectionRange[k]; r[`alc_${k}`] = u.attackRange[k]; }
  for (const a of S.ARMAS) {
    r[`${a}_qtd`] = u.weapons[a] ? u.weapons[a].quantity : null;
    r[`${a}_alc`] = u.weapons[a] ? u.weapons[a].range : null;
  }
  for (const c of S.CAPACIDADES) r[c] = u.capabilities[c] ?? null;
  return r;
}

function instrucoes(nome) {
  return [
    `${nome} — Operação Atlântico Sul`,
    'Esta planilha é a ordem de batalha do simulador construtivo. Edite e carregue de volta em /construtivo → "Carregar planilha".',
    '',
    'REGRAS GERAIS',
    '• Uma linha por unidade na aba Unidades. Células vazias significam "não tem" (arma ausente, sem pacote, etc.).',
    '• As colunas são reconhecidas pelo cabeçalho, não pela posição: pode reordená-las, mas não renomeá-las.',
    '• Não use fórmulas que dependam de outras planilhas; o valor calculado é o que vale. Datas são recusadas.',
    '• id: letras MAIÚSCULAS, dígitos e hífen (até 32). É a identidade da unidade — referências em embarcado_em, hospedeiro e na aba Composição usam o id.',
    '• nome e notas não podem conter os caracteres < > & " `.',
    '',
    'POSIÇÃO',
    `• coluna A–${LETRAS[GRID_W - 1]} e linha 1–${GRID_H}, como no tabuleiro. O terreno precisa ser compatível com a categoria: submarino não entra em águas rasas nem em terra; superfície não entra em terra; terrestre fica em terra ou águas rasas; aéreo e opesp vão a qualquer lugar.`,
    '',
    'PACOTE DE CAPACIDADE (só Força Azul)',
    `• ${FACTOR_KEYS.join(', ')}. A unidade passa a sair da partida quando o pacote está em 0 e a ser duplicada quando está em 2 ou mais — exatamente como as demais do pacote.`,
    '• Vazio = sempre presente (como as FPSOs e os portos).',
    '• Unidade embarcada ou hospedada não tem pacote: ela acompanha o hospedeiro.',
    '• O custo EAC de cada pacote é fixo, definido pelo estudo; incluir unidades num pacote não muda o custo dele.',
    '',
    'GRUPO (Camada 2)',
    '• Grupo-tarefa da unidade, usado nos relatórios de perdas por grupo e, na Força Vermelha, nos controles de composição. Vazio = INFRA.',
    '',
    'ALVOS DAS CONDIÇÕES DE VITÓRIA (marque com x)',
    `• Unidades vermelhas: ${['carrier', 'logistics', 'amphib', 'nucsub', 'surface'].map(a => `${ALVO_PT[a]} (${OBJECTIVE_LABELS[a]})`).join('; ')}.`,
    `• Unidades azuis: ${ALVO_PT.fpsos} e ${ALVO_PT.ports} — também alimentam as métricas E2_vp e E2_sloc.`,
    '• Uma unidade pode ter mais de um alvo (o porta-aviões vermelho é porta-aviões e combatente de superfície).',
    '• Toda condição precisa de ao menos um alvo: uma condição sem alvo seria cumprida automaticamente, e a planilha é recusada.',
    '• Com dois navios marcados como porta-aviões, a condição passa a exigir afundar os dois.',
    '',
    'COMPOSIÇÃO',
    '• Aba Composição: uma linha por tipo de meio, várias linhas por unidade. A PRIMEIRA linha de cada unidade define o tipo de plataforma — e com ele o comportamento do bot (uma unidade cujo 1º item é "fragata" se comporta como fragata).',
    '',
    'ARMAS E CAPACIDADES',
    '• <arma>_qtd e <arma>_alc andam juntos: quantidade sem alcance é recusada. Quantidade 0 é diferente de vazio (0 = a arma existe e está esgotada).',
    '• canhão, defesa aérea, BMD, ASW e ataque aéreo são capacidades numéricas; vazio = não tem.',
    '',
    'CENÁRIO',
    '• Limiares das condições de vitória. Os que são contagens (logísticos, FPSOs) não podem passar do número de unidades marcadas como alvo.',
    '',
    'LIMITES',
    '• Até 150 unidades. Combustível e propulsão nuclear seguem as regras do jogo por tipo de unidade, e não são editáveis nesta versão.',
  ];
}

// ─── Importar ────────────────────────────────────────────────────────────────

const MAX_LINHAS = 500;
const MAX_BYTES  = 1024 * 1024;

/**
 * Confere o zip ANTES de entregar ao exceljs: um .xlsx é um zip, e um zip de
 * 1 MB pode descompactar em gigabytes. Lê o diretório central e soma os
 * tamanhos declarados. Os tamanhos podem mentir — o limite de memória do
 * worker é a proteção de verdade —, mas isto barra o caso comum com uma
 * mensagem clara, sem gastar um worker.
 */
function checarZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) return 'O arquivo está vazio ou não é uma planilha .xlsx.';
  if (buf.length > MAX_BYTES) return `O arquivo tem ${(buf.length / 1024).toFixed(0)} KB; o limite é ${MAX_BYTES / 1024} KB.`;
  if (buf.readUInt32LE(0) !== 0x04034b50) return 'O arquivo não é uma planilha .xlsx (não é um zip).';
  // Fim do diretório central: últimos 22 bytes + comentário de até 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return 'O arquivo .xlsx está corrompido (diretório do zip não encontrado).';
  const entradas = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (entradas > 100) return 'O arquivo tem entradas demais para uma planilha de ordem de batalha.';
  let total = 0;
  for (let n = 0; n < entradas; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) return 'O arquivo .xlsx está corrompido.';
    const comp   = buf.readUInt32LE(off + 20);
    const descomp = buf.readUInt32LE(off + 24);
    if (comp === 0xffffffff || descomp === 0xffffffff) return 'Formato de zip não suportado (ZIP64).';
    total += descomp;
    if (comp > 0 && descomp / comp > 200) return 'O arquivo tem compressão anômala e foi recusado.';
    off += 46 + buf.readUInt16LE(off + 28) + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
  }
  if (total > 20 * 1024 * 1024) return 'O conteúdo descompactado da planilha é grande demais.';
  return null;
}

/**
 * Valor puro de uma célula do exceljs. Devolve { v } ou { erro }.
 * Fórmula vale pelo resultado já calculado pelo Excel — nunca é avaliada aqui.
 */
function valorDaCelula(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return { v: null };
  if (typeof v === 'number' || typeof v === 'boolean') return { v };
  if (typeof v === 'string') return { v: v.normalize('NFC').trim() };
  if (v instanceof Date) return { erro: 'a célula virou data — formate como texto ou número' };
  if (typeof v === 'object') {
    if ('formula' in v || 'sharedFormula' in v) {
      const r = v.result;
      if (r === undefined || r === null) return { erro: 'fórmula sem valor calculado — cole como valor' };
      if (typeof r === 'object') {
        if (r.error) return { erro: `fórmula com erro (${r.error})` };
        return { erro: 'fórmula com resultado não suportado — cole como valor' };
      }
      return typeof r === 'string' ? { v: r.normalize('NFC').trim() } : { v: r };
    }
    if (Array.isArray(v.richText)) return { v: v.richText.map(t => t.text).join('').normalize('NFC').trim() };
    if ('hyperlink' in v) {
      const t = v.text;
      if (t && Array.isArray(t.richText)) return { v: t.richText.map(x => x.text).join('').normalize('NFC').trim() };
      return { v: String(t ?? '').normalize('NFC').trim() };
    }
    if ('error' in v) return { erro: `célula com erro (${v.error})` };
  }
  return { erro: 'conteúdo de célula não suportado' };
}

const vazioV = v => v === null || v === undefined || v === '';

/** Converte o valor bruto pelo tipo da coluna. Devolve { v } ou { erro }. */
function converter(tipo, bruto) {
  if (vazioV(bruto)) return { v: null };
  const s = String(bruto).trim();
  switch (tipo) {
    case 'texto':  return { v: s };
    case 'id':     return { v: s.toUpperCase() };
    case 'inteiro': {
      if (typeof bruto === 'number') return Number.isInteger(bruto) ? { v: bruto } : { erro: `"${bruto}" não é inteiro` };
      if (/^-?\d+$/.test(s)) return { v: Number(s) };
      return { erro: `"${s}" não é um número inteiro` };
    }
    case 'lado': {
      const l = LADO[normCab(s)];
      return l ? { v: l } : { erro: `lado "${s}" inválido — use azul ou vermelho` };
    }
    case 'categoria': {
      const c = CATEG[normCab(s)];
      return c ? { v: c } : { erro: `categoria "${s}" inválida — use ${Object.keys(CATEG).join(', ')}` };
    }
    case 'marca': {
      const n = normCab(s);
      if (['x', 'sim', 's', '1', 'true', 'verdadeiro'].includes(n)) return { v: true };
      if (['nao', 'n', '0', 'false', 'falso'].includes(n)) return { v: false };
      return { erro: `marque com x ou deixe vazio (veio "${s}")` };
    }
    case 'simnao': {
      const n = normCab(s);
      if (['sim', 's', 'x', '1', 'true', 'verdadeiro'].includes(n)) return { v: true };
      if (['nao', 'n', '0', 'false', 'falso'].includes(n)) return { v: false };
      return { erro: `use sim ou não (veio "${s}")` };
    }
    case 'letra': {
      const i = LETRAS.indexOf(s.toUpperCase());
      return i >= 0 ? { v: i } : { erro: `coluna "${s}" inválida — use A a ${LETRAS[LETRAS.length - 1]}` };
    }
    default: return { erro: 'tipo de coluna desconhecido' };
  }
}

/** Aba por nome, ignorando acento e caixa ("Composicao" acha "Composição"). */
function aba(wb, nome) {
  return wb.worksheets.find(ws => normCab(ws.name) === normCab(nome)) || null;
}

/**
 * Lê a pasta de trabalho num rascunho de OB. NÃO valida a semântica — isso é
 * scenario.validarOB, que roda sobre o rascunho, venha ele daqui ou do JSON.
 * Aqui só os erros de leitura e de tipo, cada um com o endereço da célula.
 *
 * @returns {Promise<{ rascunho: object|null, erros: string[], avisos: string[] }>}
 */
async function lerPlanilha(buf) {
  const erros = [], avisos = [];
  const problemaZip = checarZip(buf);
  if (problemaZip) return { rascunho: null, erros: [problemaZip], avisos };

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    return { rascunho: null, erros: ['Não foi possível abrir o arquivo como planilha .xlsx.'], avisos };
  }

  const wu = aba(wb, 'Unidades');
  const wc = aba(wb, 'Composição');
  if (!wu) erros.push('A planilha não tem a aba "Unidades".');
  if (!wc) erros.push('A planilha não tem a aba "Composição".');
  if (erros.length) return { rascunho: null, erros, avisos };

  // ── Cabeçalho da aba Unidades → coluna ──
  const mapa = new Map();      // nº da coluna → definição
  const vistos = new Set();
  wu.getRow(1).eachCell({ includeEmpty: false }, (cell, colNo) => {
    const { v } = valorDaCelula(cell);
    if (vazioV(v)) return;
    const def = COL_POR_CAB.get(normCab(v));
    if (!def) { avisos.push(`Unidades!${cell.address}: coluna "${v}" não reconhecida — ignorada.`); return; }
    if (vistos.has(def.campo)) { erros.push(`Unidades!${cell.address}: coluna "${v}" repetida.`); return; }
    vistos.add(def.campo);
    mapa.set(colNo, def);
  });
  for (const c of COLUNAS) {
    if (c.obrig && !vistos.has(c.campo)) erros.push(`Unidades: falta a coluna obrigatória "${c.titulo}".`);
  }
  if (erros.length) return { rascunho: null, erros, avisos };

  // ── Linhas de unidade ──
  const forces = { blue: [], red: [] };
  const porId = new Map();
  let linhas = 0;
  wu.eachRow({ includeEmpty: false }, (row, rowNo) => {
    if (rowNo === 1) return;
    if (++linhas > MAX_LINHAS) {
      if (linhas === MAX_LINHAS + 1) erros.push(`Unidades: mais de ${MAX_LINHAS} linhas — a leitura parou aqui.`);
      return;
    }
    const bruto = {}, onde = {}, invalido = {};
    let algum = false;
    for (const [colNo, def] of mapa) {
      const cell = row.getCell(colNo);
      if (cell.isMerged && cell.master !== cell) continue;
      const end = `Unidades!${cell.address}`;
      onde[def.campo] = end;
      const lido = valorDaCelula(cell);
      if (lido.erro) { erros.push(`${end}: ${lido.erro}.`); invalido[def.campo] = true; algum = true; continue; }
      if (!vazioV(lido.v)) algum = true;
      const conv = converter(def.tipo, lido.v);
      if (conv.erro) { erros.push(`${end}: ${def.titulo} — ${conv.erro}.`); invalido[def.campo] = true; continue; }
      bruto[def.campo] = conv.v;
    }
    if (!algum) return;                              // linha só com formatação

    const u = montarUnidade(bruto, onde);
    // Campos que a leitura já recusou: a validação não repete o erro.
    u._invalido = { ...invalido, position: invalido.col || invalido.row };
    if (!bruto.lado) { erros.push(`${onde.lado || `Unidades!A${rowNo}`}: lado é obrigatório.`); return; }
    forces[bruto.lado].push(u);
    if (u.id && !porId.has(u.id)) porId.set(u.id, u);
  });

  // ── Composição ──
  let linhasC = 0;
  const cab = {};
  wc.getRow(1).eachCell({ includeEmpty: false }, (cell, colNo) => { cab[normCab(valorDaCelula(cell).v)] = colNo; });
  if (!cab.id || !cab.tipo || !cab.quantidade) {
    erros.push('Composição: as colunas devem ser id, tipo e quantidade.');
  } else {
    wc.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo === 1) return;
      if (++linhasC > MAX_LINHAS * 4) return;
      const ler = (col, tipo) => {
        const cell = row.getCell(col);
        const lido = valorDaCelula(cell);
        if (lido.erro) { erros.push(`Composição!${cell.address}: ${lido.erro}.`); return null; }
        const conv = converter(tipo, lido.v);
        if (conv.erro) { erros.push(`Composição!${cell.address}: ${conv.erro}.`); return null; }
        return conv.v;
      };
      const id   = ler(cab.id, 'id');
      const tipo = ler(cab.tipo, 'texto');
      const qtd  = ler(cab.quantidade, 'inteiro');
      if (vazioV(id) && vazioV(tipo) && vazioV(qtd)) return;
      const end = `Composição!A${rowNo}`;
      const u = porId.get(id);
      if (!u) { erros.push(`${end}: id "${id ?? ''}" não existe na aba Unidades.`); return; }
      u.composition.push({ type: tipo, quantity: qtd, _onde: `Composição!B${rowNo}` });
    });
  }

  // ── Cenário (opcional: ausente = limiares padrão) ──
  const limiares = {}, ondeLim = {};
  const wn = aba(wb, 'Cenário');
  if (wn) {
    wn.eachRow({ includeEmpty: false }, (row, rowNo) => {
      if (rowNo === 1) return;
      const chave = valorDaCelula(row.getCell(1)).v;
      if (vazioV(chave)) return;
      if (!S.LIMIARES.includes(String(chave))) {
        avisos.push(`Cenário!A${rowNo}: parâmetro "${chave}" desconhecido — ignorado.`);
        return;
      }
      const lido = valorDaCelula(row.getCell(2));
      const conv = lido.erro ? lido : converter('inteiro', lido.v);
      if (conv.erro) { erros.push(`Cenário!B${rowNo}: ${conv.erro}.`); return; }
      if (conv.v !== null) { limiares[chave] = conv.v; ondeLim[chave] = `Cenário!B${rowNo}`; }
    });
  } else {
    avisos.push('A planilha não tem a aba "Cenário" — valem os limiares padrão das condições de vitória.');
  }

  return { rascunho: { forces, limiares, _ondeLimiares: ondeLim }, erros, avisos };
}

/** Do registro plano da linha para a forma de unidade do motor (rascunho). */
function montarUnidade(b, onde) {
  const u = {
    id: b.id, name: b.name, category: b.category,
    composition: [],
    stayingPower: b.stayingPower, movement: b.movement,
    detectionRange: Object.fromEntries(S.RANGE_KEYS.map(k => [k, b[`det_${k}`] ?? null])),
    attackRange:    Object.fromEntries(S.RANGE_KEYS.map(k => [k, b[`alc_${k}`] ?? null])),
    weapons: {}, capabilities: {},
    position: { col: b.col, row: vazioV(b.row) ? null : b.row - 1 },
    embarked: b.embarked, hostId: b.hostId,
    stealthy: b.stealthy === true ? true : undefined,
    notes: b.notes, pacote: b.pacote, grupo: b.grupo,
    alvos: S.ALVOS.filter(a => b[`alvo_${a}`] === true),
    _onde: { ...onde, position: onde.col || onde.row, composition: onde.id },
  };
  for (const a of S.ARMAS) {
    const q = b[`${a}_qtd`], r = b[`${a}_alc`];
    if (!vazioV(q) || !vazioV(r)) u.weapons[a] = { quantity: q, range: r };
  }
  for (const c of S.CAPACIDADES) if (!vazioV(b[c])) u.capabilities[c] = b[c];
  // Detecção/alcance vazios contam como 0 — é o que a OB padrão tem em todas
  // as unidades, e o que o motor faria com a chave ausente.
  for (const k of S.RANGE_KEYS) {
    if (u.detectionRange[k] === null) u.detectionRange[k] = 0;
    if (u.attackRange[k] === null) u.attackRange[k] = 0;
  }
  return u;
}

/**
 * lerPlanilha num worker com memória e tempo limitados. É o que o servidor usa
 * para arquivos enviados pelo usuário; os testes podem usar lerPlanilha direto.
 */
function lerPlanilhaIsolada(buf, { timeoutMs = 10000 } = {}) {
  const problemaZip = checarZip(buf);
  if (problemaZip) return Promise.resolve({ rascunho: null, erros: [problemaZip], avisos: [] });

  const { Worker } = require('worker_threads');
  return new Promise(resolve => {
    const w = new Worker(require('path').join(__dirname, 'ob_xlsx_worker.js'), {
      workerData: new Uint8Array(buf),
      resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 48 },
    });
    let fim = false;
    const terminar = r => { if (fim) return; fim = true; clearTimeout(t); w.terminate(); resolve(r); };
    const falha = msg => terminar({ rascunho: null, erros: [msg], avisos: [] });
    const t = setTimeout(() => falha('A leitura da planilha demorou demais e foi interrompida.'), timeoutMs);
    w.on('message', m => (m.ok ? terminar(m.r) : falha('Não foi possível ler a planilha: ' + m.erro)));
    w.on('error', () => falha('A planilha não pôde ser lida (memória ou formato).'));
    w.on('exit', code => { if (code !== 0) falha('A leitura da planilha foi interrompida.'); });
  });
}

module.exports = { exportarPlanilha, lerPlanilha, lerPlanilhaIsolada, checarZip, valorDaCelula, converter,
                   COLUNAS, LISTAS, MAX_BYTES, zerarDatasZip };
