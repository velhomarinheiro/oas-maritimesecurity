'use strict';
/**
 * sm_questionario_importar.js — Converte o questionário de validação de face
 * preenchido (questionario.xlsx) no JSON de sobrescrita de parâmetros.
 *
 * Uso:
 *   node scripts/sm_questionario_importar.js preenchido.xlsx revisado.json
 *   node scripts/sm_lote.js --params revisado.json          # lote com os valores revisados
 *
 * Lê só as células amarelas. Valores propostos são convertidos para o tipo do
 * valor atual e validados (parâmetro existente, tipo, número finito); linhas
 * com erro são listadas e nada é gravado até que sejam corrigidas. O revisor,
 * as respostas de coerência, as avaliações e os comentários vão para o JSON
 * como metadados (chaves "_"), que o modelo ignora.
 */

const fs = require('fs');
const path = require('path');
const { importarQuestionario } = require('../shared/sm/questionario_xlsx');

const [entrada, saida] = process.argv.slice(2);
if (!entrada || !saida) {
  console.error('Uso: node scripts/sm_questionario_importar.js preenchido.xlsx revisado.json');
  process.exit(2);
}

importarQuestionario(fs.readFileSync(path.resolve(entrada))).then(({ sobrescrita, propostas, erros }) => {
  if (erros.length) {
    console.error(`${erros.length} linha(s) com erro — nada foi gravado:\n  ${erros.join('\n  ')}`);
    process.exit(1);
  }
  fs.writeFileSync(path.resolve(saida), JSON.stringify(sobrescrita, null, 2) + '\n', 'utf8');
  const n = k => (sobrescrita[k] ?? []).length;
  console.log(`${propostas} valor(es) proposto(s), ${n('_revisao')} avaliação(ões), ${n('_coerencia')} resposta(s) de coerência, ` +
              `${n('_blocos')} comentário(s) de bloco → ${saida}`);
}).catch(e => { console.error(e.message); process.exit(1); });
