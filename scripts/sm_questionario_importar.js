'use strict';
/**
 * sm_questionario_importar.js — Converte o questionário de validação de face
 * preenchido (questionario.xlsx) no JSON de sobrescrita de parâmetros.
 *
 * Uso:
 *   node scripts/sm_questionario_importar.js preenchido.xlsx revisado.json
 *   node scripts/sm_lote.js --params revisado.json          # lote com os valores revisados
 *
 * Lê só as células amarelas. Cada estimativa é convertida pela regra do seu
 * item (percentual, por mês, dias, escala de gravidade…) e validada; itens com
 * erro são listados e nada é gravado até que sejam corrigidos. O respondente,
 * as avaliações, as discordâncias sem estimativa e as respostas abertas vão
 * para o JSON como registro (chaves "_"), que o modelo ignora; as respostas
 * abertas pedem interpretação do analista.
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
  console.log(`${propostas} estimativa(s) convertida(s) em parâmetros, ${n('_avaliacoes')} avaliação(ões), ` +
              `${n('_questoes_abertas')} resposta(s) aberta(s) para o analista` +
              (n('_discorda_sem_estimativa') ? `, ${n('_discorda_sem_estimativa')} discordância(s) sem estimativa` : '') + ` → ${saida}`);
}).catch(e => { console.error(e.message); process.exit(1); });
