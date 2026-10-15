/**
 * Recepção das respostas do questionário de validação da OAS-SM.
 *
 * Publicado como App da Web do Google Apps Script, ligado a uma Planilha
 * Google privada (ver LEIAME.md). Cada envio da página grava linhas na aba
 * "Respostas", sem nenhum dado de identificação do respondente:
 *
 *   recebido_em | envio | versao | tipo | id | concorda | estimativa |
 *   fundamento | confianca | observacoes | texto
 *
 *   tipo = "item"     uma linha por item respondido (concorda, estimativa)
 *          "questao"  fundamento, confiança e observações de uma questão
 *          "aberta"   resposta a uma questão aberta (texto)
 *
 * "envio" é um código aleatório que só agrupa as linhas de um mesmo envio.
 * O Apps Script não recebe o endereço IP nem a conta de quem envia.
 */

var ABA = 'Respostas';
var COLUNAS = ['recebido_em', 'envio', 'versao', 'tipo', 'id', 'concorda', 'estimativa', 'fundamento', 'confianca', 'observacoes', 'texto'];
var MAX_LINHAS = 600;      // por envio
var MAX_TEXTO = 3000;      // caracteres por campo
var ID = /^[A-Z]\d{1,2}(\.\d{1,3})?$/;

function doPost(e) {
  var trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.hp) return resposta({ ok: true });               // robô: ignora sem avisar
    var linhas = [];
    var agora = new Date().toISOString();
    var envio = Utilities.getUuid().slice(0, 8);
    var versao = texto(d.versao, 20);
    (d.itens || []).forEach(function (x) {
      if (!ID.test(x.id)) return;
      linhas.push([agora, envio, versao, 'item', x.id, opcao(x.concorda, ['sim', 'não', 'não sei']), texto(x.estimativa, 60), '', '', '', '']);
    });
    (d.questoes || []).forEach(function (x) {
      if (!ID.test(x.id)) return;
      linhas.push([agora, envio, versao, 'questao', x.id, '', '', texto(x.fundamento), opcao(x.confianca, ['baixa', 'média', 'alta']), texto(x.observacoes), '']);
    });
    (d.abertas || []).forEach(function (x) {
      if (!ID.test(x.id)) return;
      linhas.push([agora, envio, versao, 'aberta', x.id, '', '', '', '', '', texto(x.texto)]);
    });
    if (!linhas.length) return resposta({ ok: false, erro: 'envio vazio' });
    if (linhas.length > MAX_LINHAS) return resposta({ ok: false, erro: 'envio grande demais' });
    var aba = planilha();
    // Tudo como texto: a planilha não reinterpreta números conforme a localidade.
    var faixa = aba.getRange(aba.getLastRow() + 1, 1, linhas.length, COLUNAS.length);
    faixa.setNumberFormat('@');
    faixa.setValues(linhas);
    return resposta({ ok: true, linhas: linhas.length });
  } catch (err) {
    return resposta({ ok: false, erro: 'formato inválido' });
  } finally {
    trava.releaseLock();
  }
}

/** Abrir o endereço no navegador mostra só que o serviço está no ar. */
function doGet() {
  return resposta({ ok: true, servico: 'questionário OAS-SM' });
}

function planilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA);
  if (!aba) {
    aba = ss.insertSheet(ABA);
    aba.appendRow(COLUNAS);
    aba.setFrozenRows(1);
  }
  return aba;
}

function texto(v, max) {
  var s = v == null ? '' : String(v);
  s = s.slice(0, max || MAX_TEXTO);
  // Evita que a planilha interprete o texto como fórmula.
  return /^[=+@]/.test(s) ? "'" + s : s;
}

function opcao(v, validas) {
  return validas.indexOf(v) >= 0 ? v : '';
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
