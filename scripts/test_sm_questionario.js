'use strict';
/**
 * test_sm_questionario.js — Questionário de validação em linguagem
 * profissional (SM-11): nada técnico chega ao respondente; todo parâmetro a
 * validar está coberto por uma pergunta (ou declarado decisão de projeto); a
 * hipótese mostrada é o valor atual convertido; responder a hipótese é
 * neutro; as respostas voltam ao modelo pelo rastreamento.
 *
 * Uso: node scripts/test_sm_questionario.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { PARAMS: P } = require('../shared/sm/params');
const QP = require('../shared/sm/questionario_profissional');
const QX = require('../shared/sm/questionario_xlsx');
const SO = require('../shared/sm/sobrescrita');
const R = require('../shared/sm/runner');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}
const perto = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// ─── Catálogo e rastreamento ──────────────────────────────────────────────────
const linhas = QP.linhas();
{
  const ids = linhas.map(l => l.id);
  ok(new Set(ids).size === ids.length, `identificadores únicos (${QP.questoes().length} questões, ${ids.length} itens)`);
  ok(linhas.every(l => QP.CONVERSOES[l.conv]), 'toda linha tem regra de conversão conhecida');
  ok(linhas.filter(l => l.conv !== 'manual').every(l => QP.alvos(l).every(c => SO.ler(P, c) !== undefined)), 'todo parâmetro rastreado existe no modelo');
  ok(linhas.filter(l => l.ref).every(l => ids.includes(l.ref)), 'referências entre linhas resolvem');

  // Cobertura: toda folha numérica dos blocos marcados para validação.
  const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'sm', 'params.js'), 'utf8').split('\n');
  const blocos = [];
  src.forEach((l, i) => { if (/TODO: validar com especialista/.test(l)) { const m = src.slice(i + 1).find(x => /^const [A-Z]/.test(x)); if (m) blocos.push(m.match(/^const ([A-Z0-9_]+)/)[1]); } });
  const folhas = [];
  (function rec(o, c) {
    if (typeof o === 'number') { folhas.push(c); return; }
    if (Array.isArray(o)) { if (o.every(x => typeof x === 'number')) o.forEach((_, i) => folhas.push(`${c}.${i}`)); return; }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) rec(v, c ? `${c}.${k}` : k);
  })(Object.fromEntries(blocos.filter(b => b in P).map(b => [b, P[b]])), '');
  const mapeados = linhas.flatMap(QP.alvos);
  const fora = folhas.filter(f => !mapeados.some(m => f === m || f.startsWith(`${m}.`)) && !QP.DECISOES_PROJETO.some(d => f === d.prefixo || f.startsWith(`${d.prefixo}.`)));
  ok(fora.length === 0, `cobertura: ${folhas.length} valores de ${blocos.length} blocos a validar, cada um numa pergunta ou declarado decisão de projeto` + (fora.length ? ` (faltam: ${fora.join(', ')})` : ''));
  const ra = QP.rastreamento();
  ok(ra.itens.length === linhas.length && ra.itens.every(i => i.regra && i.conversao), 'rastreamento: uma entrada por item, com parâmetro e regra');
  const arq = path.join(__dirname, '..', 'docs', 'sm', 'validacao_face', 'rastreamento.json');
  if (fs.existsSync(arq)) {
    const salvo = JSON.parse(fs.readFileSync(arq, 'utf8'));
    ok(JSON.stringify(salvo.itens.map(i => [i.id, i.parametros])) === JSON.stringify(ra.itens.map(i => [i.id, i.parametros])),
       'rastreamento.json versionado está em dia com o catálogo (npm run sm:validacao)');
  }
}

// ─── Hipótese = valor atual; responder a hipótese é neutro ────────────────────
{
  const resp = {};
  for (const l of linhas) { const h = QP.hipotese(l); if (h != null) resp[l.id] = h; }
  const r = QP.converterRespostas(resp);
  const m = SO.aplicarSobrescritas(r.sobrescrita);
  const difs = linhas.filter(l => l.conv !== 'manual').flatMap(QP.alvos).filter(c => {
    const a = SO.ler(P, c), b = SO.ler(m, c);
    return typeof a === 'number' ? !perto(a, b) : a !== b;
  });
  ok(r.erros.length === 0 && difs.length === 0, 'responder exatamente a hipótese de cada item devolve os valores atuais (ida e volta exata)');
}

// ─── Planilha ─────────────────────────────────────────────────────────────────
const textos = async buf => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const t = [];
  wb.eachSheet(ws => ws.eachRow(r => r.eachCell(c => { if (typeof c.value === 'string') t.push(c.value); })));
  return { wb, t };
};
async function preencher(buf, editar) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  editar(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const col = t => QX.COLS.findIndex(c => c.titulo === t) + 1;
function linhaDe(ws, id) { let n = null; ws.eachRow((r, i) => { if (r.getCell(1).value === id) n = i; }); return ws.getRow(n); }
const responder = (ws, id, est, extra = {}) => {
  const r = linhaDe(ws, id);
  r.getCell(col('Sua estimativa')).value = est;
  for (const [k, v] of Object.entries(extra)) r.getCell(col(k)).value = v;
};

(async () => {
  const a = await QX.exportarQuestionario({ prioridades: { P_BASE: 'alta' } });
  const b = await QX.exportarQuestionario({ prioridades: { P_BASE: 'alta' } });
  ok(a.equals(b), 'exportação determinística');
  const { wb, t } = await textos(a);
  ok(['Apresentação', 'Questionário', 'Questões abertas', 'Meios e infraestrutura'].every(n => wb.getWorksheet(n)), 'abas Apresentação, Questionário, Questões abertas, Meios e infraestrutura');
  const blocosP = Object.keys(P);
  const tecnico = t.filter(s => blocosP.some(k => s.includes(k)) || /\b[a-z]+_[a-z_]+\b/.test(s) || /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/.test(s) ||
    /params|sobrescrita|placeholder|turno|E[1-6]_|\bN[0-3]\b/.test(s));
  ok(tecnico.length === 0, 'nenhum nome de parâmetro ou termo do código na planilha' + (tecnico.length ? `: ${tecnico.slice(0, 3).join(' | ')}` : ''));
  const wq = wb.getWorksheet('Questionário');
  ok(linhaDe(wq, 'B1.1').getCell(col('Hipótese atual do modelo')).value === 85 && linhaDe(wq, 'B1.1').getCell(col('Prioridade')).value === 'alta',
     'a hipótese aparece na unidade profissional (85% de êxito na detecção), com a prioridade');
  ok(linhaDe(wq, 'E4.1').getCell(col('Sua estimativa')).dataValidation?.type === 'list', 'itens de escolha têm lista suspensa');
  const amarelo = c => c.fill?.fgColor?.argb === 'FFFFFF00';
  ok(amarelo(linhaDe(wq, 'B1.1').getCell(col('Sua estimativa'))) && !amarelo(linhaDe(wq, 'B1.1').getCell(col('Hipótese atual do modelo'))), 'só as células a preencher são amarelas');

  const vazio = await QX.importarQuestionario(a);
  ok(vazio.propostas === 0 && vazio.erros.length === 0, 'planilha sem respostas: nenhuma proposta');

  const cheio = await preencher(a, w => {
    const ws = w.getWorksheet('Questionário');
    responder(ws, 'B1.1', '75', { 'Concorda?': 'não', 'Fundamento / experiência': 'Comissões em NPaOc', 'Confiança': 'média' });
    responder(ws, 'A1.1', 40);                       // participação: o grupo é reescalado
    responder(ws, 'E4.1', 'inspeção');               // escolha
    responder(ws, 'A5.2', '70');                     // diferença em relação a A5.1 (não respondida: usa a hipótese)
    responder(ws, 'F1.3', '50');                     // chance em um mês → por dia
    responder(ws, 'J1.2', 6);                        // fórmula com referência
    responder(ws, 'I4.4', 40);                       // escala de gravidade
    linhaDe(ws, 'D2.1').getCell(col('Concorda?')).value = 'não';   // discorda sem estimativa
    const wa = w.getWorksheet('Apresentação');
    wa.eachRow(r => { if (r.getCell(1).value === 'Nome') r.getCell(2).value = 'CMG (RM1) Fulano'; });
    linhaDe(w.getWorksheet('Questões abertas'), 'O2').getCell(4).value = 'Falta um NPaOc no 5º DN.';
  });
  const imp = await QX.importarQuestionario(cheio);
  const s = imp.sobrescrita;
  const m = SO.aplicarSobrescritas(s);
  ok(imp.erros.length === 0 && imp.propostas === 7, `7 estimativas importadas (${imp.erros.join('; ')})`);
  ok(perto(m.P_BASE.deteccao, 0.75), 'percentual: 75% de êxito → 0,75');
  const somaF = o => Object.values(o.FONTES).reduce((x, f) => x + f.peso, 0);
  ok(perto(somaF(m), somaF(P)) && m.FONTES.ais.peso > P.FONTES.ais.peso && m.FONTES.preps.peso < P.FONTES.preps.peso,
     'participações: o grupo é reescalado e a soma se mantém');
  ok(m.TIPOS_OCORRENCIA.narcotrafico.etapaRepressao === 'inspecao', 'escolha → valor da tabela de opções');
  ok(perto(m.DOUTRINA.quadro.base, P.DOUTRINA.quadro.base) && perto(m.DOUTRINA.quadro.porFusao, 0.70 - P.DOUTRINA.quadro.base),
     'diferença: integração plena 70% com mínima mantida → acréscimo 0,45');
  ok(perto(1 - Math.pow(1 - m.HIBRIDO.empregoAberto.pPorTurno, 30), 0.5), 'chance mensal → chance por dia equivalente');
  ok(perto(m.TERCEIROS.falsosAlarmes.reducaoPorFusao, 1 - 6 / (30 * P.TERCEIROS.falsosAlarmes.lambda)), 'fórmula com referência (falsos alarmes com integração plena)');
  ok(perto(m.TERCEIROS.interrupcao.excesso * P.INFOCOG.custo.pesoExcesso, 40 * (P.PESO_POLITICO.abordagem * P.LIMIAR_ATRIBUICAO.abordagem / 100 / 10)),
     'escala de gravidade: 40 pontos → custo equivalente a 4 abordagens sem indícios');
  ok(s._respondente === 'CMG (RM1) Fulano' && s._avaliacoes.some(x => x.id === 'B1.1' && x.fundamento) &&
     s._discorda_sem_estimativa.includes('D2.1') && s._questoes_abertas[0].id === 'O2',
     'respondente, avaliações, discordâncias sem estimativa e questões abertas vão como registro');
  const cfg = { ...R.CFG_PESQUISA, seed: 5001, fatores: { A_MPA: 1, B_NPaOc: 1, C_Fusao: 1, D_USV: 1, E_GVI: 1 }, apoioExterno: 1 };
  ok(JSON.stringify(R.jogarPartida(cfg, {}, m)) !== JSON.stringify(R.jogarPartida(cfg)), 'as respostas mudam a campanha');

  const ruim = await preencher(a, w => {
    const ws = w.getWorksheet('Questionário');
    responder(ws, 'B1.2', 'alto');
    responder(ws, 'E4.2', 'talvez');
  });
  const e = await QX.importarQuestionario(ruim);
  ok(e.erros.length === 2 && e.erros.some(x => x.startsWith('B1.2')) && e.erros.some(x => x.startsWith('E4.2')), 'erros apontados pelo número do item');
  console.log(`\nSM-11 (questionário profissional): ${pass} verificações — ALL PASS`);
})().catch(e => { console.error(e); process.exit(1); });
