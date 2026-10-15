'use strict';
/**
 * sm_lote.js — Roda o lote experimental da OAS-SM e grava o dataset.
 *
 * Desenho Experimental v1.3 §5: ablação (6 × 50 = 300) + fatorial 2⁵
 * (32 × 20 = 640) + contraste de apoio externo (2 × 50 = 100) = 1.040
 * partidas, uma linha por partida no esquema da Tabela 6.1 (CSV UTF-8,
 * vírgula, ponto decimal, vazio = ausente), importável em Jamovi e R.
 *
 * Uso:
 *   node scripts/sm_lote.js                       # lote completo → data/sm/dataset_oas_sm.csv
 *   node scripts/sm_lote.js --saida arq.csv       # outro arquivo
 *   node scripts/sm_lote.js --blocos ablacao --replicas 5
 *   node scripts/sm_lote.js --params especialista.json   # parâmetros revisados (SM-10)
 */

const fs = require('fs');
const path = require('path');
const R = require('../shared/sm/runner');
const { PARAMS } = require('../shared/sm/params');
const { carregarSobrescritas } = require('../shared/sm/sobrescrita');

const args = process.argv.slice(2);
const opt = (nome, padrao) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args[i + 1] : padrao; };
const saida = path.resolve(opt('saida', path.join(__dirname, '..', 'data', 'sm', 'dataset_oas_sm.csv')));
const blocos = opt('blocos', 'ablacao,fatorial,contraste').split(',');
const rep = opt('replicas', null);
const replicas = rep ? Object.fromEntries(blocos.map(b => [b, Number(rep)])) : {};
const arqParams = opt('params', null);
const params = arqParams ? carregarSobrescritas(path.resolve(arqParams)) : PARAMS;

let ultimo = 0;
const { linhas, ms } = R.rodarLote({
  blocos, replicas,
  progresso: (i, n) => { const p = Math.floor(100 * i / n); if (p >= ultimo + 10) { ultimo = p; process.stderr.write(`  ${p}% (${i}/${n})\n`); } },
}, params);
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, R.paraCsv(linhas), 'utf8');
console.log(`${linhas.length} partidas em ${(ms / 1000).toFixed(1)} s → ${saida}`);
