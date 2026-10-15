'use strict';

/**
 * scenario.js — Ordem de batalha anotada: a OB que carrega a própria classificação.
 * ================================================================================
 *
 * A OB padrão (shared/order_of_battle.js) é só a lista de unidades. A
 * classificação de cada uma — a que pacote de capacidade pertence, em que grupo-
 * tarefa entra, que condição de vitória ela é alvo — vive em constantes por id
 * espalhadas pelo código (CAPABILITY_FACTORS, a taxonomia, OBJECTIVE_IDS, …).
 *
 * Uma OB carregada de planilha pode incluir e remover unidades, e uma unidade
 * nova precisa pertencer a algo para o simulador tratá-la como as demais do
 * mesmo pacote. Por isso a OB "anotada" traz três campos por unidade:
 *
 *   pacote  — Azul: A_SSN | B_SSK | C_Azuis | D_MSS | E_Terra (vazio = sempre presente)
 *   grupo   — sigla da taxonomia Camada 2 do lado (vazio = INFRA)
 *   alvos   — condições de vitória de que a unidade é alvo
 *
 * e os limiares das condições (`limiares`). O motor lê tudo isso da própria OB
 * (ver `cenarioDe`, `factorUnitIds` em capability_factors.js); sem anotação,
 * valem as constantes de sempre.
 *
 * FORMA CANÔNICA. Ordem das chaves e das linhas não é estética: a ordem das
 * unidades define a ordem de `state.units` (movimentos, fila, alvos), e a ordem
 * das chaves de `capabilities` desempata a degradação por dano em
 * `applyDegradation`. A forma canônica fixa as duas, e é dela que sai o hash —
 * a impressão digital que permite reconhecer a mesma OB depois.
 */

const crypto = require('crypto');
const { ORDER_OF_BATTLE } = require('./order_of_battle');
const { CAPABILITY_FACTORS, FACTOR_KEYS, RED_GROUP_KEYS, baseUnitId,
        applyForceConfig } = require('./capability_factors');
const { TAXONOMY, classifyUnit } = require('./force_taxonomy');
const { OBJECTIVE_IDS, OBJECTIVE_THRESHOLDS, OBJECTIVE_SIDE, OBJECTIVE_LABELS } = require('./objectives');
const { GRID_W, GRID_H, colLetra, getTerrain, canEnterTerrain, TERRAIN_NAMES,
        COMP_DISPLAY_TYPE } = require('./board');

const VERSAO = 1;

// Ordens canônicas. Conferido nas 53 unidades da OB padrão: estas ordens
// reproduzem exatamente a ordem de inserção de cada uma.
const CATEGORIAS  = ['surface', 'submarine', 'air', 'land', 'specops'];
const RANGE_KEYS  = ['surface', 'air', 'submarine', 'land'];
const ARMAS       = ['ascm', 'mss', 'torpedo', 'lacm', 'asbm', 'raid'];
const CAPACIDADES = ['navalGun', 'airDefense', 'bmd', 'asw', 'airAttack'];
const ALVOS       = ['carrier', 'logistics', 'amphib', 'nucsub', 'surface', 'fpsos', 'ports'];
const LIMIARES    = ['blueLogisticsKills', 'blueSurfaceDegPct', 'redFpsoKills', 'redPortDegPct'];
const TIPOS_COMPOSICAO = Object.keys(COMP_DISPLAY_TYPE);

/** Siglas de grupo válidas por lado: as da taxonomia + INFRA. */
const GRUPOS = Object.fromEntries(['blue', 'red'].map(side => [side,
  [...(TAXONOMY[side] || []).flatMap(d => d.groups.map(g => g.sigla)), 'INFRA']]));

// Limites. Seguram o custo de um lote (o bot é ~O(n²) por partida) e o tamanho
// do que trafega entre navegador e servidor.
const LIMITES = {
  unidades:     150,   // na OB base
  expandida:    400,   // no pior caso, tudo em quantidade máxima
  composicao:   8,     // itens por unidade
  nome:         40,
  notas:        300,
};

// id: maiúsculas, dígitos e hífen. Fecha a porta para `~` (o separador de
// cópias), espaços e chaves como `__proto__`/`constructor`.
const ID_RE = /^[A-Z0-9][A-Z0-9-]{0,31}$/;
// Texto livre sem os caracteres que viram HTML: nomes e notas chegam ao
// innerHTML em mais de um lugar do jogo.
const TEXTO_PROIBIDO = /[<>&"`]/;

// ─── Forma canônica ──────────────────────────────────────────────────────────

const vazio = v => v === undefined || v === null || v === '';
const txt   = v => String(v).normalize('NFC').trim().replace(/\r\n?/g, '\n');

/**
 * Unidade em forma canônica: chaves em ordem fixa, opcionais vazios omitidos.
 * Presença importa e é preservada: arma com quantidade 0 não é o mesmo que
 * arma ausente (getWeaponQuantity cai para `capabilities` só quando a arma
 * não existe). Só `''`, `null` e `undefined` contam como ausência.
 */
function canonUnit(u) {
  const out = {
    id:           txt(u.id),
    name:         txt(u.name),
    category:     u.category,
    composition:  (u.composition || []).map(c => ({ type: txt(c.type), quantity: c.quantity })),
    stayingPower: u.stayingPower,
    movement:     u.movement,
    detectionRange: Object.fromEntries(RANGE_KEYS.map(k => [k, u.detectionRange?.[k] ?? 0])),
    attackRange:    Object.fromEntries(RANGE_KEYS.map(k => [k, u.attackRange?.[k] ?? 0])),
    weapons:      {},
    capabilities: {},
    position:     { col: u.position.col, row: u.position.row },
  };
  for (const a of ARMAS) {
    const w = u.weapons?.[a];
    if (w && !vazio(w.quantity)) out.weapons[a] = { quantity: w.quantity, range: w.range };
  }
  for (const c of CAPACIDADES) {
    if (!vazio(u.capabilities?.[c])) out.capabilities[c] = u.capabilities[c];
  }
  if (!vazio(u.embarked)) out.embarked = txt(u.embarked);
  if (!vazio(u.hostId))   out.hostId   = txt(u.hostId);
  if (u.stealthy === true) out.stealthy = true;
  if (!vazio(u.notes))    out.notes    = txt(u.notes);
  if (!vazio(u.pacote))   out.pacote   = u.pacote;
  out.grupo = vazio(u.grupo) ? 'INFRA' : u.grupo;
  const alvos = ALVOS.filter(a => (u.alvos || []).includes(a));
  if (alvos.length) out.alvos = alvos;
  return out;
}

function canonOB(ob) {
  return {
    anotada:  true,
    v:        VERSAO,
    limiares: Object.fromEntries(LIMIARES.map(k => [k, ob.limiares?.[k] ?? OBJECTIVE_THRESHOLDS[k]])),
    forces: {
      blue: ob.forces.blue.map(canonUnit),
      red:  ob.forces.red.map(canonUnit),
    },
  };
}

/** Impressão digital: SHA-256 do JSON canônico, 16 hex. */
function obHash(canon) {
  return crypto.createHash('sha256').update(JSON.stringify(canon)).digest('hex').slice(0, 16);
}

// ─── A OB padrão, anotada a partir das constantes ────────────────────────────

/**
 * OB padrão com a classificação que hoje está nas constantes. É o que a
 * planilha baixada traz, e o teste exige que o cenário derivado dela reproduza
 * as constantes exatamente.
 */
function annotateDefault(ob = ORDER_OF_BATTLE) {
  const pacoteDe = id => FACTOR_KEYS.find(k => CAPABILITY_FACTORS[k].unitIds.includes(id));
  const alvosDe  = id => ALVOS.filter(a => {
    const t = OBJECTIVE_IDS.blueTargets[a] ?? OBJECTIVE_IDS.redTargets[a];
    return [].concat(t).includes(id);
  });
  const anotar = side => ob.forces[side].map(u => ({
    ...u,
    pacote: side === 'blue' ? pacoteDe(u.id) : undefined,
    grupo:  classifyUnit(u.id, side).sigla,
    alvos:  alvosDe(u.id),
  }));
  return canonOB({ limiares: OBJECTIVE_THRESHOLDS, forces: { blue: anotar('blue'), red: anotar('red') } });
}

const DEFAULT_ANOTADA = annotateDefault();
const DEFAULT_HASH    = obHash(DEFAULT_ANOTADA);

/** É a OB padrão sem nenhuma alteração? (então usa-se o caminho de sempre) */
const ehPadrao = canon => obHash(canon) === DEFAULT_HASH;

// ─── O que o motor lê de uma OB anotada ──────────────────────────────────────

/**
 * Classificação de uma OB anotada, na forma que o motor consome
 * (`state.cenario`). Recebe a OB JÁ EXPANDIDA pela composição de força: as
 * cópias (`RED-GBPA~2`) carregam as marcações da original, e os alvos são
 * listados por id base, como `computeObjectives` casa.
 * Devolve null para OB sem anotação — o motor então usa as constantes.
 */
function cenarioDe(ob) {
  if (!ob?.anotada) return null;
  const idsMarcados = (side, alvo) => [...new Set(
    ob.forces[side].filter(u => (u.alvos || []).includes(alvo)).map(u => baseUnitId(u.id)))];
  const grupos = {};
  for (const side of ['blue', 'red']) {
    grupos[side] = {};
    for (const u of ob.forces[side]) grupos[side][baseUnitId(u.id)] = u.grupo || 'INFRA';
  }
  return {
    objectiveIds: {
      blueTargets: Object.fromEntries(['carrier', 'logistics', 'amphib', 'nucsub', 'surface']
        .map(a => [a, idsMarcados('red', a)])),
      redTargets:  Object.fromEntries(['fpsos', 'ports'].map(a => [a, idsMarcados('blue', a)])),
    },
    thresholds: { ...OBJECTIVE_THRESHOLDS, ...(ob.limiares || {}) },
    grupos,
  };
}

/** Pacotes e grupos-tarefa de uma OB, para a tela do simulador. */
function descreverForcas(ob) {
  const nomes = side => Object.fromEntries(ob.forces[side].map(u => [u.id, u.name]));
  const nb = nomes('blue'), nr = nomes('red');
  const pacotes = Object.fromEntries(FACTOR_KEYS.map(k => {
    const ids = ob.anotada ? ob.forces.blue.filter(u => u.pacote === k).map(u => u.id)
                           : CAPABILITY_FACTORS[k].unitIds;
    return [k, ids.map(id => ({ id, nome: nb[id] || id }))];
  }));
  const grupos = Object.fromEntries(RED_GROUP_KEYS.map(s => {
    const ids = ob.anotada ? ob.forces.red.filter(u => u.grupo === s).map(u => u.id)
                           : ob.forces.red.filter(u => classifyUnit(u.id, 'red').sigla === s).map(u => u.id);
    return [s, ids.map(id => ({ id, nome: nr[id] || id }))];
  }));
  return { pacotes, grupos };
}

// ─── Validação ───────────────────────────────────────────────────────────────

const nomeHex = (col, row) =>
  `${col >= 0 && col < GRID_W ? colLetra(col) : '?'}${row + 1}`;

/**
 * Valida um rascunho de OB (vindo da planilha ou do JSON reenviado pelo
 * navegador) e devolve a forma canônica.
 *
 * Cada unidade do rascunho pode trazer `_onde`: { campo → 'Unidades!J12' }, e
 * `_linha`. É o que permite a mensagem apontar a célula para o usuário corrigir
 * no Excel. Sem `_onde`, a mensagem cita a unidade e o campo.
 *
 * @returns {{ ob: object|null, erros: string[], avisos: string[] }}
 */
function validarOB(rascunho) {
  const erros = [], avisos = [];
  const lugar = (u, campo) => u?._onde?.[campo] || (u?.id ? `unidade ${u.id} — ${campo}` : campo);
  // Célula que a leitura já recusou (texto num campo numérico, data…) não ganha
  // um segundo erro aqui ("obrigatório"): um problema, uma mensagem.
  const erro  = (u, campo, msg) => { if (!u?._invalido?.[campo]) erros.push(`${lugar(u, campo)}: ${msg}`); };

  const forces = { blue: rascunho?.forces?.blue || [], red: rascunho?.forces?.red || [] };
  const todas  = [...forces.blue.map(u => ['blue', u]), ...forces.red.map(u => ['red', u])];

  if (!forces.blue.length) erros.push('A Força Azul não tem nenhuma unidade.');
  if (!forces.red.length)  erros.push('A Força Vermelha não tem nenhuma unidade.');
  if (todas.length > LIMITES.unidades) {
    erros.push(`A ordem de batalha tem ${todas.length} unidades; o limite é ${LIMITES.unidades}.`);
  }

  // ── Identidade e campos de cada unidade ──
  const porId = new Map();
  for (const [side, u] of todas) {
    if (vazio(u.id)) { erro(u, 'id', 'id é obrigatório.'); continue; }
    if (!ID_RE.test(u.id)) {
      erro(u, 'id', `id "${u.id}" inválido — use letras maiúsculas, dígitos e hífen (até 32).`);
      continue;
    }
    if (porId.has(u.id)) erro(u, 'id', `id "${u.id}" repetido.`);
    else porId.set(u.id, { side, u });

    if (vazio(u.name)) erro(u, 'name', 'nome é obrigatório.');
    else if (String(u.name).length > LIMITES.nome) erro(u, 'name', `nome com mais de ${LIMITES.nome} caracteres.`);
    else if (TEXTO_PROIBIDO.test(u.name)) erro(u, 'name', 'nome não pode conter < > & " `.');
    if (!vazio(u.notes) && String(u.notes).length > LIMITES.notas) erro(u, 'notes', `notas com mais de ${LIMITES.notas} caracteres.`);
    if (!vazio(u.notes) && TEXTO_PROIBIDO.test(u.notes)) erro(u, 'notes', 'notas não podem conter < > & " `.');

    if (!CATEGORIAS.includes(u.category)) {
      erro(u, 'category', `categoria "${u.category ?? ''}" inválida — use ${CATEGORIAS.join(', ')}.`);
    }

    const comp = u.composition || [];
    if (!comp.length) erro(u, 'composition', 'a unidade não tem nenhuma linha na aba Composição.');
    if (comp.length > LIMITES.composicao) erro(u, 'composition', `mais de ${LIMITES.composicao} itens de composição.`);
    for (const c of comp) {
      const onde = c._onde || lugar(u, 'composition');
      if (!TIPOS_COMPOSICAO.includes(c.type)) erros.push(`${onde}: tipo de composição "${c.type}" desconhecido.`);
      if (!inteiroEntre(c.quantity, 1, 99)) erros.push(`${onde}: quantidade deve ser inteira entre 1 e 99.`);
    }

    faixa(u, 'stayingPower', 1, 99, 'SP');
    faixa(u, 'movement', 0, 20, 'movimento');
    for (const k of RANGE_KEYS) {
      faixa(u, `det_${k}`, 0, 15, 'detecção', u.detectionRange?.[k]);
      faixa(u, `alc_${k}`, 0, 15, 'alcance', u.attackRange?.[k]);
    }
    for (const a of ARMAS) {
      const w = u.weapons?.[a];
      if (!w || vazio(w.quantity)) continue;
      faixa(u, `${a}_qtd`, 0, 999, `${a} (quantidade)`, w.quantity);
      if (vazio(w.range)) erro(u, `${a}_alc`, `${a} tem quantidade mas não tem alcance.`);
      else faixa(u, `${a}_alc`, 1, 15, `${a} (alcance)`, w.range);
    }
    for (const c of CAPACIDADES) {
      if (!vazio(u.capabilities?.[c])) faixa(u, c, 0, 99, c, u.capabilities[c]);
    }

    // Posição e terreno
    const p = u.position || {};
    if (!inteiroEntre(p.col, 0, GRID_W - 1) || !inteiroEntre(p.row, 0, GRID_H - 1)) {
      erro(u, 'position', `posição fora do tabuleiro (colunas A–${colLetra(GRID_W - 1)}, linhas 1–${GRID_H}).`);
    } else if (CATEGORIAS.includes(u.category) && !canEnterTerrain(u.category, getTerrain(p.col, p.row))) {
      erro(u, 'position', `${nomeHex(p.col, p.row)} é ${TERRAIN_NAMES[getTerrain(p.col, p.row)]} — `
        + `terreno incompatível com a categoria ${u.category}.`);
    }

    // Classificação
    if (!vazio(u.pacote)) {
      if (side !== 'blue') erro(u, 'pacote', 'pacote de capacidade só existe na Força Azul.');
      else if (!FACTOR_KEYS.includes(u.pacote)) erro(u, 'pacote', `pacote "${u.pacote}" inválido — use ${FACTOR_KEYS.join(', ')} ou deixe vazio.`);
    }
    if (!vazio(u.grupo) && !GRUPOS[side].includes(u.grupo)) {
      erro(u, 'grupo', `grupo "${u.grupo}" não existe na Força ${side === 'blue' ? 'Azul' : 'Vermelha'} — use ${GRUPOS[side].join(', ')}.`);
    }
    if (vazio(u.grupo)) avisos.push(`${lugar(u, 'grupo')}: sem grupo — ${u.id} entra em INFRA nos relatórios.`);
    for (const a of u.alvos || []) {
      if (!ALVOS.includes(a)) erro(u, `alvo_${a}`, `alvo "${a}" desconhecido.`);
      else if (OBJECTIVE_SIDE[a] !== side) {
        erro(u, `alvo_${a}`, `${OBJECTIVE_LABELS[a]} é alvo da Força ${OBJECTIVE_SIDE[a] === 'red' ? 'Vermelha' : 'Azul'}, não pode marcar unidade ${side === 'blue' ? 'azul' : 'vermelha'}.`);
      }
    }
  }

  function faixa(u, campo, min, max, rotulo, valor = u[campo]) {
    if (vazio(valor)) { erro(u, campo, `${rotulo} é obrigatório.`); return; }
    if (!inteiroEntre(valor, min, max)) erro(u, campo, `${rotulo} deve ser inteiro entre ${min} e ${max} (veio "${valor}").`);
  }

  // ── Dependentes: embarcado_em / hospedeiro ──
  for (const [side, u] of todas) {
    for (const [campo, rotulo] of [['embarked', 'embarcado_em'], ['hostId', 'hospedeiro']]) {
      if (vazio(u[campo])) continue;
      const alvo = porId.get(u[campo]);
      if (!alvo) { erro(u, campo, `${rotulo} aponta "${u[campo]}", que não existe.`); continue; }
      if (alvo.side !== side) erro(u, campo, `${rotulo} aponta unidade da outra força.`);
      if (u[campo] === u.id) erro(u, campo, `${rotulo} aponta a própria unidade.`);
      if (!vazio(alvo.u.embarked) || !vazio(alvo.u.hostId)) {
        erro(u, campo, `${rotulo} aponta "${u[campo]}", que também viaja a bordo de outra — não há embarque em cadeia.`);
      }
    }
    // Dependente com pacote seria copiado duas vezes (pelo próprio pacote e
    // junto do hospedeiro). A OB padrão já respeita isso.
    if ((!vazio(u.embarked) || !vazio(u.hostId)) && !vazio(u.pacote)) {
      erro(u, 'pacote', 'unidade embarcada ou hospedada não pode ter pacote — ela segue o pacote do hospedeiro.');
    }
  }

  // ── Limiares e alvos das condições de vitória ──
  const lim = { ...OBJECTIVE_THRESHOLDS, ...(rascunho?.limiares || {}) };
  const ondeLim = k => rascunho?._ondeLimiares?.[k] || `limiar ${k}`;
  const contar = a => todas.filter(([, u]) => (u.alvos || []).includes(a)).length;
  const nAlvo = Object.fromEntries(ALVOS.map(a => [a, contar(a)]));

  for (const k of ['blueSurfaceDegPct', 'redPortDegPct']) {
    if (!inteiroEntre(lim[k], 1, 100)) erros.push(`${ondeLim(k)}: deve ser inteiro entre 1 e 100 (%).`);
  }
  for (const [k, alvo] of [['blueLogisticsKills', 'logistics'], ['redFpsoKills', 'fpsos']]) {
    if (!inteiroEntre(lim[k], 1, 99)) erros.push(`${ondeLim(k)}: deve ser inteiro positivo.`);
    else if (lim[k] > nAlvo[alvo]) {
      erros.push(`${ondeLim(k)}: pede ${lim[k]} ${OBJECTIVE_LABELS[alvo]}(s) neutralizado(s), mas só `
        + `${nAlvo[alvo]} unidade(s) estão marcadas como alvo "${OBJECTIVE_LABELS[alvo]}" — condição impossível.`);
    }
  }
  // Uma condição sem alvo seria cumprida sozinha: computeObjectives trata grupo
  // vazio como neutralizado. Melhor recusar que entregar vitória de graça.
  for (const a of ALVOS) {
    if (nAlvo[a] === 0) {
      erros.push(`Nenhuma unidade está marcada como alvo "${OBJECTIVE_LABELS[a]}" — a condição de vitória `
        + `correspondente seria cumprida automaticamente. Marque ao menos uma.`);
    }
  }

  if (erros.length) return { ob: null, erros, avisos };

  // ── Avisos que dependem da OB já consistente ──
  const ob = canonOB({ limiares: lim, forces: {
    blue: forces.blue.map(u => ({ ...u, grupo: u.grupo })),
    red:  forces.red.map(u => ({ ...u, grupo: u.grupo })),
  } });

  for (const k of FACTOR_KEYS) {
    if (!ob.forces.blue.some(u => u.pacote === k)) {
      avisos.push(`Pacote ${k} ficou sem unidades: ligá-lo ou desligá-lo não muda a partida, mas o custo continua contando.`);
    }
  }
  for (const u of [...ob.forces.blue, ...ob.forces.red]) {
    if (!u.alvos) continue;
    if (u.pacote) {
      avisos.push(`${u.id} é alvo de condição de vitória e pertence ao pacote ${u.pacote}: com ${u.pacote}=0 a `
        + `unidade sai da partida e a condição muda de sentido.`);
    }
    if (u.embarked || u.hostId) {
      avisos.push(`${u.id} é alvo de condição de vitória e viaja a bordo de ${u.embarked || u.hostId}: se o hospedeiro sair, sai junto.`);
    }
  }
  const idsPadrao = new Set([...ORDER_OF_BATTLE.forces.blue, ...ORDER_OF_BATTLE.forces.red].map(u => u.id));
  const novas = [...ob.forces.blue, ...ob.forces.red].filter(u => !idsPadrao.has(u.id));
  if (novas.length) {
    avisos.push(`Unidades novas (${novas.length}): ${novas.map(u => `${u.id}${u.pacote ? ` [${u.pacote}]` : ''}`).join(', ')} `
      + `— confira o pacote, o grupo e os alvos de cada uma.`);
  }

  // Pior caso expandido: tudo na quantidade máxima. É o que o lote pode pedir.
  const maxima = applyForceConfig(ob, {
    factors:   Object.fromEntries(FACTOR_KEYS.map(k => [k, 4])),
    redGroups: Object.fromEntries(RED_GROUP_KEYS.map(s => [s, 4])),
  });
  const n = maxima.forces.blue.length + maxima.forces.red.length;
  if (n > LIMITES.expandida) {
    avisos.push(`Com todos os pacotes e grupos em quantidade 4 esta OB chega a ${n} unidades; `
      + `composições acima de ${LIMITES.expandida} serão recusadas na hora de rodar.`);
  }

  return { ob, erros, avisos };
}

function inteiroEntre(v, min, max) {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/**
 * Resumo para a tela: contagens, unidades incluídas e removidas em relação à
 * padrão. `ob` em forma canônica.
 */
function resumirOB(ob) {
  const idsPadrao = { blue: new Set(ORDER_OF_BATTLE.forces.blue.map(u => u.id)),
                      red:  new Set(ORDER_OF_BATTLE.forces.red.map(u => u.id)) };
  const out = {};
  for (const side of ['blue', 'red']) {
    const ids = new Set(ob.forces[side].map(u => u.id));
    out[side] = {
      unidades:  ob.forces[side].length,
      incluidas: ob.forces[side].filter(u => !idsPadrao[side].has(u.id)).map(u => u.id),
      removidas: [...idsPadrao[side]].filter(id => !ids.has(id)),
    };
  }
  return out;
}

module.exports = {
  VERSAO, CATEGORIAS, RANGE_KEYS, ARMAS, CAPACIDADES, ALVOS, LIMIARES,
  TIPOS_COMPOSICAO, GRUPOS, LIMITES, ID_RE,
  canonUnit, canonOB, obHash, annotateDefault, ehPadrao,
  DEFAULT_ANOTADA, DEFAULT_HASH,
  cenarioDe, descreverForcas, validarOB, resumirOB, nomeHex,
};
