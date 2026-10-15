'use strict';

/**
 * sensibilidade.js — Análise de sensibilidade da OAS-SM (SM-10).
 *
 * Varredura um-de-cada-vez (OAT) sobre os parâmetros placeholder de
 * params.js, com ênfase no que o Conceito v1.6 aponta como decisivo: fusão,
 * atribuição e custos (§7.2, §9.2, §11.3). Para cada parâmetro, dois níveis
 * (baixo/alto, em geral −30%/+30%), cada um jogado em duas condições com
 * sementes espelhadas:
 *   - C0: todas as capacidades (fatores em +1);
 *   - C3: sem C_Fusão (os demais em +1) — sem ela, a fusão fica no teto
 *     TETO_FUSAO_SEM_C e os pisos de fusão passam a pesar.
 *
 * Saídas por parâmetro:
 *   - efeito padronizado (alto − baixo, em desvios-padrão da linha de base)
 *     e teste pareado sobre cada métrica, em C0 e em C3;
 *   - robustez da conclusão principal do lote — o efeito de C_Fusão (C0 − C3)
 *     sobre E1_atrib — nos dois níveis;
 *   - checagem de face: o sentido observado contra o sentido esperado
 *     (hipótese de quem modelou), classificado em coerente, nulo ou
 *     contraintuitivo.
 *
 * A perturbação é feita por sobrescrita (sobrescrita.js) numa cópia de
 * PARAMS: o original não muda, e o teste de propagação garante que a cópia
 * chega a todos os módulos.
 */

const { PARAMS: P } = require('./params');
const SO = require('./sobrescrita');
const R = require('./runner');
const ES = require('./estatistica');

/** Métricas acompanhadas (colunas da linha do runner). */
const METRICAS = [
  'E1_atrib', 'E2_infra', 'E3_escalada', 'E4_custopol', 'E5_ordem', 'E6_dispersao',
  'sloc_idx', 'nivel_max', 'kcv_perdido', 'apoio_publico_final', 'n_ocorr_crim', 'n_incidentes_hibridos',
];

const TODOS = { A_MPA: 1, B_NPaOc: 1, C_Fusao: 1, D_USV: 1, E_GVI: 1 };
const CONDICOES = {
  C0: { ...TODOS },
  C3: { ...TODOS, C_Fusao: -1 },
};

const ESCALA = { tipo: 'escala', baixo: 0.7, alto: 1.3 };

/**
 * Catálogo. `alvo`: caminho com '*' (todas as chaves daquele nível);
 * `niveis`: escala (multiplica as folhas numéricas, com teto `max`) ou valor
 * (substitui); `esperado`: sentido esperado de cada métrica quando o
 * parâmetro sobe (+1/−1) e a condição em que se espera vê-lo (padrão C0).
 * TODO: validar com especialista (os sentidos esperados são hipóteses de
 * projeto, a confirmar na revisão de face).
 */
const CATALOGO = [
  // Fusão (Conceito §7.2; Desenho §3)
  { id: 'F1', grupo: 'fusão', rotulo: 'Pisos de fusão por etapa', alvo: 'PISO_FUSAO.*', niveis: { ...ESCALA, max: 1 },
    esperado: { condicao: 'C3', E1_atrib: +1 } },
  { id: 'F2', grupo: 'fusão', rotulo: 'Peso das fontes de dados', alvo: 'FONTES.*.peso', niveis: ESCALA,
    esperado: { condicao: 'C3', E1_atrib: +1 } },
  { id: 'F3', grupo: 'fusão', rotulo: 'Teto de fusão sem C_Fusão', alvo: 'TETO_FUSAO_SEM_C', niveis: { tipo: 'valor', baixo: 0.40, alto: 0.70 },
    esperado: { condicao: 'C3', E1_atrib: +1, E5_ordem: +1 } },
  { id: 'F4', grupo: 'fusão', rotulo: 'Ganho de quadro por fusão', alvo: 'DOUTRINA.quadro.porFusao', niveis: ESCALA,
    esperado: { E1_atrib: +1, E5_ordem: +1 } },
  { id: 'F5', grupo: 'fusão', rotulo: 'Chance-base de entrar no quadro', alvo: 'DOUTRINA.quadro.base', niveis: ESCALA,
    esperado: { E1_atrib: +1, E5_ordem: +1 } },
  { id: 'F6', grupo: 'fusão', rotulo: 'Piso de fusão na evidência', alvo: 'PISO_FUSAO_EVIDENCIA', niveis: { tipo: 'valor', baixo: 0.35, alto: 0.65 },
    esperado: { condicao: 'C3', E1_atrib: +1 } },
  { id: 'F7', grupo: 'fusão', rotulo: 'Bônus de fusão de MPA e CENSIPAM', alvo: 'APOIOS.*.bonusFusao', niveis: ESCALA, esperado: {} },

  // Atribuição (Conceito §9.2)
  { id: 'A1', grupo: 'atribuição', rotulo: 'Ganho de evidência por etapa', alvo: 'GANHO_EVIDENCIA.*', niveis: { ...ESCALA, max: 1 },
    esperado: { E1_atrib: +1, nivel_max: +1 } },
  { id: 'A2', grupo: 'atribuição', rotulo: 'Fator de negabilidade', alvo: 'FATOR_NEGABILIDADE.*', niveis: { ...ESCALA, max: 1 },
    esperado: { E1_atrib: +1 } },
  { id: 'A3', grupo: 'atribuição', rotulo: 'Limiares de atribuição por etapa', alvo: 'LIMIAR_ATRIBUICAO.*', niveis: { ...ESCALA, max: 100 },
    esperado: { E4_custopol: +1 } },
  { id: 'A4', grupo: 'atribuição', rotulo: 'Atribuição mínima para N2/N3', alvo: 'GATILHOS_ESCALADA.*.atribuicaoMin', niveis: { ...ESCALA, max: 100 },
    esperado: { nivel_max: -1 } },
  { id: 'A5', grupo: 'atribuição', rotulo: 'Ganho da investigação pós-fato', alvo: 'HIBRIDO.investigacao.ganho', niveis: ESCALA,
    esperado: { nivel_max: +1 } },
  { id: 'A6', grupo: 'atribuição', rotulo: 'Limiar robusto da investigação', alvo: 'HIBRIDO.investigacao.robusta', niveis: { tipo: 'valor', baixo: 60, alto: 80 },
    esperado: { nivel_max: -1 } },
  { id: 'A7', grupo: 'atribuição', rotulo: 'Ritmo de evidência (intermediário)', alvo: 'DIFICULDADES.intermediario.ritmo', niveis: ESCALA,
    esperado: { E1_atrib: +1 } },

  // Custos políticos (Conceito §11.3, §6)
  { id: 'C1', grupo: 'custos', rotulo: 'Peso político por etapa', alvo: 'PESO_POLITICO.*', niveis: ESCALA, esperado: { E4_custopol: +1 } },
  { id: 'C2', grupo: 'custos', rotulo: 'Peso do excesso de força', alvo: 'INFOCOG.custo.pesoExcesso', niveis: ESCALA, esperado: { E4_custopol: +1 } },
  { id: 'C3', grupo: 'custos', rotulo: 'Peso dos danos a terceiros', alvo: 'INFOCOG.custo.pesoDanos', niveis: ESCALA, esperado: { E4_custopol: +1 } },
  { id: 'C4', grupo: 'custos', rotulo: 'Modulação do custo pelo apoio', alvo: 'INFOCOG.custo.modulacao', niveis: ESCALA, esperado: { E4_custopol: +1 } },
  { id: 'C5', grupo: 'custos', rotulo: 'Teto de custo político', alvo: 'INFOCOG.tetoCustoPolitico', niveis: { tipo: 'valor', baixo: 18, alto: 32 }, esperado: {} },
  { id: 'C6', grupo: 'custos', rotulo: 'Apoio perdido por custo', alvo: 'INFOCOG.apoioPorCusto', niveis: ESCALA, esperado: { apoio_publico_final: -1 } },
  { id: 'C7', grupo: 'custos', rotulo: 'Efeito-base da desinformação', alvo: 'INFOCOG.desinformacao.base', niveis: ESCALA, esperado: { apoio_publico_final: -1 } },

  // Ameaça e carga (Tabela 4.1; Conceito §4.2, §5)
  { id: 'T1', grupo: 'ameaça', rotulo: 'Ações híbridas por turno', alvo: 'HIBRIDO.acoesPorTurno', niveis: ESCALA,
    esperado: { E2_infra: -1, n_incidentes_hibridos: +1 } },
  { id: 'T2', grupo: 'ameaça', rotulo: 'Evasão dos vetores híbridos', alvo: 'HIBRIDO.vetores.*.evasao', niveis: { ...ESCALA, max: 1 },
    esperado: { E1_atrib: -1 } },
  { id: 'T3', grupo: 'ameaça', rotulo: 'Dano por ação híbrida', alvo: 'HIBRIDO.vetores.*.dano', niveis: ESCALA, esperado: { E2_infra: -1 } },
  { id: 'T4', grupo: 'ameaça', rotulo: 'Incidência constabular (λ)', alvo: 'TIPOS_OCORRENCIA.*.lambda.*', niveis: ESCALA,
    esperado: { n_ocorr_crim: +1 } },
  { id: 'T5', grupo: 'ameaça', rotulo: 'Saturação instrumentalizada', alvo: 'ACOPLAMENTO.lambdaSaturacaoMax', niveis: ESCALA,
    esperado: { n_ocorr_crim: +1 } },
  { id: 'T6', grupo: 'ameaça', rotulo: 'Ocorrências de cobertura', alvo: 'ACOPLAMENTO.pCoberturaMax', niveis: ESCALA, esperado: {} },

  // Encontro e capacidade (SM-1)
  { id: 'E1', grupo: 'encontro', rotulo: 'Probabilidade-base por etapa', alvo: 'P_BASE.*', niveis: { ...ESCALA, max: 1 },
    esperado: { E1_atrib: +1, E5_ordem: +1 } },
  { id: 'E2', grupo: 'encontro', rotulo: 'Capacidade das plataformas', alvo: 'CAPACIDADE_POR_TIPO.*.*', niveis: { ...ESCALA, max: 1 },
    esperado: { E1_atrib: +1, E5_ordem: +1 } },

  // Doutrina do agente Azul (§8.6)
  { id: 'D1', grupo: 'doutrina', rotulo: 'Ações por estação', alvo: 'DOUTRINA.acoesPorEstacao', niveis: { tipo: 'valor', baixo: 3, alto: 5 },
    esperado: { E5_ordem: +1 } },
  { id: 'D2', grupo: 'doutrina', rotulo: 'Surto de ações', alvo: 'DOUTRINA.surto', niveis: { tipo: 'valor', baixo: 1, alto: 3 }, esperado: {} },
  { id: 'D3', grupo: 'doutrina', rotulo: 'Urgência (turnos para aceitar risco)', alvo: 'DOUTRINA.urgencia', niveis: { tipo: 'valor', baixo: 0, alto: 2 },
    esperado: { E4_custopol: +1 } },
  { id: 'D4', grupo: 'doutrina', rotulo: 'Turnos para desescalar', alvo: 'TURNOS_PARA_DESESCALAR', niveis: { tipo: 'valor', baixo: 3, alto: 5 }, esperado: {} },
];

/** Caminhos concretos das folhas numéricas que casam com `alvo`. */
function expandir(alvo, params = P) {
  const out = [];
  const rec = (o, partes, caminho) => {
    if (!partes.length) { if (typeof o === 'number') out.push(caminho.join('.')); return; }
    const [k, ...resto] = partes;
    if (o == null || typeof o !== 'object') return;
    for (const chave of k === '*' ? Object.keys(o) : [k]) if (chave in o) rec(o[chave], resto, [...caminho, chave]);
  };
  rec(params, alvo.split('.'), []);
  return out;
}

/** Cópia de `params` com a entrada do catálogo no nível 'baixo' ou 'alto'. */
function perturbar(entrada, nivel, params = P) {
  const folhas = expandir(entrada.alvo, params);
  if (!folhas.length) throw new Error(`sensibilidade: alvo sem parâmetros numéricos: ${entrada.alvo}`);
  const n = entrada.niveis;
  let over = {};
  for (const c of folhas) {
    const v = SO.ler(params, c);
    let nv = n.tipo === 'valor' ? n[nivel] : v * n[nivel];
    if (n.max != null) nv = Math.min(n.max, nv);
    over = mesclarObj(over, SO.sobrescritaDe(c, nv));
  }
  return SO.aplicarSobrescritas(over, params);
}

/** Folhas que o teto `max` corta em cada nível (a perturbação fica menor que a nominal). */
function saturacao(entrada, params = P) {
  const n = entrada.niveis;
  const out = { baixo: 0, alto: 0 };
  if (n.max == null) return out;
  for (const c of expandir(entrada.alvo, params)) {
    const v = SO.ler(params, c);
    for (const nivel of ['baixo', 'alto']) if ((n.tipo === 'valor' ? n[nivel] : v * n[nivel]) > n.max) out[nivel]++;
  }
  return out;
}

function mesclarObj(a, b) {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === 'object' && a[k] ? mesclarObj(a[k], v) : v;
  return a;
}

/** Joga `replicas` partidas da condição com os parâmetros dados. */
function jogar(params, condicao, { replicas, semente0, cfgBase }) {
  return Array.from({ length: replicas }, (_, i) => R.linhaDe(
    { bloco: 'sensibilidade', condicao, replica: i + 1, semente: semente0 + i, fatores: CONDICOES[condicao], apoioExterno: 1 },
    cfgBase, params));
}

const valor = (l, m) => (l[m] == null ? 0 : Number(l[m]));
const medias = linhas => Object.fromEntries(METRICAS.map(m => [m, ES.media(linhas.map(l => valor(l, m)))]));

/**
 * Roda a varredura. `ids` restringe o catálogo; `progresso(i, n)` opcional.
 * @returns {{ base, entradas, replicas, ms }}
 */
function rodarSensibilidade({ replicas = 30, semente0 = 11001, ids = null, cfgBase = R.CFG_PESQUISA, progresso, params = P } = {}) {
  const t0 = Date.now();
  const cat = ids ? CATALOGO.filter(e => ids.includes(e.id)) : CATALOGO;
  const opts = { replicas, semente0, cfgBase };
  const base = {};
  for (const c of Object.keys(CONDICOES)) {
    const linhas = jogar(params, c, opts);
    base[c] = { linhas, medias: medias(linhas), dp: Object.fromEntries(METRICAS.map(m => [m, ES.dp(linhas.map(l => valor(l, m)))])) };
  }
  const efeitoFusao = (c0, c3) => ES.media(c0.map(l => valor(l, 'E1_atrib'))) - ES.media(c3.map(l => valor(l, 'E1_atrib')));
  const fusaoBase = efeitoFusao(base.C0.linhas, base.C3.linhas);
  const n = cat.length * 2 * Object.keys(CONDICOES).length;
  let feitos = 0;

  const entradas = cat.map(e => {
    const jogos = {};
    for (const nivel of ['baixo', 'alto']) {
      const p = perturbar(e, nivel, params);
      jogos[nivel] = {};
      for (const c of Object.keys(CONDICOES)) { jogos[nivel][c] = jogar(p, c, opts); progresso?.(++feitos, n); }
    }
    const porCondicao = {};
    for (const c of Object.keys(CONDICOES)) {
      porCondicao[c] = {};
      for (const m of METRICAS) {
        const a = jogos.alto[c].map(l => valor(l, m)), b = jogos.baixo[c].map(l => valor(l, m));
        const t = ES.tPareado(a, b);
        const s = base[c].dp[m];
        porCondicao[c][m] = { baixo: ES.media(b), alto: ES.media(a), dif: t.dif, padronizado: s > 0 ? t.dif / s : 0, p: t.p };
      }
    }
    const fusao = { baixo: efeitoFusao(jogos.baixo.C0, jogos.baixo.C3), alto: efeitoFusao(jogos.alto.C0, jogos.alto.C3) };
    fusao.robusto = [fusao.baixo, fusao.alto].every(v => Math.sign(v) === Math.sign(fusaoBase) && Math.abs(v) >= 0.5 * Math.abs(fusaoBase));
    return { ...e, folhas: expandir(e.alvo, params).length, saturadas: saturacao(e, params), porCondicao, fusao, face: face(e, porCondicao) };
  });

  // Correção de Holm sobre os testes de face (uma família por varredura).
  const testes = entradas.flatMap(e => e.face);
  const aj = ES.holm(testes.map(f => f.p));
  testes.forEach((f, i) => {
    f.pHolm = aj[i];
    f.situacao = f.pHolm >= 0.05 ? 'nulo' : Math.sign(f.dif) === f.esperado ? 'coerente' : 'contraintuitivo';
  });
  return { base: { C0: base.C0.medias, C3: base.C3.medias, dp: base.C0.dp, efeitoFusao: fusaoBase }, entradas, replicas, semente0, ms: Date.now() - t0 };
}

/** Testes de face de uma entrada (sem a classificação, feita após Holm). */
function face(e, porCondicao) {
  const { condicao = 'C0', ...sentidos } = e.esperado ?? {};
  return Object.entries(sentidos).map(([m, esperado]) => {
    const r = porCondicao[condicao][m];
    return { id: e.id, metrica: m, condicao, esperado, dif: r.dif, p: r.p };
  });
}

/** Ranking (tornado): maior |efeito padronizado| de cada entrada numa métrica. */
function ranking(resultado, metrica, condicao = 'C0') {
  return resultado.entradas
    .map(e => ({ id: e.id, rotulo: e.rotulo, grupo: e.grupo, ...e.porCondicao[condicao][metrica] }))
    .sort((a, b) => Math.abs(b.padronizado) - Math.abs(a.padronizado));
}

/** CSV longo: uma linha por entrada × condição × métrica. */
function paraCsv(resultado) {
  const cab = ['id', 'grupo', 'parametro', 'alvo', 'folhas', 'condicao', 'metrica', 'baixo', 'alto', 'dif', 'padronizado', 'p'];
  const f = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : `"${String(v).replace(/"/g, '""')}"`);
  const linhas = [];
  for (const e of resultado.entradas) {
    for (const [c, ms] of Object.entries(e.porCondicao)) {
      for (const [m, r] of Object.entries(ms)) {
        linhas.push([e.id, e.grupo, e.rotulo, e.alvo, e.folhas, c, m, r.baixo, r.alto, r.dif, r.padronizado, r.p].map(f).join(','));
      }
    }
  }
  return [cab.join(','), ...linhas].join('\n') + '\n';
}

module.exports = { CATALOGO, CONDICOES, METRICAS, expandir, perturbar, saturacao, rodarSensibilidade, ranking, paraCsv };
