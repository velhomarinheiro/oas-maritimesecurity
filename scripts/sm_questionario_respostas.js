'use strict';
/**
 * sm_questionario_respostas.js — Consolida as respostas do questionário de
 * validação online e gera o relatório do painel e o JSON de parâmetros.
 *
 * Uso:
 *   node scripts/sm_questionario_respostas.js respostas.csv [mais.json …] [--minimo 3] [--saida dir]
 *     respostas.csv  aba "Respostas" da Planilha Google (Arquivo → Fazer download → CSV)
 *     *.json         arquivos baixados da página por quem não enviou online
 *   Saídas (padrão data/sm/, fora do git):
 *     painel_questionario.md    relatório por item (n, concordância, valor do painel, dispersão)
 *     painel_questionario.json  sobrescrita de parâmetros → node scripts/sm_lote.js --params …
 */

const fs = require('fs');
const path = require('path');
const QP = require('../shared/sm/questionario_profissional');
const PN = require('../shared/sm/questionario_painel');
const { dadosDaPagina } = require('./sm_questionario_web');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const minimo = Number(opt('minimo', 3));
const saida = path.resolve(opt('saida', path.join(__dirname, '..', 'data', 'sm')));
const arquivos = args.filter((a, i) => !a.startsWith('--') && !['--minimo', '--saida'].includes(args[i - 1]));
if (!arquivos.length) { console.error('Uso: node scripts/sm_questionario_respostas.js respostas.csv [mais.json …] [--minimo 3]'); process.exit(2); }

const registros = arquivos.flatMap((a, k) => {
  const t = fs.readFileSync(a, 'utf8');
  return a.toLowerCase().endsWith('.json') ? PN.registrosDoJson(JSON.parse(t), `arquivo-${k + 1}`) : PN.registrosDoCsv(t);
});
const c = PN.consolidar(registros, { minimo });
const { sobrescrita, erros } = PN.sobrescritaDoPainel(c, { minimo });
if (erros.length) { console.error(`Conversão com erro:\n  ${erros.join('\n  ')}`); process.exit(1); }

const versaoAtual = dadosDaPagina().versao;
const f = x => (x == null ? '—' : typeof x === 'number' ? String(Math.round(x * 100) / 100).replace('.', ',') : String(x));
const L = ['# Painel do questionário de validação — respostas consolidadas', ''];
L.push(`${c.envios} envio(s) anônimo(s). Valor do painel = mediana ponderada pela confiança (itens numéricos) ou opção mais votada (escolhas); ` +
  `concordar sem estimativa conta como a hipótese. Só itens com pelo menos ${minimo} respondentes e valor diferente da hipótese viram parâmetro.`, '');
if (c.versoes.some(v => v !== versaoAtual)) L.push(`**Atenção:** há respostas de versão diferente da atual (${c.versoes.join(', ')} × ${versaoAtual}). Itens que mudaram de hipótese devem ser revistos.`, '');
const aplic = c.itens.filter(i => i.aplicado);
L.push(`Itens respondidos: ${c.itens.length} · aplicados aos parâmetros: ${aplic.length} · com consenso fraco: ${c.itens.filter(i => i.consenso === false).length}.`, '');
L.push('| Nº | Item | Hipótese | Painel | n | Concordo / Discordo / Não sei | Dispersão (IIQ) | Consenso | Aplicado |', '|---|---|---|---|---|---|---|---|---|');
for (const i of c.itens) {
  L.push(`| ${i.id} | ${i.item.replace(/\|/g, '/')} | ${f(i.hipotese)} ${i.unidade} | ${f(i.painel)} | ${i.n} | ${i.concorda.sim} / ${i.concorda['não']} / ${i.concorda['não sei']} | ${f(i.iqr)} | ${i.consenso == null ? '—' : i.consenso ? 'sim' : '**fraco**'} | ${i.aplicado ? '**sim**' : 'não'} |`);
}
const inval = c.itens.filter(i => i.invalidas.length);
if (inval.length) L.push('', '## Estimativas descartadas (ilegíveis ou fora da faixa do item)', '', ...inval.map(i => `- ${i.id}: ${i.invalidas.map(x => `"${x}"`).join(', ')}`));
if (c.fundamentos.length) {
  L.push('', '## Fundamentos e observações', '');
  for (const x of c.fundamentos) L.push(`- **${x.id}**${x.confianca ? ` (confiança ${x.confianca})` : ''}: ${[x.fundamento, x.observacoes].filter(Boolean).join(' — ').replace(/\n/g, ' ')}`);
}
if (c.abertas.length) {
  L.push('', '## Questões abertas (para o analista)', '');
  const tit = Object.fromEntries(QP.questoes().map(q => [q.id, q.titulo]));
  for (const x of c.abertas) L.push(`- **${x.id}. ${tit[x.id] ?? ''}**: ${x.texto.replace(/\n/g, ' ')}`);
}

fs.mkdirSync(saida, { recursive: true });
fs.writeFileSync(path.join(saida, 'painel_questionario.md'), L.join('\n') + '\n', 'utf8');
fs.writeFileSync(path.join(saida, 'painel_questionario.json'), JSON.stringify(sobrescrita, null, 2) + '\n', 'utf8');
console.log(`${c.envios} envio(s), ${c.itens.length} itens respondidos, ${aplic.length} aplicados → ${path.join(saida, 'painel_questionario.md')} e .json`);
