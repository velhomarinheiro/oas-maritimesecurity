'use strict';

/**
 * questionario_painel.js — Consolida as respostas anônimas do questionário
 * online (SM-12) num valor de painel por item e o converte em parâmetros pelo
 * rastreamento (questionario_profissional.js).
 *
 * Entrada: linhas no formato da aba "Respostas" da Planilha Google
 * (docs/questionario/apps_script.gs) — recebido_em, envio, versao, tipo, id,
 * concorda, estimativa, fundamento, confianca, observacoes, texto — ou os
 * arquivos JSON que a página oferece para baixar (convertidos para as mesmas
 * linhas).
 *
 * Regras do painel, por item:
 *   - valor de cada respondente: a estimativa, se deu; a hipótese, se
 *     concordou sem estimativa; "não sei" e itens em branco não entram;
 *   - peso: a confiança declarada na questão (baixa 1, média 2, alta 3;
 *     sem declaração, 1);
 *   - valor do painel: mediana ponderada (itens numéricos) ou opção mais
 *     votada, ponderada (itens de escolha);
 *   - só vira parâmetro com pelo menos `minimo` respondentes e se diferir da
 *     hipótese; abaixo disso, a hipótese fica e o item é listado.
 *   - estimativas ilegíveis ou fora da faixa do item (por exemplo, mais de
 *     100%) ficam de fora e são listadas no relatório;
 *   - consenso fraco: menos de 2/3 do peso de acordo entre si (escolha), ou
 *     intervalo interquartil maior que metade da mediana (número).
 */

const QP = require('./questionario_profissional');
const { PARAMS: P } = require('./params');

const PESO_CONFIANCA = { baixa: 1, 'média': 2, media: 2, alta: 3 };

/** CSV (RFC 4180) → matriz de textos. */
function lerCsv(texto) {
  const linhas = [];
  let campo = '', linha = [], aspas = false;
  const s = texto.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(x => x !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== '' || linha.length) { linha.push(campo); if (linha.some(x => x !== '')) linhas.push(linha); }
  return linhas;
}

/** Matriz com cabeçalho → objetos. */
function registrosDoCsv(texto) {
  const [cab, ...resto] = lerCsv(texto);
  if (!cab || !cab.includes('tipo') || !cab.includes('id')) throw new Error('CSV sem as colunas da aba "Respostas".');
  return resto.map(l => Object.fromEntries(cab.map((c, i) => [c.trim(), (l[i] ?? '').trim()])));
}

/** Arquivo baixado da página → os mesmos registros. */
function registrosDoJson(obj, envio) {
  const base = { recebido_em: '', envio, versao: obj.versao ?? '' };
  return [
    ...(obj.itens ?? []).map(x => ({ ...base, tipo: 'item', id: x.id, concorda: x.concorda ?? '', estimativa: String(x.estimativa ?? '') })),
    ...(obj.questoes ?? []).map(x => ({ ...base, tipo: 'questao', id: x.id, fundamento: x.fundamento ?? '', confianca: x.confianca ?? '', observacoes: x.observacoes ?? '' })),
    ...(obj.abertas ?? []).map(x => ({ ...base, tipo: 'aberta', id: x.id, texto: x.texto ?? '' })),
  ];
}

function numero(x) {
  if (typeof x === 'number') return x;
  const s = String(x ?? '').trim().replace(/^'/, '').replace(/\s/g, '').replace('%', '').replace('−', '-');
  if (!s) return NaN;
  return Number(/^-?\d+(,\d+)?$/.test(s) ? s.replace(',', '.') : s);
}

function medianaPonderada(vals) {
  const v = vals.slice().sort((a, b) => a.x - b.x);
  const total = v.reduce((s, a) => s + a.w, 0);
  let acc = 0;
  for (let i = 0; i < v.length; i++) {
    acc += v[i].w;
    if (acc > total / 2) return v[i].x;
    if (acc === total / 2) return (v[i].x + v[i + 1].x) / 2;
  }
  return NaN;
}
function quantil(xs, q) {
  const v = xs.slice().sort((a, b) => a - b);
  const pos = (v.length - 1) * q, b = Math.floor(pos);
  return v[b + 1] !== undefined ? v[b] + (pos - b) * (v[b + 1] - v[b]) : v[b];
}

/**
 * @param {object[]} registros
 * @param {{minimo?: number}} [opts]
 * @returns {{ envios, versoes, itens: object[], abertas: object[], fundamentos: object[], respostas: object }}
 *   `respostas`: id → valor do painel, só dos itens que passam o mínimo e diferem da hipótese.
 */
function consolidar(registros, { minimo = 3, params = P } = {}) {
  const linhas = QP.linhas(params);
  const porId = Object.fromEntries(linhas.map(l => [l.id, l]));
  const envios = [...new Set(registros.map(r => r.envio))];
  const versoes = [...new Set(registros.map(r => r.versao).filter(Boolean))];
  const conf = {};
  for (const r of registros.filter(r => r.tipo === 'questao')) conf[`${r.envio}|${r.id}`] = PESO_CONFIANCA[r.confianca] ?? 1;

  const itens = [];
  const respostas = {};
  for (const l of linhas.filter(l => l.conv !== 'manual')) {
    const rs = registros.filter(r => r.tipo === 'item' && r.id === l.id);
    if (!rs.length) continue;
    const hip = QP.hipotese(l, params, linhas);
    const qid = l.questao.id;
    const cont = { sim: 0, 'não': 0, 'não sei': 0 };
    const vals = [];
    const invalidas = [];
    for (const r of rs) {
      if (r.concorda in cont) cont[r.concorda]++;
      const w = conf[`${r.envio}|${qid}`] ?? 1;
      if (r.estimativa) {
        if (l.conv === 'categoria') { if (r.estimativa in l.opcoes) vals.push({ x: r.estimativa, w }); else invalidas.push(r.estimativa); }
        else {
          const x = numero(r.estimativa), f = QP.faixaDe(l);
          const fora = f && ((f[0] !== null && x < f[0]) || (f[1] !== null && x > f[1]));
          if (Number.isFinite(x) && !fora) vals.push({ x, w }); else invalidas.push(r.estimativa);
        }
      } else if (r.concorda === 'sim' && hip != null) vals.push({ x: hip, w });
    }
    let painel = null, consenso = null, iqr = null;
    if (vals.length) {
      if (l.conv === 'categoria') {
        const soma = {};
        for (const v of vals) soma[v.x] = (soma[v.x] ?? 0) + v.w;
        const total = vals.reduce((s, v) => s + v.w, 0);
        painel = Object.entries(soma).sort((a, b) => b[1] - a[1] || (a[0] === hip ? -1 : 1))[0][0];
        consenso = soma[painel] / total >= 2 / 3;
      } else {
        painel = medianaPonderada(vals);
        const xs = vals.map(v => v.x);
        iqr = xs.length > 1 ? quantil(xs, 0.75) - quantil(xs, 0.25) : 0;
        consenso = iqr <= 0.5 * Math.abs(painel) || iqr === 0;
      }
    }
    const difere = painel != null && (l.conv === 'categoria' ? painel !== hip : Math.abs(painel - hip) > 1e-9 * Math.max(1, Math.abs(hip)));
    const aplicado = vals.length >= minimo && difere;
    if (aplicado) respostas[l.id] = painel;
    itens.push({ id: l.id, questao: qid, tema: l.questao.tema, item: l.item, unidade: l.unidade ?? QP.CONVERSOES[l.conv].unidade,
      hipotese: hip, n: vals.length, concorda: cont, painel, iqr, consenso, aplicado, invalidas });
  }
  const abertas = registros.filter(r => r.tipo === 'aberta' && r.texto).map(r => ({ id: r.id, texto: r.texto }));
  const fundamentos = registros.filter(r => r.tipo === 'questao' && (r.fundamento || r.observacoes))
    .map(r => ({ id: r.id, confianca: r.confianca || null, fundamento: r.fundamento || null, observacoes: r.observacoes || null }));
  return { envios: envios.length, versoes, itens, abertas, fundamentos, respostas };
}

/** Painel → sobrescrita de parâmetros (pelo rastreamento), com o registro do painel em chaves "_". */
function sobrescritaDoPainel(c, { params = P, minimo = 3 } = {}) {
  const conv = QP.converterRespostas(c.respostas, params);
  return {
    erros: conv.erros,
    sobrescrita: {
      _fonte: `painel anônimo do questionário de validação online (${c.envios} envio(s); mínimo de ${minimo} respondentes por item)`,
      _versoes_do_questionario: c.versoes,
      _itens_aplicados: Object.keys(c.respostas),
      _questoes_abertas: c.abertas,
      _fundamentos: c.fundamentos,
      ...conv.sobrescrita,
    },
  };
}

module.exports = { lerCsv, registrosDoCsv, registrosDoJson, consolidar, sobrescritaDoPainel, medianaPonderada, numero };
