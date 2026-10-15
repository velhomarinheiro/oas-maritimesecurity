'use strict';
/**
 * test_sm_questionario_web.js — Questionário online (SM-12):
 *   - a página embute só texto profissional (nenhum parâmetro, nenhuma regra);
 *   - consolidação do painel anônimo (mediana ponderada, mínimo de
 *     respondentes, escolhas, CSV da planilha) e conversão em parâmetros;
 *   - no navegador (se o Playwright estiver instalado): preencher, salvar
 *     rascunho, filtrar, enviar — o envio é interceptado e consolidado.
 *
 * Uso: node scripts/test_sm_questionario_web.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const { PARAMS: P } = require('../shared/sm/params');
const QP = require('../shared/sm/questionario_profissional');
const PN = require('../shared/sm/questionario_painel');
const SO = require('../shared/sm/sobrescrita');
const W = require('./sm_questionario_web');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}
const perto = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// ─── Página ───────────────────────────────────────────────────────────────────
const dados = W.dadosDaPagina();
const html = W.pagina(dados);
{
  const ids = dados.temas.flatMap(t => t.questoes.flatMap(q => q.itens.map(i => i.id)));
  const esperado = QP.linhas().filter(l => l.conv !== 'manual').map(l => l.id);
  ok(JSON.stringify(ids) === JSON.stringify(esperado), `a página traz todos os itens do questionário (${ids.length})`);
  ok(dados.abertas.length === QP.questoes().filter(q => q.linhas.every(l => l.conv === 'manual')).length, 'e as questões abertas');
  const caminhos = QP.linhas().flatMap(QP.alvos);
  const json = JSON.stringify(dados);
  ok(!caminhos.some(c => json.includes(c)) && !Object.keys(P).some(k => json.includes(k)) && !/"(conv|regra|alvo|ref|grupo|params)"/.test(json),
     'nenhum parâmetro, regra de conversão ou nome do código vai para a página');
  ok(!/seu nome|e-?mail|posto \/|dados do respondente|type="email"/i.test(html) && /nenhum dado de identificação/.test(html), 'nada pede identificação; o anonimato é declarado');
  ok(html.includes('<script src="config.js"></script>') && !/https?:\/\/script\.google/.test(html), 'o endereço de envio fica fora da página (config.js)');
  ok(W.pagina(W.dadosDaPagina()) === html, 'geração determinística');
  const versionada = path.join(__dirname, '..', 'docs', 'questionario', 'index.html');
  if (fs.existsSync(versionada)) ok(fs.readFileSync(versionada, 'utf8') === html, 'a página versionada está em dia com o catálogo (npm run sm:validacao)');
}

// ─── Painel ───────────────────────────────────────────────────────────────────
{
  ok(PN.medianaPonderada([{ x: 1, w: 1 }, { x: 2, w: 1 }, { x: 10, w: 3 }]) === 10, 'mediana ponderada');
  ok(PN.medianaPonderada([{ x: 1, w: 1 }, { x: 3, w: 1 }]) === 2, 'mediana ponderada com empate no meio');
  ok(PN.numero('0,85') === 0.85 && PN.numero("'-4") === -4 && PN.numero('75%') === 75 && Number.isNaN(PN.numero('alto')), 'leitura de números (vírgula, sinal, %)');
  const csv = 'recebido_em,envio,versao,tipo,id,concorda,estimativa,fundamento,confianca,observacoes,texto\n' +
    'x,a,v,item,B1.1,não,"75",,,,\nx,a,v,questao,B1,,,"Comissões, NPaOc",alta,,\n' +
    'x,b,v,item,B1.1,não,80,,,,\nx,b,v,questao,B1,,,,baixa,,\n' +
    'x,c,v,item,B1.1,sim,,,,,\n' +
    'x,a,v,item,E4.1,não,inspeção,,,,\nx,b,v,item,E4.1,não,inspeção,,,,\nx,c,v,item,E4.1,sim,,,,,\n' +
    'x,a,v,item,D2.1,não,5,,,,\n' +
    'x,c,v,aberta,O2,,,,,,"Falta um NPaOc\nno 5º DN"\n';
  const reg = PN.registrosDoCsv(csv);
  ok(reg.length === 10 && reg.find(r => r.tipo === 'aberta').texto.includes('\n'), 'CSV da planilha: aspas, vírgulas e quebras de linha');
  const c = PN.consolidar(reg, { minimo: 3 });
  const it = id => c.itens.find(i => i.id === id);
  // B1.1: 75 (peso 3), 80 (peso 1), concordou = 85 (peso 1) → mediana ponderada 75.
  ok(c.envios === 3 && it('B1.1').n === 3 && it('B1.1').painel === 75 && it('B1.1').aplicado, 'painel: estimativas e concordâncias, ponderadas pela confiança');
  ok(it('E4.1').painel === 'inspeção' && it('E4.1').aplicado, 'escolha: opção mais votada');
  ok(it('D2.1').n === 1 && !it('D2.1').aplicado, 'abaixo do mínimo de respondentes, a hipótese fica');
  const fora = PN.consolidar(PN.registrosDoCsv('envio,versao,tipo,id,concorda,estimativa\na,v,item,B1.1,não,170\nb,v,item,B1.1,não,abc\n'), { minimo: 1 });
  ok(fora.itens[0].n === 0 && fora.itens[0].invalidas.join() === '170,abc', 'estimativas fora da faixa do item ou ilegíveis ficam de fora e são listadas');
  const { sobrescrita, erros } = PN.sobrescritaDoPainel(c, { minimo: 3 });
  const m = SO.aplicarSobrescritas(sobrescrita);
  ok(!erros.length && perto(m.P_BASE.deteccao, 0.75) && m.TIPOS_OCORRENCIA.narcotrafico.etapaRepressao === 'inspecao' && m.TURNOS_PARA_DESESCALAR === P.TURNOS_PARA_DESESCALAR,
     'o painel vira parâmetros pelo rastreamento');
  ok(sobrescrita._questoes_abertas[0].id === 'O2' && sobrescrita._fundamentos.some(x => x.fundamento === 'Comissões, NPaOc'), 'abertas e fundamentos seguem como registro');
  const j = PN.registrosDoJson({ versao: 'v', itens: [{ id: 'B1.1', concorda: 'não', estimativa: '70' }], questoes: [], abertas: [] }, 'arq');
  ok(j.length === 1 && j[0].tipo === 'item' && j[0].estimativa === '70', 'arquivo baixado da página entra como as linhas da planilha');
  // Item dependente: só a referência respondida → o dependente mantém a própria hipótese.
  const ref = QP.converterRespostas({ 'A5.1': 10 });
  const mr = SO.aplicarSobrescritas(ref.sobrescrita);
  ok(perto(mr.DOUTRINA.quadro.base + mr.DOUTRINA.quadro.porFusao, P.DOUTRINA.quadro.base + P.DOUTRINA.quadro.porFusao), 'mudar só a integração mínima não desloca a integração plena');
}

// ─── Navegador ────────────────────────────────────────────────────────────────
let chromium = null;
try { chromium = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')).chromium; } catch (e) { /* sem Playwright */ }

(async () => {
  if (!chromium) { console.log('ℹ Playwright ausente: teste no navegador omitido'); return fim(); }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-qweb-'));
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  fs.writeFileSync(path.join(dir, 'config.js'), "window.QUESTIONARIO_CONFIG = { endereco: 'https://receptor.invalid/exec' };\n");
  const srv = http.createServer((q, r) => {
    const f = path.join(dir, q.url === '/' ? 'index.html' : q.url.slice(1));
    if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8' });
    r.end(fs.readFileSync(f));
  }).listen(0);
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const envios = [];
  try {
    const page = await browser.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.route('https://receptor.invalid/**', rt => { envios.push(JSON.parse(rt.request().postData())); rt.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
    await page.goto(url);
    const texto = await page.evaluate(() => document.body.innerText);
    ok(!/[A-Z][A-Z0-9]*_[A-Z0-9_]+|\b[a-z]+_[a-z]+\b/.test(texto), 'texto visível sem nomes do código');
    await page.click('details.tema >> nth=1');                         // abre "Desempenho dos meios"
    const item = id => page.locator(`.item:has(.rot)`).filter({ has: page.locator(`input[name="c-${id}"]`) });
    await item('B1.1').locator('input.est').fill('75');
    await item('B1.2').locator('label:has-text("Concordo")').click();
    await page.locator('section.questao:has(h3:has-text("B1."))').locator('select').selectOption('alta');
    ok(await item('B1.1').locator('input[value="não"]').isChecked(), 'escrever uma estimativa marca "Discordo"');
    await item('B1.3').locator('input.est').fill('0,7');
    const av1 = await item('B1.3').locator('.aviso').textContent();
    await item('B1.3').locator('input.est').fill('170');
    const av2 = await item('B1.3').locator('.aviso').textContent();
    await item('B1.3').locator('input.est').fill('');
    ok(/muito diferente/.test(av1) && /Fora da faixa/.test(av2), 'a página avisa valor fora da faixa ou muito distante da hipótese (unidade trocada)');
    await page.reload();
    await page.click('details.tema >> nth=1');
    ok(await item('B1.1').locator('input.est').inputValue() === '75' && await item('B1.2').locator('input[value="sim"]').isChecked(), 'rascunho salvo no navegador e retomado');
    await page.check('#so-alta');
    const ocultas = await page.locator('section.questao.oculto').count();
    await page.uncheck('#so-alta');
    ok(ocultas > 0 && await page.locator('section.questao.oculto').count() === 0, 'filtro "só prioridade alta"');
    await page.click('details.tema >> nth=4');                         // ilícitos no mar
    await page.locator('select[aria-label="Sua estimativa"]').first().selectOption('inspeção');
    await page.click('summary:has-text("Questões abertas")');
    await page.locator('#abertas textarea').nth(1).fill('Falta um NPaOc no 5º DN.');
    await page.click('#enviar');
    await page.waitForFunction(() => /enviadas/.test(document.getElementById('msg').textContent), null, { timeout: 5000 });
    ok(envios.length === 1, 'envio recebido pelo endereço configurado');
    const e = envios[0];
    ok(e.versao === dados.versao && e.itens.some(x => x.id === 'B1.1' && x.estimativa === '75' && x.concorda === 'não') &&
       e.itens.some(x => x.id === 'B1.2' && x.concorda === 'sim') && e.itens.some(x => x.id === 'E4.1' && x.estimativa === 'inspeção') &&
       e.questoes.some(x => x.id === 'B1' && x.confianca === 'alta') && e.abertas.some(x => x.id === 'O2'),
       'o envio leva itens, confiança da questão e respostas abertas');
    ok(!JSON.stringify(e).match(/nome|email|ip|usuario/i) && Object.keys(e).sort().join() === 'abertas,hp,itens,questoes,versao', 'o envio não leva nada além das respostas');
    // Três respondentes iguais → painel aplicado.
    const reg = [0, 1, 2].flatMap(k => PN.registrosDoJson(e, `e${k}`));
    const s = PN.sobrescritaDoPainel(PN.consolidar(reg, { minimo: 3 }), { minimo: 3 });
    ok(!s.erros.length && perto(SO.aplicarSobrescritas(s.sobrescrita).P_BASE.deteccao, 0.75), 'do navegador ao parâmetro: 75% → 0,75');
    ok(erros.length === 0, 'sem erros de página' + (erros.length ? `: ${erros.join('; ')}` : ''));
    // Sem endereço configurado: a página orienta a baixar o arquivo.
    fs.writeFileSync(path.join(dir, 'config.js'), "window.QUESTIONARIO_CONFIG = { endereco: '' };\n");
    const p2 = await browser.newPage();
    await p2.goto(url);
    await p2.click('details.tema >> nth=1');
    await p2.locator('details.tema[open] input.est').first().fill('10');
    await p2.click('#enviar');
    ok(/não está configurado|Baixar minhas respostas/.test(await p2.textContent('#msg')), 'sem endereço, a página orienta a baixar o arquivo');
  } finally {
    await browser.close();
    srv.close();
  }
  fim();
})().catch(e => { console.error(e); process.exit(1); });

function fim() { console.log(`\nSM-12 (questionário online): ${pass} verificações — ALL PASS`); }
