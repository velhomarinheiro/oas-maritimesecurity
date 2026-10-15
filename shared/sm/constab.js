'use strict';

/**
 * constab.js — Trilha constabular da OAS-SM (Conceito §5).
 *
 * Gera, turno a turno, as ocorrências de criminalidade marítima difusa —
 * narcotráfico, contrabando/descaminho, pesca IUU, crimes ambientais,
 * pirataria, imigração irregular — com incidência por área de Distrito Naval
 * e por tipo (params.TIPOS_OCORRENCIA). Atores sem comando central: não há
 * ordem de batalha, só ocorrências com prazo para serem atendidas.
 *
 * Dupla função (§5.2). Toda ocorrência é objetivo legítimo — reprimida, pontua
 * na governança (E5_ordem). E parte delas serve ao híbrido:
 *   - cobertura: uma ocorrência de rotina que, sem que se saiba, encobre a
 *     trilha de defesa; o encontro que chega à inspeção revela o vínculo e
 *     gera um evento híbrido para a escada de escalada (SM-2);
 *   - saturação: ocorrências extras que o híbrido provoca nas áreas que NÃO
 *     são seu alvo, para atrair as patrulhas para o flanco oposto (§4.2). O
 *     esforço Azul gasto nelas é a dispersão (E6_dispersao).
 * As duas marcas ficam ocultas: vistaDoJogador as remove. Distinguir rotina
 * de cobertura é a triagem, que depende da fusão (via motor de encontro).
 *
 * Determinismo: duas sub-sequências derivadas da semente da campanha. A de
 * rotina não depende do acoplamento, da postura nem das ações Azuis — a mesma
 * semente gera as mesmas ocorrências de rotina em qualquer condição
 * experimental (blocagem). A de saturação só é consumida quando há
 * intensidade híbrida. O estado guarda os contadores dos geradores e é
 * imutável: cada função devolve um estado novo.
 */

const { PARAMS: P } = require('./params');
const { mulberry32FromState } = require('../rng');
const { TERRAIN_MAP, GRID_W, GRID_H, T_LAND } = require('../board');

// ─── Geometria ───────────────────────────────────────────────────────────────

function cubo(col, row) { const z = row - (col - (col & 1)) / 2; return { x: col, z, y: -col - z }; }
function distHex(c1, r1, c2, r2) {
  const a = cubo(c1, r1), b = cubo(c2, r2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

const TERRA = [];
for (let r = 0; r < GRID_H; r++) for (let c = 0; c < GRID_W; c++) if (TERRAIN_MAP[r][c] === T_LAND) TERRA.push([c, r]);

/** Área de DN do hexágono (pela linha), ou null. */
function areaDoHex(col, row, params = P) {
  const a = params.AREAS_DN.find(x => row >= x.linhas[0] && row <= x.linhas[1]);
  return a ? a.id : null;
}

/** Hexágonos de mar da área, a até DIST_MAX_COSTA da terra, em ordem fixa. */
function hexesDaArea(areaId, params = P) {
  const a = params.AREAS_DN.find(x => x.id === areaId);
  if (!a) return [];
  const out = [];
  for (let r = a.linhas[0]; r <= a.linhas[1]; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const t = TERRAIN_MAP[r][c];
      if (t === T_LAND) continue;
      const dCosta = Math.min(...TERRA.map(([tc, tr]) => distHex(c, r, tc, tr)));
      if (dCosta <= params.DIST_MAX_COSTA) out.push({ col: c, row: r, terreno: t });
    }
  }
  return out;
}

const _cacheHexes = new Map();
function hexesCache(areaId, params) {
  if (params !== P) return hexesDaArea(areaId, params);
  if (!_cacheHexes.has(areaId)) _cacheHexes.set(areaId, hexesDaArea(areaId, params));
  return _cacheHexes.get(areaId);
}

// ─── Sorteios ────────────────────────────────────────────────────────────────

/** Poisson(λ) por Knuth — λ pequeno (incidência por turno). */
function poisson(rng, lambda) {
  if (!(lambda > 0)) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

function pickPeso(rng, itens) {
  const total = itens.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [v, w] of itens) { if ((x -= w) < 0) return v; }
  return itens[itens.length - 1][0];
}

// ─── Estado ──────────────────────────────────────────────────────────────────

/**
 * @param {object} cfg
 * @param {number} cfg.seed           semente da campanha
 * @param {string[]} [cfg.areasAtivas] áreas de DN ativas (configurador, §8.1); padrão: todas
 * @param {string[]} [cfg.tiposAtivos] tipos de ocorrência ativos; padrão: todos
 */
function criarEstadoConstab({ seed, areasAtivas, tiposAtivos } = {}, params = P) {
  if (!Number.isInteger(seed)) throw new Error('constab: semente inteira é obrigatória');
  const areas = areasAtivas ?? params.AREAS_DN.map(a => a.id);
  const tipos = tiposAtivos ?? Object.keys(params.TIPOS_OCORRENCIA);
  for (const a of areas) if (!params.AREAS_DN.some(x => x.id === a)) throw new Error(`constab: área desconhecida ${a}`);
  for (const t of tipos) if (!params.TIPOS_OCORRENCIA[t]) throw new Error(`constab: tipo desconhecido ${t}`);
  return {
    turno: 0,
    areasAtivas: [...areas],
    tiposAtivos: [...tipos],
    rng: { rotina: (seed ^ params.SAL_CONSTAB.rotina) >>> 0, saturacao: (seed ^ params.SAL_CONSTAB.saturacao) >>> 0 },
    ativas: [],
    encerradas: [],
    esforco: { total: 0, instrumentalizado: 0 },
  };
}

function novaOcorrencia(id, turno, rng, area, tipo, marcas, params) {
  const hexes = hexesCache(area, params).filter(h => params.TIPOS_OCORRENCIA[tipo].terrenos.includes(h.terreno));
  if (!hexes.length) return null;
  const h = hexes[Math.floor(rng() * hexes.length)];
  const T = params.TIPOS_OCORRENCIA[tipo];
  return {
    id, turno, tipo, area, col: h.col, row: h.row,
    turnosRestantes: T.duracao,
    status: 'ativa',
    // Atributos de contato para o motor de encontro (SM-1). Criminosos comuns
    // não negam autoria por desenho de Estado: negabilidade baixa.
    contato: { atribuicao: 0, negabilidade: 'baixa', evasao: T.evasao },
    esforco: 0,
    cobertura: !!marcas.cobertura,
    instrumentalizada: !!marcas.instrumentalizada,
    vinculoRevelado: false,
  };
}

/**
 * Avança um turno de 24 h: envelhece as ocorrências abertas (as que zeram o
 * prazo escapam) e gera as novas do turno.
 *
 * @param {object} estado
 * @param {object} [acoplamento]
 * @param {number} [acoplamento.intensidade]  intensidade híbrida 0–1 (0 = sem híbrido)
 * @param {string} [acoplamento.areaAlvo]     área onde o híbrido age; a saturação vai às demais
 * @returns {{estado, novas: object[], escaparam: object[]}}
 */
function avancarTurno(estado, acoplamento = {}, params = P) {
  const e = {
    ...estado,
    turno: estado.turno + 1,
    rng: { ...estado.rng },
    ativas: [],
    encerradas: [...estado.encerradas],
    esforco: { ...estado.esforco },
  };

  const escaparam = [];
  for (const o of estado.ativas) {
    const resto = o.turnosRestantes - 1;
    if (resto <= 0) { const f = { ...o, turnosRestantes: 0, status: 'escapou' }; escaparam.push(f); e.encerradas.push(f); }
    else e.ativas.push({ ...o, turnosRestantes: resto });
  }

  const intensidade = Math.min(1, Math.max(0, Number(acoplamento.intensidade) || 0));
  const pCob = params.ACOPLAMENTO.pCoberturaMax * intensidade;

  // Rotina: ordem fixa (área × tipo), sorteios só da sub-sequência de rotina;
  // IDs OC-<turno>-<n>. A saturação usa OS-<turno>-<n>.
  // A marca de cobertura sai de um sorteio de rotina sempre consumido, para
  // que a intensidade não desloque a sequência.
  const rot = mulberry32FromState(e.rng.rotina);
  const novas = [];
  for (const area of e.areasAtivas) {
    for (const tipo of e.tiposAtivos) {
      const n = poisson(rot, params.TIPOS_OCORRENCIA[tipo].lambda[area] ?? 0);
      for (let k = 0; k < n; k++) {
        const u = rot();
        const o = novaOcorrencia(`OC-${e.turno}-${novas.length + 1}`, e.turno, rot, area, tipo,
                                 { cobertura: u < pCob }, params);
        if (o) novas.push(o);
      }
    }
  }
  e.rng.rotina = rot.state;

  // Saturação instrumentalizada: só com intensidade, nas áreas ativas fora do alvo.
  if (intensidade > 0) {
    const flancos = e.areasAtivas.filter(a => a !== acoplamento.areaAlvo);
    const tiposExp = e.tiposAtivos.map(t => [t, params.TIPOS_OCORRENCIA[t].exploravel]).filter(([, w]) => w > 0);
    if (flancos.length && tiposExp.length) {
      const sat = mulberry32FromState(e.rng.saturacao);
      const n = poisson(sat, params.ACOPLAMENTO.lambdaSaturacaoMax * intensidade);
      let k = 0;
      for (let j = 0; j < n; j++) {
        const area = flancos[Math.floor(sat() * flancos.length)];
        const tipo = pickPeso(sat, tiposExp);
        const o = novaOcorrencia(`OS-${e.turno}-${k + 1}`, e.turno, sat, area, tipo, { instrumentalizada: true }, params);
        if (o) { novas.push(o); k++; }
      }
      e.rng.saturacao = sat.state;
    }
  }

  e.ativas.push(...novas);
  return { estado: e, novas, escaparam };
}

/**
 * Registra a resposta de uma unidade a uma ocorrência aberta, com o resultado
 * de motor_encontro.resolverEncontro. Conta o esforço (unidade-turno) e, se o
 * encontro chegou à etapa de repressão do tipo, encerra a ocorrência como
 * reprimida. Se a ocorrência é cobertura e o encontro chegou à etapa que
 * revela o vínculo, devolve um evento híbrido para a escada (SM-2).
 *
 * @returns {{estado, reprimida: boolean, eventoHibrido: object|null}}
 */
function registrarResposta(estado, idOcorrencia, encontro, params = P) {
  const i = estado.ativas.findIndex(o => o.id === idOcorrencia);
  if (i < 0) throw new Error(`constab: ocorrência ${idOcorrencia} não está aberta`);
  const o = estado.ativas[i];
  const T = params.TIPOS_OCORRENCIA[o.tipo];
  const etapas = params.ETAPAS;
  const atingida = encontro?.etapaAtingida ? etapas.indexOf(encontro.etapaAtingida) : -1;
  const efetivo = !!encontro?.efetivo;

  const esforco = { ...estado.esforco };
  if (efetivo) {
    esforco.total++;
    if (o.instrumentalizada) esforco.instrumentalizado++;
  }

  const atual = {
    ...o,
    esforco: o.esforco + (efetivo ? 1 : 0),
    contato: { ...o.contato, atribuicao: encontro?.atribuicao?.depois ?? o.contato.atribuicao },
  };

  let eventoHibrido = null;
  if (o.cobertura && !o.vinculoRevelado && atingida >= etapas.indexOf(params.ACOPLAMENTO.etapaRevelaVinculo)) {
    atual.vinculoRevelado = true;
    eventoHibrido = { tipo: 'incidente_hibrido', origem: o.id, atribuicao: atual.contato.atribuicao };
  }

  const reprimida = atingida >= etapas.indexOf(T.etapaRepressao);
  const ativas = estado.ativas.slice();
  const encerradas = estado.encerradas.slice();
  if (reprimida) {
    ativas.splice(i, 1);
    encerradas.push({ ...atual, status: 'reprimida' });
  } else {
    ativas[i] = atual;
  }
  return { estado: { ...estado, ativas, encerradas, esforco }, reprimida, eventoHibrido };
}

/**
 * Injeta uma ocorrência (episódio de crise, Célula Branca). Não consome as
 * sub-sequências do gerador: o hexágono é escolhido por `indice` entre os
 * hexágonos admitidos da área, em ordem fixa.
 *
 * @param {{id: string, tipo: string, area: string, indice?: number}} req
 * @returns {{estado, ocorrencia: object|null}}
 */
function injetarOcorrencia(estado, { id, tipo, area, indice = 0 }, params = P) {
  if (!params.TIPOS_OCORRENCIA[tipo]) throw new Error(`constab: tipo desconhecido ${tipo}`);
  if (estado.ativas.some(o => o.id === id) || estado.encerradas.some(o => o.id === id)) throw new Error(`constab: id repetido ${id}`);
  let k = indice;
  const fixo = () => { const hs = hexesCache(area, params).filter(h => params.TIPOS_OCORRENCIA[tipo].terrenos.includes(h.terreno));
                       return hs.length ? (k++ % hs.length) / hs.length + 1e-9 : 0; };
  const o = novaOcorrencia(id, estado.turno, fixo, area, tipo, { injetada: true }, params);
  if (!o) return { estado, ocorrencia: null };
  const oc = { ...o, injetada: true };
  return { estado: { ...estado, ativas: [...estado.ativas, oc] }, ocorrencia: oc };
}

/** O que o jogador vê: sem as marcas ocultas (cobertura/instrumentalizada). */
function vistaDoJogador(ocorrencia) {
  const { cobertura: _c, instrumentalizada: _i, ...resto } = ocorrencia;
  return resto;
}

/** Métricas da trilha (Desenho §4): E5_ordem, E6_dispersao e contagens. */
function metricas(estado) {
  const todas = [...estado.encerradas, ...estado.ativas];
  const n = todas.length;
  const reprimidas = estado.encerradas.filter(o => o.status === 'reprimida').length;
  return {
    n_ocorr_crim: n,
    ocorr_reprimidas: reprimidas,
    E5_ordem: n ? reprimidas / n : 0,
    E6_dispersao: estado.esforco.total ? estado.esforco.instrumentalizado / estado.esforco.total : 0,
    esforco_total: estado.esforco.total,
    esforco_instrumentalizado: estado.esforco.instrumentalizado,
    n_instrumentalizadas: todas.filter(o => o.instrumentalizada).length,
    n_coberturas: todas.filter(o => o.cobertura).length,
  };
}

module.exports = {
  distHex, areaDoHex, hexesDaArea, poisson,
  criarEstadoConstab, avancarTurno, registrarResposta, injetarOcorrencia, vistaDoJogador, metricas,
};
