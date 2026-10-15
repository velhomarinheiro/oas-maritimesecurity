'use strict';
/**
 * test_sm_sobrescrita.js — Testes da sobrescrita de parâmetros (SM-10):
 * regras do JSON de especialista e propagação — um parâmetro passado por
 * cópia (argumento `params`) tem de produzir exatamente a mesma campanha que
 * o mesmo valor escrito no PARAMS original. Se algum módulo ignorasse o
 * argumento e lesse o original, a sensibilidade e a revisão de especialistas
 * mediriam o parâmetro errado sem aviso.
 *
 * Uso: node scripts/test_sm_sobrescrita.js              # amostra de 1 em 8 parâmetros
 *      node scripts/test_sm_sobrescrita.js --completo   # todos os parâmetros numéricos, 2 cenários (~1 min)
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PARAMS: P } = require('../shared/sm/params');
const SO = require('../shared/sm/sobrescrita');
const R = require('../shared/sm/runner');

const COMPLETO = process.argv.includes('--completo');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}

// ─── Regras ───────────────────────────────────────────────────────────────────
{
  const antes = JSON.stringify(P);
  const m = SO.aplicarSobrescritas({ _fonte: 'teste', PISO_FUSAO: { deteccao: 0.5 }, INFOCOG: { tetoCustoPolitico: 30 } });
  ok(m.PISO_FUSAO.deteccao === 0.5 && m.PISO_FUSAO.identificacao === P.PISO_FUSAO.identificacao,
     'objetos são mesclados: só a chave dada muda');
  ok(m.INFOCOG.tetoCustoPolitico === 30 && m.INFOCOG.custo.pesoExcesso === P.INFOCOG.custo.pesoExcesso, 'mescla em profundidade');
  ok(JSON.stringify(P) === antes && m !== P && m.INFOCOG !== P.INFOCOG, 'o PARAMS original fica intacto');
  ok(!('_fonte' in m), 'chaves com "_" são metadados e não entram nos parâmetros');
  const l = SO.aplicarSobrescritas({ HIBRIDO: { vetores: { minagem: { alvos: ['porto', 'duto'] } } } });
  ok(l.HIBRIDO.vetores.minagem.alvos.join() === 'porto,duto', 'listas são substituídas inteiras');
  const ix = SO.aplicarSobrescritas({ TERCEIROS: { forcaDesnecessaria: { pPorNivel: { 2: 0.5 } } } });
  ok(ix.TERCEIROS.forcaDesnecessaria.pPorNivel.join() === [0.05, 0.10, 0.5, 0.30].join() && Array.isArray(ix.TERCEIROS.forcaDesnecessaria.pPorNivel),
     'lista alterada por índice continua lista');
  assert.throws(() => SO.aplicarSobrescritas({ TERCEIROS: { forcaDesnecessaria: { pPorNivel: { 7: 0.5 } } } }), /índice inválido/);
  ok(true, 'índice fora da lista é recusado');
  assert.throws(() => SO.aplicarSobrescritas({ PISO_FUSAO: { radar: 0.5 } }), /inexistente "PISO_FUSAO.radar"/);
  ok(true, 'parâmetro inexistente é recusado, com o caminho');
  assert.throws(() => SO.aplicarSobrescritas({ DOUTRINA: { urgencia: '1' } }), /espera number, veio string/);
  ok(true, 'tipo diferente do original é recusado');
  assert.throws(() => SO.aplicarSobrescritas({ DOUTRINA: { urgencia: null } }), /espera number/);
  ok(true, 'nulo no lugar de número é recusado');
  ok(SO.ler(P, 'DOUTRINA.quadro.porFusao') === P.DOUTRINA.quadro.porFusao && SO.ler(P, 'X.y') === undefined, 'leitura por caminho');
  ok(JSON.stringify(SO.sobrescritaDe('A.b.c', 1)) === '{"A":{"b":{"c":1}}}', 'sobrescrita a partir do caminho');
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sm-params-')), 'esp.json');
  fs.writeFileSync(arq, JSON.stringify({ _revisor: 'teste', DOUTRINA: { urgencia: 2 } }));
  ok(SO.carregarSobrescritas(arq).DOUTRINA.urgencia === 2, 'carrega o JSON de especialista');
  const modelo = path.join(__dirname, '..', 'docs', 'sm', 'validacao_face', 'params_especialista.exemplo.json');
  if (fs.existsSync(modelo)) {
    const pm = SO.carregarSobrescritas(modelo);
    const cfg = { ...R.CFG_PESQUISA, seed: 5001, fatores: { A_MPA: 1, B_NPaOc: 1, C_Fusao: 1, D_USV: 1, E_GVI: 1 }, apoioExterno: 1 };
    ok(JSON.stringify(R.jogarPartida(cfg, {}, pm)) === JSON.stringify(R.jogarPartida(cfg)),
       'o modelo de sobrescrita do pacote de validação é válido e, com os valores atuais, neutro');
  }
}

// ─── Propagação ───────────────────────────────────────────────────────────────
{
  const folhas = [];
  (function rec(o, c) {
    for (const [k, v] of Object.entries(o)) {
      const cc = c ? `${c}.${k}` : k;
      if (k.startsWith('SAL_')) continue;
      if (typeof v === 'number') folhas.push(cc);
      else if (v && typeof v === 'object' && !Array.isArray(v)) rec(v, cc);
    }
  })(P, '');
  const atribuir = (c, v) => {
    const ks = c.split('.'), u = ks.pop(), alvo = ks.reduce((o, k) => o[k], P);
    const velho = alvo[u]; alvo[u] = v; return velho;
  };
  const todos = { A_MPA: 1, B_NPaOc: 1, C_Fusao: 1, D_USV: 1, E_GVI: 1 };
  const cenarios = [
    { ...R.CFG_PESQUISA, seed: 5001, fatores: todos, apoioExterno: 1 },
    { ...R.CFG_PESQUISA, dificuldade: 'avancado', intensidadeHibrida: 1, nivelInicial: 2, seed: 77,
      fatores: { A_MPA: -1, B_NPaOc: 1, C_Fusao: -1, D_USV: 1, E_GVI: -1 }, apoioExterno: 1 },
  ];
  const amostra = COMPLETO ? folhas : folhas.filter((_, i) => i % 8 === 0);
  const cens = COMPLETO ? cenarios : cenarios.slice(0, 1);
  const base = cens.map(c => JSON.stringify(R.jogarPartida(c)));
  const vazam = [], quebram = [];
  let mudam = 0;
  const jogar = (cfg, params) => { try { return JSON.stringify(R.jogarPartida(cfg, {}, params)); } catch (e) { return `erro: ${e.message}`; } };
  for (const c of amostra) {
    const v = SO.ler(P, c), nv = Number.isInteger(v) ? v + 1 : v * 1.3;
    const copia = SO.aplicarSobrescritas(SO.sobrescritaDe(c, nv));
    cens.forEach((cfg, j) => {
      const porCopia = jogar(cfg, copia);
      const velho = atribuir(c, nv);
      let noOriginal;
      try { noOriginal = jogar(cfg, P); } finally { atribuir(c, velho); }
      if (porCopia.startsWith('erro:')) quebram.push(`${c} (${porCopia})`);
      if (porCopia !== noOriginal) vazam.push(c);
      else if (porCopia !== base[j]) mudam++;
    });
  }
  ok(quebram.length === 0, 'nenhuma perturbação derruba o motor' + (quebram.length ? ` (quebram: ${quebram.join('; ')})` : ''));
  ok(vazam.length === 0, `propagação: ${amostra.length} de ${folhas.length} parâmetros numéricos, por cópia = no original` +
     (vazam.length ? ` (vazam: ${vazam.join(', ')})` : ''));
  ok(mudam > amostra.length * cens.length / 4, `a verificação não é vazia: ${mudam} perturbações mudam a campanha`);
  ok(cens.every((c, j) => JSON.stringify(R.jogarPartida(c)) === base[j]), 'o original foi restaurado após a verificação');
}

console.log(`\nSM-10 (sobrescrita): ${pass} verificações — ALL PASS`);
