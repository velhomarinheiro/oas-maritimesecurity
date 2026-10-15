'use strict';
/**
 * sm_questionario_web.js — Gera a página online do questionário de validação
 * de face (GitHub Pages), a partir do catálogo profissional
 * (shared/sm/questionario_profissional.js).
 *
 * Saída: docs/questionario/index.html — página única, autocontida, sem
 * identificação do respondente. As respostas vão, por POST, ao endereço de
 * docs/questionario/config.js (um App da Web do Google Apps Script que grava
 * numa Planilha Google privada; código em docs/questionario/apps_script.gs).
 * Sem endereço configurado, a página oferece baixar o arquivo de respostas.
 *
 * O texto e as hipóteses embutidos são os do questionário profissional; os
 * parâmetros e as regras de conversão NÃO vão para a página (ficam no
 * rastreamento, usado por scripts/sm_questionario_respostas.js).
 *
 * Uso: node scripts/sm_questionario_web.js [--saida dir]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QP = require('../shared/sm/questionario_profissional');

const args = process.argv.slice(2);
const RAIZ = path.join(__dirname, '..');
const SAIDA = path.resolve(args.includes('--saida') ? args[args.indexOf('--saida') + 1] : path.join(RAIZ, 'docs', 'questionario'));
const ARQ_RA = path.join(RAIZ, 'docs', 'sm', 'validacao_face', 'rastreamento.json');

/** Dados da página: só texto profissional, hipóteses e identificadores dos itens. */
function dadosDaPagina() {
  const ra = fs.existsSync(ARQ_RA) ? JSON.parse(fs.readFileSync(ARQ_RA, 'utf8')) : { itens: [] };
  const prio = Object.fromEntries(ra.itens.map(i => [i.id, i.prioridade]));
  const ORDEM = ['alta', 'média', 'baixa', 'inerte', 'não medida', 'estrutural'];
  const melhor = ps => ps.filter(Boolean).sort((a, b) => ORDEM.indexOf(a) - ORDEM.indexOf(b))[0] ?? null;
  const arred = h => (typeof h === 'number' ? Math.round(h * 100) / 100 : h);
  const temas = [];
  const abertas = [];
  for (const q of QP.questoes()) {
    if (q.linhas.every(l => l.conv === 'manual')) { abertas.push({ id: q.id, titulo: q.titulo, pergunta: q.pergunta }); continue; }
    let t = temas.find(x => x.tema === q.tema);
    if (!t) temas.push(t = { tema: q.tema, questoes: [] });
    const itens = q.linhas.map(l => ({
      id: l.id, item: l.item, hipotese: arred(QP.hipotese(l)),
      unidade: l.conv === 'categoria' ? null : (l.unidade ?? QP.CONVERSOES[l.conv].unidade),
      opcoes: l.conv === 'categoria' ? Object.keys(l.opcoes) : null,
      faixa: QP.faixaDe(l),
      prioridade: prio[l.id] ?? null,
    }));
    t.questoes.push({ id: q.id, titulo: q.titulo, pergunta: q.pergunta, prioridade: melhor(itens.map(i => i.prioridade)), itens });
  }
  const mi = QP.meiosEInfra();
  const corpo = { temas, abertas, meios: mi.meios, bases: mi.bases, infra: mi.infra };
  // Versão: impressão digital dos itens e hipóteses (muda quando o questionário muda).
  const versao = crypto.createHash('sha256').update(JSON.stringify(temas.map(t => t.questoes.map(q => q.itens.map(i => [i.id, i.hipotese]))))).digest('hex').slice(0, 10);
  return { versao, ...corpo };
}

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--ink:#14213d;--dim:#5b6475;--line:#d9dee7;--navy:#0b1e3a;--gold:#b8892d;--ok:#1e7a46;--warn:#b54708;--sel:#e8eefb;--input:#fffbe6}
@media (prefers-color-scheme:dark){:root{--bg:#0f1420;--card:#171d2b;--ink:#e6e9ef;--dim:#9aa3b5;--line:#2b3447;--navy:#0b1e3a;--gold:#d9b25a;--ok:#4cc38a;--warn:#f0a35e;--sel:#1f2a44;--input:#232b3d}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
header.top{background:var(--navy);color:#fff;padding:20px 16px}
header.top h1{margin:0;font-size:1.25rem;letter-spacing:.02em}header.top p{margin:.25rem 0 0;color:#c9d3e6;font-size:.95rem}
main{max-width:960px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 16px}
.card h2{margin:0 0 .5rem;font-size:1.1rem}
.nota{color:var(--dim);font-size:.92rem}
.barra{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.barra .prog{flex:1 1 200px;height:8px;background:var(--line);border-radius:4px;overflow:hidden}.barra .prog i{display:block;height:100%;background:var(--gold);width:0}
.barra label{font-size:.9rem;color:var(--dim);display:flex;gap:6px;align-items:center}
details.tema{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:0 0 12px}
details.tema>summary{cursor:pointer;padding:14px 16px;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:8px}
details.tema>summary::-webkit-details-marker{display:none}
details.tema>summary .cont{color:var(--dim);font-weight:400;font-size:.9rem;white-space:nowrap}
.questao{border-top:1px solid var(--line);padding:14px 16px}
.questao h3{margin:0 0 .25rem;font-size:1rem}.questao .perg{margin:0 0 .75rem}
.tag{display:inline-block;font-size:.75rem;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--dim);margin-left:6px;vertical-align:middle;font-weight:500}
.tag.alta{border-color:var(--warn);color:var(--warn)}
.item{display:grid;grid-template-columns:1fr auto;gap:6px 12px;padding:10px 0;border-top:1px dashed var(--line)}
.item:first-of-type{border-top:0}
.item .rot{font-size:.97rem}.item .hip{font-size:.9rem;color:var(--dim);text-align:right;white-space:nowrap}
.item .resp{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg label{padding:6px 12px;cursor:pointer;font-size:.9rem;border-left:1px solid var(--line);user-select:none}.seg label:first-child{border-left:0}
.seg input{position:absolute;opacity:0;pointer-events:none}.seg input:checked+span{font-weight:600}
.seg label:has(input:checked){background:var(--sel)}
.seg label:has(input:focus-visible){outline:2px solid var(--gold);outline-offset:-2px}
input[type=text],input[type=number],select,textarea{font:inherit;color:inherit;background:var(--input);border:1px solid var(--line);border-radius:8px;padding:6px 10px}
input.est{width:9.5rem}textarea{width:100%;min-height:3.2rem;resize:vertical}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.meta .full{grid-column:1/-1}
.meta label{font-size:.85rem;color:var(--dim);display:flex;flex-direction:column;gap:4px}
button{font:inherit;border-radius:8px;border:1px solid var(--navy);background:var(--navy);color:#fff;padding:10px 18px;cursor:pointer}
button.sec{background:transparent;color:var(--ink);border-color:var(--line)}
button:disabled{opacity:.6;cursor:default}
.ok{color:var(--ok)}.erro{color:var(--warn)}
.aviso{grid-column:1/-1;color:var(--warn);font-size:.88rem}.aviso:empty{display:none}
table.ref{width:100%;border-collapse:collapse;font-size:.9rem}table.ref th,table.ref td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:left}
.oculto{display:none!important}.hp{position:absolute;left:-9999px}
@media (max-width:600px){.item{grid-template-columns:1fr}.item .hip{text-align:left}.meta{grid-template-columns:1fr}}
`;

const JS = `
(function(){
'use strict';
var D = JSON.parse(document.getElementById('dados').textContent);
var CHAVE = 'oas-sm-questionario-' + D.versao;
var estado = {itens:{}, questoes:{}, abertas:{}};
try { var s = localStorage.getItem(CHAVE); if (s) estado = JSON.parse(s); } catch (e) {}
function salvar(){ try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) {} atualizarProgresso(); }
function el(tag, attrs, filhos){ var e = document.createElement(tag); for (var k in (attrs||{})) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'cls') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } (filhos||[]).forEach(function(f){ if (f) e.appendChild(f); }); return e; }
function fmt(h){ if (h === null || h === undefined) return '—'; return typeof h === 'number' ? String(h).replace('.', ',') : String(h); }
var totalItens = 0;
function itemEl(it){
  totalItens++;
  var st = estado.itens[it.id] || (estado.itens[it.id] = {});
  var nome = 'c-' + it.id;
  var seg = el('div', {cls:'seg', role:'radiogroup', 'aria-label':'Concorda com a hipótese?'});
  ['sim','não','não sei'].forEach(function(v){
    var inp = el('input', {type:'radio', name:nome, value:v}); if (st.concorda === v) inp.checked = true;
    inp.addEventListener('change', function(){ st.concorda = v; est.disabled = v === 'sim'; if (v === 'sim') { est.value = ''; delete st.estimativa; } salvar(); });
    seg.appendChild(el('label', {}, [inp, el('span', {text: v === 'sim' ? 'Concordo' : v === 'não' ? 'Discordo' : 'Não sei'})]));
  });
  var est;
  if (it.opcoes) {
    est = el('select', {'aria-label':'Sua estimativa'}); est.appendChild(el('option', {value:'', text:'— sua escolha —'}));
    it.opcoes.forEach(function(o){ var op = el('option', {value:o, text:o}); if (st.estimativa === o) op.selected = true; est.appendChild(op); });
  } else {
    est = el('input', {type:'text', inputmode:'decimal', cls:'est', placeholder:'sua estimativa', 'aria-label':'Sua estimativa (' + it.unidade + ')'});
    if (st.estimativa != null) est.value = st.estimativa;
  }
  est.disabled = st.concorda === 'sim';
  var aviso = el('div', {cls:'aviso', role:'status'});
  function conferir(){
    aviso.textContent = '';
    var v = est.value.trim(); if (!v || it.opcoes) return;
    var x = Number(v.replace(/\s/g, '').replace('%', '').replace(',', '.'));
    if (!isFinite(x)) { aviso.textContent = 'Escreva só o número (por exemplo: 75 ou 0,5).'; return; }
    var f = it.faixa;
    if (f && ((f[0] !== null && x < f[0]) || (f[1] !== null && x > f[1]))) { aviso.textContent = 'Fora da faixa esperada' + (f[1] !== null ? ' (' + fmt(f[0]) + ' a ' + fmt(f[1]) + ')' : ' (mínimo ' + fmt(f[0]) + ')') + '. Confira a unidade: ' + it.unidade + '.'; return; }
    var h = it.hipotese;
    if (typeof h === 'number' && h > 0 && x > 0 && (x / h > 10 || h / x > 10)) aviso.textContent = 'Valor muito diferente da hipótese (' + fmt(h) + ' ' + it.unidade + '). Confira a unidade: ' + it.unidade + '.';
  }
  est.addEventListener('input', function(){ var v = est.value.trim(); if (v) { st.estimativa = v; if (!st.concorda) { st.concorda = 'não'; seg.querySelector('input[value="não"]').checked = true; } } else delete st.estimativa; conferir(); salvar(); });
  conferir();
  var un = it.opcoes ? 'escolha uma opção' : it.unidade;
  return el('div', {cls:'item', 'data-prio': it.prioridade || ''}, [
    el('div', {cls:'rot', text: it.item}),
    el('div', {cls:'hip', text: 'Hipótese: ' + fmt(it.hipotese) + (it.opcoes ? '' : ' ' + it.unidade)}),
    el('div', {cls:'resp'}, [seg, est, it.opcoes ? null : el('span', {cls:'nota', text: un})]),
    aviso,
  ]);
}
function metaEl(q){
  var st = estado.questoes[q.id] || (estado.questoes[q.id] = {});
  function campo(rot, chave, tipo, cls){
    var c;
    if (tipo === 'conf') { c = el('select'); ['', 'baixa', 'média', 'alta'].forEach(function(v){ var o = el('option', {value:v, text: v || '—'}); if (st[chave] === v) o.selected = true; c.appendChild(o); }); }
    else { c = el('textarea', {rows:'2'}); if (st[chave]) c.value = st[chave]; }
    c.addEventListener('input', function(){ if (c.value) st[chave] = c.value; else delete st[chave]; salvar(); });
    return el('label', {cls: cls || ''}, [el('span', {text: rot}), c]);
  }
  return el('div', {cls:'meta'}, [
    campo('Fundamento da resposta (experiência, doutrina, dados)', 'fundamento', 'txt', 'full'),
    campo('Confiança (baixa = palpite informado; média = experiência direta; alta = dado documentado)', 'confianca', 'conf'),
    campo('Observações', 'observacoes', 'txt'),
  ]);
}
var raiz = document.getElementById('temas');
D.temas.forEach(function(t, i){
  var n = t.questoes.reduce(function(s, q){ return s + q.itens.length; }, 0);
  var cont = el('span', {cls:'cont', text: n + ' itens'});
  var det = el('details', {cls:'tema'}, [el('summary', {}, [el('span', {text: (i + 1) + '. ' + t.tema}), cont])]);
  t.questoes.forEach(function(q){
    var tag = q.prioridade ? el('span', {cls:'tag ' + (q.prioridade === 'alta' ? 'alta' : ''), text: 'prioridade ' + q.prioridade}) : null;
    var h = el('h3', {}, [document.createTextNode(q.id + '. ' + q.titulo), tag]);
    var box = el('section', {cls:'questao', 'data-prio': q.prioridade || ''}, [h, el('p', {cls:'perg', text: q.pergunta})]);
    q.itens.forEach(function(it){ box.appendChild(itemEl(it)); });
    box.appendChild(metaEl(q));
    det.appendChild(box);
  });
  det.addEventListener('toggle', atualizarProgresso);
  raiz.appendChild(det);
});
var ab = document.getElementById('abertas');
D.abertas.forEach(function(q){
  var c = el('textarea', {rows:'3'}); if (estado.abertas[q.id]) c.value = estado.abertas[q.id];
  c.addEventListener('input', function(){ if (c.value) estado.abertas[q.id] = c.value; else delete estado.abertas[q.id]; salvar(); });
  ab.appendChild(el('div', {cls:'questao'}, [el('h3', {text: q.id + '. ' + q.titulo}), el('p', {cls:'perg', text: q.pergunta}), c]));
});
function tabela(cab, linhas){ var t = el('table', {cls:'ref'}); t.appendChild(el('tr', {}, cab.map(function(c){ return el('th', {text:c}); }))); linhas.forEach(function(l){ t.appendChild(el('tr', {}, l.map(function(c){ return el('td', {text: String(c == null ? '' : c)}); }))); }); return t; }
var ref = document.getElementById('referencia');
ref.appendChild(el('h3', {text:'Meios considerados, por comando'}));
ref.appendChild(tabela(['Comando', 'Meio', 'Classe / tipo', 'Capacidade em avaliação'], D.meios.map(function(m){ return [m.comando, m.meio, m.classe, m.capacidade_em_avaliacao]; })));
ref.appendChild(el('h3', {text:'Bases de operação'}));
ref.appendChild(tabela(['Base'], D.bases.map(function(b){ return [b]; })));
ref.appendChild(el('h3', {text:'Infraestrutura crítica (importância relativa: 1 = menor)'}));
ref.appendChild(tabela(['Instalação', 'Tipo', 'Importância'], D.infra.map(function(x){ return [x.nome, x.tipo, x.importancia]; })));

var soAlta = document.getElementById('so-alta');
soAlta.addEventListener('change', function(){
  document.querySelectorAll('section.questao[data-prio]').forEach(function(s){ s.classList.toggle('oculto', soAlta.checked && s.getAttribute('data-prio') !== 'alta' && s.parentNode.id !== 'abertas'); });
});
function respondidos(){ return Object.keys(estado.itens).filter(function(k){ var s = estado.itens[k]; return s.concorda || s.estimativa; }).length; }
function atualizarProgresso(){
  var n = respondidos();
  document.getElementById('prog-i').style.width = (100 * n / totalItens) + '%';
  document.getElementById('prog-t').textContent = n + ' de ' + totalItens + ' itens';
}
atualizarProgresso();

function montarEnvio(){
  var itens = [], questoes = [], abertas = [];
  Object.keys(estado.itens).forEach(function(id){ var s = estado.itens[id]; if (s.concorda || s.estimativa) itens.push({id:id, concorda:s.concorda || '', estimativa:s.estimativa || ''}); });
  Object.keys(estado.questoes).forEach(function(id){ var s = estado.questoes[id]; if (s.fundamento || s.confianca || s.observacoes) questoes.push({id:id, fundamento:s.fundamento || '', confianca:s.confianca || '', observacoes:s.observacoes || ''}); });
  Object.keys(estado.abertas).forEach(function(id){ if (estado.abertas[id]) abertas.push({id:id, texto:estado.abertas[id]}); });
  return {versao:D.versao, itens:itens, questoes:questoes, abertas:abertas, hp:document.getElementById('hp').value};
}
function baixar(dados){
  var blob = new Blob([JSON.stringify(dados, null, 1)], {type:'application/json'});
  var a = el('a', {href: URL.createObjectURL(blob), download: 'respostas-oas-sm.json'}); document.body.appendChild(a); a.click(); a.remove();
}
var msg = document.getElementById('msg');
document.getElementById('baixar').addEventListener('click', function(){ baixar(montarEnvio()); });
document.getElementById('enviar').addEventListener('click', function(){
  var dados = montarEnvio();
  if (!dados.itens.length && !dados.abertas.length) { msg.className = 'erro'; msg.textContent = 'Nenhuma resposta para enviar.'; return; }
  var url = (window.QUESTIONARIO_CONFIG || {}).endereco;
  if (!url) { msg.className = 'erro'; msg.textContent = 'O envio online ainda não está configurado. Use "Baixar minhas respostas" e envie o arquivo ao coordenador.'; return; }
  var b = this; b.disabled = true; msg.className = 'nota'; msg.textContent = 'Enviando…';
  var corpo = JSON.stringify(dados);
  function sucesso(){ msg.className = 'ok'; msg.textContent = 'Respostas enviadas. Obrigado pela contribuição. (' + dados.itens.length + ' itens, ' + dados.abertas.length + ' respostas abertas.)'; estado.enviadoEm = new Date().toISOString().slice(0, 10); salvar(); b.disabled = false; }
  fetch(url, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:corpo, redirect:'follow'})
    .then(function(r){ return r.text(); })
    .then(function(t){ var j = null; try { j = JSON.parse(t); } catch (e) {} if (j && j.ok === false) throw new Error(j.erro || 'recusado'); sucesso(); })
    .catch(function(){
      // Alguns navegadores bloqueiam a leitura da resposta do Google; o envio "opaco" ainda grava.
      fetch(url, {method:'POST', mode:'no-cors', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:corpo})
        .then(sucesso)
        .catch(function(){ msg.className = 'erro'; msg.textContent = 'Não foi possível enviar agora. Suas respostas continuam salvas neste navegador; tente de novo ou use "Baixar minhas respostas".'; b.disabled = false; });
    });
});
document.getElementById('limpar').addEventListener('click', function(){
  if (!confirm('Apagar todas as respostas deste navegador?')) return;
  try { localStorage.removeItem(CHAVE); } catch (e) {} location.reload();
});
if (estado.enviadoEm) { msg.className = 'nota'; msg.textContent = 'Você já enviou respostas deste navegador em ' + estado.enviadoEm + '. Um novo envio é registrado como outra resposta.'; }
})();
`;

function pagina(dados) {
  const json = JSON.stringify(dados).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Questionário de validação — OAS-SM</title>
<style>${CSS}</style>
</head>
<body>
<header class="top"><h1>Operação Atlântico Sul — Segurança Marítima</h1><p>Questionário de validação por especialistas</p></header>
<div class="barra"><div class="prog" aria-hidden="true"><i id="prog-i"></i></div><span id="prog-t" class="nota"></span>
<label><input type="checkbox" id="so-alta"> só prioridade alta</label></div>
<main>
<section class="card">
<h2>Sobre este questionário</h2>
<p>Este questionário colhe a sua experiência profissional para calibrar um jogo de guerra de segurança marítima: patrulha naval, repressão a ilícitos, ameaças híbridas à infraestrutura marítima, apoio interagências e escalada até o conflito aberto, no litoral do 2º ao 5º Distrito Naval.</p>
<p>Cada item mostra a <b>hipótese</b> adotada até agora, escolhida sem base em dados. Diga se concorda; se não, dê a sua estimativa na unidade indicada. Ao fim de cada questão, registre o fundamento e a confiança. Responda só o que estiver no seu campo de experiência — itens em branco mantêm a hipótese. Com pouco tempo, marque "só prioridade alta".</p>
<p class="nota"><b>Anonimato:</b> nenhum dado de identificação é pedido nem registrado. As respostas ficam salvas apenas neste navegador até o envio, e podem ser retomadas depois. Não escreva nos campos de texto informação classificada.</p>
</section>
<div id="temas"></div>
<details class="tema"><summary><span>Questões abertas</span><span class="cont">comentários livres</span></summary><div id="abertas"></div></details>
<details class="tema"><summary><span>Para consulta: meios e infraestrutura considerados</span></summary><div class="questao" id="referencia"></div></details>
<section class="card">
<h2>Enviar</h2>
<p class="nota">Ao enviar, as respostas são registradas de forma anônima. Você pode enviar uma única vez ao final, ou voltar depois e completar.</p>
<input type="text" id="hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
<p><button id="enviar" type="button">Enviar respostas</button> <button id="baixar" type="button" class="sec">Baixar minhas respostas</button> <button id="limpar" type="button" class="sec">Recomeçar</button></p>
<p id="msg" class="nota" role="status" aria-live="polite"></p>
</section>
<p class="nota">Versão do questionário: ${dados.versao}</p>
</main>
<script id="dados" type="application/json">${json}</script>
<script src="config.js"></script>
<script>${JS}</script>
</body>
</html>
`;
}

function main() {
  const dados = dadosDaPagina();
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.writeFileSync(path.join(SAIDA, 'index.html'), pagina(dados), 'utf8');
  const cfg = path.join(SAIDA, 'config.js');
  if (!fs.existsSync(cfg)) {
    fs.writeFileSync(cfg, `// Endereço do App da Web (Google Apps Script) que recebe as respostas.\n// Deixe vazio até publicar o script (docs/questionario/LEIAME.md).\nwindow.QUESTIONARIO_CONFIG = { endereco: '' };\n`, 'utf8');
  }
  const n = dados.temas.reduce((s, t) => s + t.questoes.reduce((x, q) => x + q.itens.length, 0), 0);
  console.log(`página do questionário (versão ${dados.versao}, ${n} itens, ${dados.abertas.length} abertas) → ${path.join(SAIDA, 'index.html')}`);
}

if (require.main === module) main();
module.exports = { dadosDaPagina, pagina };
