'use strict';
/**
 * test_sm_questionario.js — Questionário em planilha (SM-11): exportação
 * determinística e ida e volta — o que o revisor escreve nas células amarelas
 * volta ao modelo como sobrescrita válida; erros de preenchimento são
 * apontados pela linha.
 *
 * Uso: node scripts/test_sm_questionario.js
 */

const assert = require('assert');
const ExcelJS = require('exceljs');
const { PARAMS: P } = require('../shared/sm/params');
const OB = require('../shared/sm/oob_sm');
const QX = require('../shared/sm/questionario_xlsx');
const SO = require('../shared/sm/sobrescrita');
const R = require('../shared/sm/runner');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}

const bloco = (nome, json = true) => ({ nome, secao: 'Seção', arquivo: json ? 'shared/sm/params.js' : 'shared/sm/oob_sm.js',
  comentario: `Descrição de ${nome}.`, nota: '', valor: json ? P[nome] : OB[nome], json, prio: { nivel: 'alta', detalhe: '' } });
const itens = [bloco('P_BASE'), bloco('TERCEIROS'), bloco('TIPOS_OCORRENCIA'), bloco('AREAS_DN'), bloco('DESFECHO'), bloco('BASES', false)];
const coerencia = ['**Questão um?**', 'Questão `dois`?'];

async function preencher(buf, editar) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  editar(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
function linhaDe(ws, caminho) {
  let n = null;
  ws.eachRow((r, i) => { if (r.getCell(3).value === caminho) n = i; });
  return ws.getRow(n);
}
const col = t => QX.COLS_PARAM.findIndex(c => c.titulo === t) + 1;

(async () => {
  const a = await QX.exportarQuestionario({ itens, coerencia });
  const b = await QX.exportarQuestionario({ itens, coerencia });
  ok(a.equals(b), 'exportação determinística (mesmo conteúdo ⇒ mesmo arquivo)');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(a);
  ok(['Instruções', 'Coerência', 'Parâmetros', 'Blocos'].every(n => wb.getWorksheet(n)), 'abas Instruções, Coerência, Parâmetros e Blocos');
  const wp = wb.getWorksheet('Parâmetros');
  const caminhos = [];
  wp.eachRow((r, i) => { if (i > 2) caminhos.push(r.getCell(3).value); });
  const esperado = itens.filter(i => i.json).flatMap(i => QX.folhas(i.valor, i.nome)).map(([c]) => c);
  ok(JSON.stringify(caminhos) === JSON.stringify(esperado) && caminhos.includes('TERCEIROS.forcaDesnecessaria.pPorNivel'),
     `uma linha por valor de parâmetro (${caminhos.length}), sem os rótulos de exibição`);
  ok(!caminhos.some(c => /\.rotulo$/.test(c)), 'rótulos de exibição ficam fora');
  ok(wp.getRow(2).getCell(1).value === 'EXEMPLO', 'linha de exemplo no topo');
  const amarelo = c => c.fill?.fgColor?.argb === 'FFFFFF00';
  ok(amarelo(wp.getRow(3).getCell(col('Valor proposto'))) && !amarelo(wp.getRow(3).getCell(col('Valor atual'))), 'só as células a preencher são amarelas');
  ok(wp.getRow(3).getCell(col('Confiança')).dataValidation?.type === 'list', 'confiança e plausibilidade em lista suspensa');
  ok(wb.getWorksheet('Coerência').getRow(2).getCell(2).value === 'Questão um?', 'questões de coerência sem marcação Markdown');

  // Planilha intocada: só metadados, modelo neutro.
  const vazio = await QX.importarQuestionario(a);
  ok(vazio.propostas === 0 && vazio.erros.length === 0, 'planilha sem preenchimento: nenhuma proposta, nenhum erro');
  const cfg = { ...R.CFG_PESQUISA, seed: 5001, fatores: { A_MPA: 1, B_NPaOc: 1, C_Fusao: 1, D_USV: 1, E_GVI: 1 }, apoioExterno: 1 };
  ok(JSON.stringify(R.jogarPartida(cfg, {}, SO.aplicarSobrescritas(vazio.sobrescrita))) === JSON.stringify(R.jogarPartida(cfg)),
     'sem propostas, a sobrescrita importada é neutra');

  // Preenchimento como um revisor faria.
  const cheio = await preencher(a, w => {
    const ws = w.getWorksheet('Parâmetros');
    const r1 = linhaDe(ws, 'P_BASE.deteccao');
    r1.getCell(col('Plausível?')).value = 'não';
    r1.getCell(col('Valor proposto')).value = '0,8';                  // vírgula decimal, como texto
    r1.getCell(col('Fonte / justificativa')).value = 'Relatórios de patrulha';
    r1.getCell(col('Confiança')).value = 'média';
    linhaDe(ws, 'TERCEIROS.forcaDesnecessaria.pPorNivel').getCell(col('Valor proposto')).value = '0,02; 0,05; 0,15; 0,25';
    linhaDe(ws, 'TERCEIROS.falsosAlarmes.lambda').getCell(col('Valor proposto')).value = 0.2;   // número
    linhaDe(ws, 'TIPOS_OCORRENCIA.pirataria.terrenos').getCell(col('Valor proposto')).value = '1; 2';
    linhaDe(ws, 'DESFECHO.ordemVitoriaAzul').getCell(col('Comentário')).value = 'Calibrar com a cadeia de repressão.';
    linhaDe(ws, 'P_BASE.deteccao');   // a linha EXEMPLO tem o mesmo caminho e deve ser ignorada
    const wi = w.getWorksheet('Instruções');
    wi.eachRow(r => { if (r.getCell(1).value === 'Revisor') r.getCell(2).value = 'CMG (RM1) Fulano'; });
    w.getWorksheet('Coerência').getRow(2).getCell(3).value = 'Sim, um só limiar.';
    w.getWorksheet('Blocos').eachRow(r => { if (r.getCell(2).value === 'BASES') r.getCell(9).value = 'Santos: base em G-12 está correta.'; });
  });
  const imp = await QX.importarQuestionario(cheio);
  const s = imp.sobrescrita;
  ok(imp.erros.length === 0 && imp.propostas === 4, `4 valores propostos importados (${imp.erros.join('; ')})`);
  ok(s.P_BASE.deteccao === 0.8 && s.TERCEIROS.falsosAlarmes.lambda === 0.2, 'números com vírgula ou como número');
  ok(JSON.stringify(s.TERCEIROS.forcaDesnecessaria.pPorNivel) === '[0.02,0.05,0.15,0.25]' && JSON.stringify(s.TIPOS_OCORRENCIA.pirataria.terrenos) === '[1,2]',
     'listas separadas por ponto e vírgula');
  ok(s._revisor === 'CMG (RM1) Fulano' && s._coerencia[0].resposta === 'Sim, um só limiar.' && s._blocos[0].bloco === 'BASES',
     'revisor, respostas de coerência e comentários de bloco vão como metadados');
  ok(s._revisao.length === 5 && s._revisao.some(x => x.caminho === 'DESFECHO.ordemVitoriaAzul' && x.comentario && !('proposto' in x)),
     'avaliações sem valor proposto também são guardadas');
  const pm = SO.aplicarSobrescritas(s);
  ok(pm.P_BASE.deteccao === 0.8 && pm.P_BASE.identificacao === P.P_BASE.identificacao, 'a sobrescrita importada se aplica ao modelo');
  ok(JSON.stringify(R.jogarPartida(cfg, {}, pm)) !== JSON.stringify(R.jogarPartida(cfg)), 'os valores revisados mudam a campanha');

  // Erros de preenchimento.
  const ruim = await preencher(a, w => {
    const ws = w.getWorksheet('Parâmetros');
    linhaDe(ws, 'P_BASE.abordagem').getCell(col('Valor proposto')).value = 'alto';
    linhaDe(ws, 'TERCEIROS.forcaDesnecessaria.pPorNivel').getCell(col('Valor proposto')).value = '0,1; x';
  });
  const e = await QX.importarQuestionario(ruim);
  ok(e.erros.length === 2 && e.erros.every(x => /^linha \d+ \(/.test(x)) && e.erros[0].includes('P_BASE.abordagem'), 'erros apontados pela linha e pelo parâmetro');
  console.log(`\nSM-11 (questionário em planilha): ${pass} verificações — ALL PASS`);
})().catch(e => { console.error(e); process.exit(1); });
