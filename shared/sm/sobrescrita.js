'use strict';

/**
 * sobrescrita.js — Valores de parâmetros vindos de fora do código (SM-10).
 *
 * Os parâmetros da variante são placeholders de projeto (params.js, marcados
 * com `// TODO: validar com especialista`). Para que a revisão de
 * especialistas e a análise de sensibilidade alterem valores sem editar o
 * código, este módulo produz uma CÓPIA de PARAMS com sobrescritas aplicadas.
 * O original nunca é alterado; a cópia é passada aos módulos pelo argumento
 * `params` (runner, motor, sala).
 *
 * Regras da sobrescrita (JSON):
 *   - só chaves que já existem em PARAMS (erro com o caminho, se não);
 *   - o tipo do valor é o do original (número, booleano, texto, lista, objeto);
 *   - objetos são mesclados recursivamente; listas são substituídas inteiras;
 *   - chaves que começam com "_" são metadados (fonte, revisor, data) e são
 *     ignoradas — servem para registrar a proveniência do valor.
 */

const fs = require('fs');
const { PARAMS: P } = require('./params');

const tipo = v => (Array.isArray(v) ? 'lista' : v === null ? 'nulo' : typeof v);

function mesclar(base, over, caminho) {
  for (const [k, v] of Object.entries(over)) {
    if (k.startsWith('_')) continue;
    const c = caminho ? `${caminho}.${k}` : k;
    if (!Object.prototype.hasOwnProperty.call(base, k)) throw new Error(`Sobrescrita: parâmetro inexistente "${c}".`);
    const tb = tipo(base[k]), tv = tipo(v);
    if (tb === 'nulo') { base[k] = v; continue; }
    if (tb !== tv) throw new Error(`Sobrescrita: "${c}" espera ${tb}, veio ${tv}.`);
    if (tb === 'number' && !Number.isFinite(v)) throw new Error(`Sobrescrita: "${c}" não é número finito.`);
    if (tb === 'object') mesclar(base[k], v, c);
    else base[k] = tb === 'lista' ? structuredClone(v) : v;
  }
}

/** Cópia de `base` (padrão: PARAMS) com as sobrescritas aplicadas. */
function aplicarSobrescritas(over = {}, base = P) {
  const copia = structuredClone(base);
  mesclar(copia, over, '');
  return copia;
}

/** Lê um JSON de sobrescritas e devolve a cópia de PARAMS correspondente. */
function carregarSobrescritas(arquivo, base = P) {
  const over = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  return aplicarSobrescritas(over, base);
}

/** Valor no caminho "A.b.c" (ou undefined). */
function ler(params, caminho) {
  return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), params);
}

/** Sobrescrita {A: {b: {c: valor}}} correspondente a "A.b.c" = valor. */
function sobrescritaDe(caminho, valor) {
  return caminho.split('.').reduceRight((v, k) => ({ [k]: v }), valor);
}

module.exports = { aplicarSobrescritas, carregarSobrescritas, ler, sobrescritaDe };
