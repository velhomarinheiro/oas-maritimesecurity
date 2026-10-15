'use strict';
const express  = require('express');
const crypto   = require('crypto');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const fs       = require('fs');
const zlib     = require('zlib');
const archiver = require('archiver');
const { ORDER_OF_BATTLE }  = require('./shared/order_of_battle');
const { COMBAT_CONFIG }    = require('./shared/combat_config');
const { resolveEngagement, getWeaponQuantity, getWeaponRange } = require('./shared/combat_engine');
const {
  initializeFuel, isFuelDisabled,
  canMove, canAttack, canDefend,
  navalMoveCost, spendNavalFuel, spendAirFuel,
  spendEngagementFuel, spendDamageFuel,
  recoverNavalFuel, isNavalRefuelProvider,
  checkNavalFuelZero, checkAirFuelLosses,
  recoverAircraft, resetFuelTurnCounters,
  FUEL_TURN_LIMIT,
} = require('./fuel_model');
const gameLogger = require('./game_logger');
const { mulberry32 } = require('./shared/rng');
const combatRng = require('./shared/combat_engine');
const { CAPABILITY_FACTORS, FACTOR_KEYS, RED_GROUPS, RED_GROUP_KEYS,
        applyForceConfig, quantityOf, baseUnitId, describeRedConfig,
        totalCost, MAX_QUANTITY } = require('./shared/capability_factors');
const { FACTORIAL_CONDITIONS, ABLATION_CONDITIONS } = require('./shared/conditions');
const { hasOffensiveMeans, offensiveStockRatio } = require('./shared/metrics');
const scenario = require('./shared/scenario');
const { cenarioDe } = scenario;
const constructiveSim = require('./shared/constructive_sim');

const PORT   = process.env.PORT || 3000;
// Grade, terreno e tipos de plataforma: shared/board.js (o validador de OB
// carregada de planilha usa as mesmas regras).
const { GRID_W, GRID_H, T_LAND, T_SHALLOW, T_SHELF, T_DEEP, T_OIL,
        getTerrain, canEnterTerrain,
        COMP_DISPLAY_TYPE, DISPLAY_TYPE_FALLBACK } = require('./shared/board');
// Limite operacional em dias de jogo (turnos dia+noite); configurável p/ testes
const MAX_TURNS = parseInt(process.env.MAX_TURNS, 10) || 12;

// ─── Range helper ─────────────────────────────────────────────────────────────
function rangeAgainst(rangeTable, targetCategory) {
  if (!rangeTable) return 0;
  return Number(rangeTable[targetCategory] || 0);
}

// ─── Hex math (odd-q offset, flat-top) — matches client hex.js ──────────────
function oddqToCube(col, row) {
  const x = col;
  const z = row - (col - (col & 1)) / 2;
  return { x, y: -x - z, z };
}
function cubeToOddq(x, z) { return { col: x, row: z + (x - (x & 1)) / 2 }; }
const CUBE_DIRS = [
  {dx:+1,dy:-1,dz:0},{dx:+1,dy:0,dz:-1},{dx:0,dy:+1,dz:-1},
  {dx:-1,dy:+1,dz:0},{dx:-1,dy:0,dz:+1},{dx:0,dy:-1,dz:+1},
];
function hexNeighbors(col, row) {
  const c = oddqToCube(col, row);
  return CUBE_DIRS.map(d => cubeToOddq(c.x+d.dx, c.z+d.dz))
    .filter(({col:nc,row:nr}) => nc>=0 && nc<GRID_W && nr>=0 && nr<GRID_H);
}
function hexDist(c1,r1,c2,r2) {
  const a=oddqToCube(c1,r1), b=oddqToCube(c2,r2);
  return Math.max(Math.abs(a.x-b.x), Math.abs(a.y-b.y), Math.abs(a.z-b.z));
}

// ─── Air refuel location check ────────────────────────────────────────────────
// An aircraft may recover fuel when it ends its turn here without moving.
// Blue: any T_LAND hex (land air base) or a friendly carrier unit in the same hex.
// Red:  only a friendly carrier unit in the same hex.
function isAirRefuelLocation(unit, state) {
  return state.units.some(o =>
    o.id !== unit.id &&
    o.team === unit.team &&
    (o.hp ?? 0) > 0 &&
    (o.type === 'aeroporto' || o.type === 'carrier') &&
    o.col === unit.col && o.row === unit.row
  );
}

// ─── Fog of war ──────────────────────────────────────────────────────────────
function saveMovementSnapshot(state) {
  state.movementSnapshot = {};
  for (const u of state.units) {
    state.movementSnapshot[u.id] = { col: u.col, row: u.row };
  }
}

// Fases em que os movimentos do adversário ainda não foram revelados: a própria
// movimentação e, no modo com facilitador, a espera pela autorização dele.
const HIDDEN_MOVE_PHASES = ['movement', 'movement_approval'];

function stateFor(state, team) {
  const night = state.period === 'night';

  // Strip server-internal combat queue fields — clients don't need them
  // `cenario` (classificação de uma OB carregada de planilha) também fica: é
  // dado interno do motor, e listaria os alvos do adversário.
  const { combatQueue: _cq, battleRoundDecisions: _brd, fac: _fac, cenario: _cen, ...stateRest } = state;

  // Facilitador: visão completa, sem névoa de guerra, inclusive os dados de
  // arbitragem (movimentos pendentes de autorização, relatório de combate).
  if (team === 'facilitator') {
    return {
      ...stateRest,
      fac:        state.fac,
      units:      state.units.map(u => ({ ...u, detected: true })),
      objectives: computeObjectives(state),
      maxTurns:   MAX_TURNS,
    };
  }

  // Unidades neutras são contatos públicos (visíveis a todos, sem detecção).
  const neutrals = state.units.filter(u => u.team === NEUTRAL_TEAM && u.hp > 0);

  // During movement phase, show enemy units at their pre-movement positions
  // so moves are hidden until both sides commit (simultaneous movement reveal).
  const enemyActual = state.phase === 'setup'
    ? []   // configuração do facilitador em andamento: nada do adversário vaza
    : state.units.filter(u => u.team !== team && u.team !== NEUTRAL_TEAM && u.hp > 0);
  const hiddenMoves = HIDDEN_MOVE_PHASES.includes(state.phase) && state.movementSnapshot;
  const enemies = hiddenMoves
    ? enemyActual.map(u => {
        const snap = state.movementSnapshot[u.id];
        return snap ? { ...u, col: snap.col, row: snap.row } : u;
      })
    : enemyActual;

  const mine = state.units.filter(u => u.team === team && u.hp > 0);

  // Detection during movement uses pre-movement positions for both sides so the
  // first player to commit cannot see enemies they only approached this turn.
  const mineForDetection = hiddenMoves
    ? mine.map(u => {
        const snap = state.movementSnapshot[u.id];
        return snap ? { ...u, col: snap.col, row: snap.row } : u;
      })
    : mine;

  // Specops are always invisible to the enemy; land units are always detected
  const enemiesForDetection = enemies.filter(e => e.category !== 'specops');

  const detected = enemiesForDetection.filter(enemy => {
    if (enemy.category === 'land') return true; // fixed positions always known
    const stealthy  = !!enemy.stealthy;
    const deepBonus = getTerrain(enemy.col, enemy.row) === T_DEEP ? 1 : 0;
    return mineForDetection.some(f => {
      let range = stealthy
        ? rangeAgainst(f.detectionRange, 'submarine') - deepBonus
        : rangeAgainst(f.detectionRange, enemy.category);
      // Submarines use sonar — unaffected by daylight
      if (night && f.category !== 'submarine') range -= stealthy ? 1 : 2;
      return range >= 1 && hexDist(f.col, f.row, enemy.col, enemy.row) <= range;
    });
  }).map(e => ({ ...e, detected: true }));

  return {
    ...stateRest,
    units:       [...state.units.filter(u => u.team === team), ...neutrals, ...detected],
    blueAttacks: team === 'blue' ? state.blueAttacks : (state.blueAttacks !== null ? '✓' : null),
    redAttacks:  team === 'red'  ? state.redAttacks  : (state.redAttacks  !== null ? '✓' : null),
    objectives:  computeObjectives(state),
    maxTurns:    MAX_TURNS,
  };
}

// ─── Weapon priority per target category ─────────────────────────────────────
const WEAPON_PRIORITY = {
  surface:   ['ascm', 'asbm', 'mss', 'torpedo', 'airAttack', 'navalGun', 'raid'],
  submarine: ['asw', 'torpedo'],
  air:       ['airDefense', 'airAttack'],
  land:      ['lacm', 'airAttack', 'navalGun', 'raid'],
};

function selectBestWeapon(attacker, target, dist) {
  const priority = WEAPON_PRIORITY[target.category] || [];
  for (const wpnType of priority) {
    const qty = getWeaponQuantity(attacker, wpnType);
    if (qty <= 0) continue;
    const profile = COMBAT_CONFIG.weaponProfiles?.[wpnType];
    if (!profile) continue;
    if (!profile.targets.includes(target.category)) continue;
    const range = getWeaponRange(attacker, wpnType);
    if (dist <= range) return wpnType;
  }
  return null;
}

// ─── Air movement range (FP/2, matching the doubled fuel model) ───────────────
function airMovementRange(unit) {
  if (unit.category !== 'air') return unit.movement;
  return Math.floor((unit.fuel?.current ?? unit.movement) / 2);
}

// ─── Unit factory ─────────────────────────────────────────────────────────────
function makeUnit(team, spec) {
  const pos     = spec.position || spec.start || { col: 0, row: 0 };
  const weapons = spec.weapons ? JSON.parse(JSON.stringify(spec.weapons)) : {};
  const unit = {
    id:            spec.id,
    team,
    name:          spec.name,
    category:      spec.category,
    type:          (spec.composition && spec.composition[0] && COMP_DISPLAY_TYPE[spec.composition[0].type]) || DISPLAY_TYPE_FALLBACK[spec.category] || 'fragata',
    composition:   spec.composition || [],
    movement:      spec.movement,
    // Cópias próprias: applyDegradation muta detectionRange, e compartilhar o
    // objeto do spec faria o dano de uma partida vazar para a ORDER_OF_BATTLE
    // global — corrompendo todas as partidas seguintes do mesmo processo.
    detectionRange: spec.detectionRange ? { ...spec.detectionRange } : {},
    attackRange:    spec.attackRange    ? { ...spec.attackRange    } : {},
    col:           pos.col,
    row:           pos.row,
    hp:            spec.stayingPower,
    maxHp:         spec.stayingPower,
    stealthy:      spec.category === 'submarine' || !!spec.stealthy,
    moved:         false,
    weapons,
    initWeapons:   JSON.parse(JSON.stringify(weapons)),
    capabilities:  spec.capabilities ? { ...spec.capabilities } : {},
  };
  initializeFuel(unit);
  unit.initMovement       = unit.movement;
  unit.initDetectionRange = JSON.parse(JSON.stringify(unit.detectionRange || {}));
  unit.initCapabilities   = JSON.parse(JSON.stringify(unit.capabilities   || {}));
  unit.initFuelMax        = unit.fuel?.max ?? 0;
  unit.baseHex            = { col: pos.col, row: pos.row };
  unit.baseUnitId         = spec.embarked || null;
  unit.hostId             = spec.hostId   || null;
  return unit;
}

// ─── Unidades neutras (modo com facilitador) ─────────────────────────────────
// Criadas e movidas só pelo facilitador. São contatos públicos: todos os
// jogadores as veem, ninguém pode atacá-las, e não consomem combustível.
const NEUTRAL_TEAM = 'neutral';
const NEUTRAL_TEMPLATES = {
  mercante:  { name: 'Navio Mercante',        category: 'surface', comp: 'navio_logistico',   stayingPower: 2, movement: 2 },
  pesqueiro: { name: 'Pesqueiro',             category: 'surface', comp: 'navio_patrulha',    stayingPower: 1, movement: 2 },
  hospital:  { name: 'Navio-Hospital (CICV)', category: 'surface', comp: 'navio_logistico',   stayingPower: 3, movement: 2 },
  pesquisa:  { name: 'Navio de Pesquisa',     category: 'surface', comp: 'navio_patoc',       stayingPower: 2, movement: 2 },
  aeronave:  { name: 'Aeronave Civil',        category: 'air',     comp: 'patrulha_maritima', stayingPower: 1, movement: 8 },
};
const ZERO_RANGES = () => ({ surface: 0, air: 0, submarine: 0, land: 0 });

function makeNeutralUnit(id, tpl, name, col, row) {
  const unit = makeUnit(NEUTRAL_TEAM, {
    id, name, category: tpl.category,
    composition:    [{ type: tpl.comp, quantity: 1 }],
    stayingPower:   tpl.stayingPower,
    movement:       tpl.movement,
    detectionRange: ZERO_RANGES(),
    attackRange:    ZERO_RANGES(),
    weapons: {}, capabilities: {},
    position: { col, row },
  });
  unit.fuel = { usesFuel: false, fuelType: 'none' };
  unit.stealthy = false;
  return unit;
}

// `ob` permite jogar com uma ordem de batalha diferente da padrão — é assim
// que a simulação construtiva monta cada pacote de capacidades (ver
// shared/capability_factors.js#applyCapabilityConfig).
function initialUnits(ob = ORDER_OF_BATTLE) {
  const units = [];
  for (const spec of ob.forces.blue) {
    units.push(makeUnit('blue', spec));
  }
  for (const spec of ob.forces.red) {
    units.push(makeUnit('red', spec));
  }
  return units;
}

/**
 * @param {object} ob    ordem de batalha (padrão: ORDER_OF_BATTLE)
 * @param {object} opts  { seed, victoryRule }
 *                       `seed`: com semente, a partida fica reprodutível —
 *                       state.rng alimenta o combate e a degradação por dano.
 *                       Sem semente, nada muda (Math.random, como sempre).
 *                       `victoryRule`: 'objectives' (padrão) ou 'exhaustion'
 *                       (ver VICTORY_RULES).
 */
function newGame(ob = ORDER_OF_BATTLE, opts = {}) {
  const rng = opts.seed != null ? mulberry32(opts.seed) : null;
  const state = {
    turn: 1, period: 'day', phase: 'movement',
    blueDone: false, redDone: false,
    blueAttacks: null, redAttacks: null,
    units: initialUnits(ob),
    log: ['──── Turno 1 · Período Diurno ────', 'Fase de Movimentação iniciada.'],
    winner: null,
    movementSnapshot: {},
    combatQueue: [],
    currentEngagementIndex: 0,
    battleRoundDecisions: { blue: null, red: null },
    rng,
    victoryRule: resolveVictoryRule(opts.victoryRule),
    // Classificação de uma OB carregada de planilha (alvos, limiares, grupos).
    // null para a OB padrão — aí objetivos e métricas usam as constantes.
    cenario: cenarioDe(ob),
    // Impressão digital da OB, para o cliente (cartas de unidade só valem na
    // padrão) e para o registro da partida.
    obId: opts.obId || 'padrao',
  };
  saveMovementSnapshot(state);
  return state;
}

// Partida com facilitador: começa na fase 'setup', em que só o facilitador
// age (ajusta quantidades/posições, cria neutros) até dar a partida.
// `state.fac` guarda os dados de arbitragem, que só o facilitador recebe.
function newFacilitatedGame() {
  const state = newGame();
  state.phase       = 'setup';
  state.facilitated = true;
  state.log         = ['Configuração da partida — o facilitador prepara as forças.'];
  state.messages    = [];
  state.fac         = { pendingMoves: [], combatHpSnapshot: {}, combatReport: [], neutralSeq: 0, cloneSeq: 0 };
  return state;
}

// ─── Battle-round system ─────────────────────────────────────────────────────
// Default salvo sizes (conservative); client may request a specific amount
const SALVO_SIZE = { ascm: 2, mss: 2, torpedo: 1, lacm: 1, asbm: 1 };

function isSingleRoundWeapon(weaponType) {
  return ['lacm', 'asbm'].includes(weaponType);
}

// Intercala os ataques declarados pelas duas equipes, alternando a ordem de
// avaliação/aplicação de dano. Sem isso, todos os ataques azuis seriam
// resolvidos antes de qualquer ataque vermelho, dando vantagem involuntária
// ao azul (alvos podem morrer antes de conseguir atacar de volta). A equipe
// que age primeiro também alterna a cada turno para não fixar a vantagem.
function interleaveAttacks(blueAtks, redAtks, turn) {
  const blueFirst = (turn % 2) === 1;
  const [first, second] = blueFirst ? [blueAtks, redAtks] : [redAtks, blueAtks];
  const result  = [];
  const maxLen  = Math.max(first.length, second.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < first.length)  result.push(first[i]);
    if (i < second.length) result.push(second[i]);
  }
  return result;
}

function buildCombatQueue(state) {
  const all = interleaveAttacks(state.blueAttacks || [], state.redAttacks || [], state.turn);
  return all.map((atk, i) => {
    const att = state.units.find(u => u.id === atk.attackerId && u.hp > 0);
    const def = state.units.find(u => u.id === atk.targetId   && u.hp > 0);
    if (!att || !def) return null;
    // Neutros não combatem nem podem ser alvo.
    if (att.team === NEUTRAL_TEAM || def.team === NEUTRAL_TEAM) return null;
    const dist      = hexDist(att.col, att.row, def.col, def.row);
    const reqWpn    = atk.weaponType;
    const wpnType   = (reqWpn && getWeaponQuantity(att, reqWpn) > 0)
      ? reqWpn
      : selectBestWeapon(att, def, dist);
    if (!wpnType) return null;
    const profile   = COMBAT_CONFIG.weaponProfiles?.[wpnType];
    const qty       = getWeaponQuantity(att, wpnType);
    // Use client-requested amount if provided, capped at available quantity
    const requested = atk.amount ?? (SALVO_SIZE[wpnType] || 1);
    const amount    = profile?.expendable ? Math.min(qty, Math.max(1, requested)) : 1;
    return {
      id:              `ENG-${String(i + 1).padStart(2, '0')}`,
      attackerId:      atk.attackerId,
      targetId:        atk.targetId,
      weaponType:      wpnType,
      amount,
      battleRound:     1,
      maxBattleRounds: isSingleRoundWeapon(wpnType) ? 1 : 2,
      status:          'pending',
      results:         [],
      // Snapshot of the target's hex/identity at queue-build time, so the
      // defending stack can be reconstructed for the group counter-attack even
      // if the primary target is destroyed by the incoming volley first.
      targetCol:       def.col,
      targetRow:       def.row,
      targetTeam:      def.team,
      targetCategory:  def.category,
    };
  }).filter(Boolean);
}

// Units that form the defending stack on a hex: alive same-team units sharing
// the same cell. A surface unit stacked with allies defends — and counter-attacks
// — as a group; the attacker's chosen target only sets the primary recipient of
// the incoming damage. Lone units (or non-surface targets) keep 1-on-1 behavior.
function defendingGroup(state, col, row, team, category) {
  if (category !== 'surface') return null;
  const stack = state.units.filter(u =>
    (u.hp ?? 0) > 0 && u.team === team && u.col === col && u.row === row);
  return stack.length > 1 ? stack : null;
}

function resolveBattleRound(state, engagement, initiativeBonusTeam = null) {
  // Amarra os dados do combate ao RNG desta partida. Partida sem semente usa
  // Math.random (jogo interativo, comportamento de sempre); partida semeada
  // (simulação construtiva) fica reprodutível. Feito aqui, e não uma vez por
  // partida, para que salas interativas e lotes jamais compartilhem estado.
  combatRng.setRng(state.rng);

  const att = state.units.find(u => u.id === engagement.attackerId && u.hp > 0);
  const def = state.units.find(u => u.id === engagement.targetId   && u.hp > 0);
  const brTag = `${engagement.id}·BR${engagement.battleRound}`;

  if (!att || !def) {
    engagement.status = 'ended';
    state.log.unshift(`[${brTag}] Unidade destruída — engajamento encerrado.`);
    return null;
  }

  // Skip attack if attacker is fuel-disabled
  if (!canAttack(att)) {
    state.log.unshift(`⛽ ${att.name} não pode atacar: sem combustível.`);
    return { ok: false, reason: 'Atacante sem combustível' };
  }

  const initLabel = initiativeBonusTeam ? ` ★${initiativeBonusTeam.toUpperCase()}` : '';
  state.log.unshift(`──── ${brTag}${initLabel} ────`);

  // Group defense: a stacked surface task group pools its interceptors. Only
  // units that can still defend (naval FP > 0) contribute.
  const stack = defendingGroup(state, def.col, def.row, def.team, def.category);
  const interceptors = stack
    ? stack.filter(canDefend)
    : (isFuelDisabled(def) ? [] : [def]);
  if (stack && interceptors.length > 1 && !engagement.id.includes('CTR')) {
    state.log.unshift(`🛡 ${def.name} defende em grupo (${interceptors.length} unid. no mesmo hex).`);
  }

  const dist = hexDist(att.col, att.row, def.col, def.row);
  const eng  = resolveEngagement({
    attacker: att, defender: def,
    defenders:  interceptors,
    weaponType: engagement.weaponType,
    amount:     engagement.amount,
    distance:   dist,
    initiativeBonusTeam,
    defenderDisabled: isFuelDisabled(def),  // 0-FP naval unit has no interception
  });

  if (!eng.ok) {
    state.log.unshift(`⚠ ${att.name} → ${def.name}: ${eng.reason}`);
  } else {
    // Spend engagement FP for attacker
    spendEngagementFuel(att);

    if (eng.destroyed) {
      state.log.unshift(`💥 ${def.name} DESTRUÍDO por ${att.name} [${eng.weaponLabel}]`);
      // Cascade: kill embarked aircraft and hosted specops
      for (const u of state.units) {
        if ((u.hp ?? 0) <= 0) continue;
        if (u.baseUnitId === def.id || u.hostId === def.id) {
          u.hp = 0;
          state.log.unshift(`💥 ${u.name} perdido com ${def.name}`);
        }
      }
    } else if (eng.totalDamage > 0) {
      const intStr = eng.interception?.intercepted > 0 ? ` (${eng.interception.intercepted} intercept.)` : '';
      state.log.unshift(`✓ ${att.name} → ${def.name} −${eng.totalDamage}SP [${eng.weaponLabel}${intStr}]`);
      spendDamageFuel(def);    // defender burns extra FP absorbing the hit
      const degrad = applyDegradation(def, eng.totalDamage, state);
      if (degrad) { state.log.unshift(`  ↘ ${def.name}: ${degrad}`); eng.degradation = degrad; }
    } else {
      const intStr = eng.interception?.intercepted > 0 ? ` (${eng.interception.intercepted} intercept.)` : '';
      state.log.unshift(`✗ ${att.name} → ${def.name} falhou [${eng.weaponLabel}${intStr}]`);
    }
  }

  if (state.log.length > 80) state.log = state.log.slice(0, 80);
  engagement.results.push({ battleRound: engagement.battleRound, initiativeBonusTeam, result: eng });
  return eng;
}

function emitBrResult(room, engagement, result, mustDecide, extra = {}) {
  const payload = { engagement, result, mustDecide, ...extra };
  if (room.players.blue) io.to(room.players.blue).emit('battle_round_result', payload);
  if (room.players.red)  io.to(room.players.red ).emit('battle_round_result', payload);
  // Facilitador acompanha o combate como observador: vê o resultado, mas nunca
  // decide CONTINUAR/PARAR (a decisão é dos jogadores).
  if (room.players.facilitator) {
    io.to(room.players.facilitator).emit('battle_round_result', { ...payload, mustDecide: false, observer: true });
  }
}

function startCurrentEngagement(room) {
  const state      = room.state;
  const engagement = state.combatQueue[state.currentEngagementIndex];
  engagement.battleRound = 1;

  const result = resolveBattleRound(state, engagement);

  // Immediate resolution: single-round weapon, invalid result, OR target destroyed in BR#1.
  // If destroyed, server must NOT request decisions — client shows OK but never sends
  // battle_round_decision, causing a permanent stall.
  if (!result || !result.ok || engagement.maxBattleRounds === 1 || result.destroyed) {
    emitBrResult(room, engagement, result, false);
    finishCurrentEngagement(room);
    return;
  }

  // Multi-round weapon, target survived: ask both players
  state.battleRoundDecisions = { blue: null, red: null };
  emitBrResult(room, engagement, result, true);
}

function resolveCounterAttacks(state, engagement, blue, red) {
  // The defending stack fires back at the original attacker in BR#2.
  // Restricted to close-range weapons (no LACM / ASBM strategic strikes).
  const att = state.units.find(u => u.id === engagement.attackerId && u.hp > 0);
  if (!att) return [];

  // Reconstruct the defending group from the target's hex (the primary target
  // may already be destroyed by the incoming volley, but surviving stackmates —
  // even a single one — still counter-attack). For a non-surface target, only
  // the target itself counters, matching the classic 1-on-1 behavior.
  let group;
  if (engagement.targetCategory === 'surface') {
    group = state.units.filter(u =>
      (u.hp ?? 0) > 0 && u.team === engagement.targetTeam &&
      u.col === engagement.targetCol && u.row === engagement.targetRow);
  } else {
    const def = state.units.find(u => u.id === engagement.targetId && (u.hp ?? 0) > 0);
    group = def ? [def] : [];
  }

  // Initiative for the counter: if the defending team chose continue and the
  // attacker chose stop, the whole defending group counters with advantage.
  const defDecision = engagement.targetTeam === 'blue' ? blue : red;
  const attDecision = att.team === 'blue' ? blue : red;
  const counterInit = (defDecision === 'continue' && attDecision === 'stop')
    ? engagement.targetTeam : null;

  const results = [];
  let idx = 0;
  for (const unit of group) {
    if ((unit.hp ?? 0) <= 0 || !canAttack(unit) || unit.id === att.id) continue;

    const dist       = hexDist(unit.col, unit.row, att.col, att.row);
    const counterWpn = selectBestWeapon(unit, att, dist);
    if (!counterWpn || isSingleRoundWeapon(counterWpn)) continue;

    const profile    = COMBAT_CONFIG.weaponProfiles?.[counterWpn];
    const qty        = getWeaponQuantity(unit, counterWpn);
    const counterAmt = profile?.expendable ? Math.min(qty, SALVO_SIZE[counterWpn] || 1) : 1;

    const counterEng = {
      id: `${engagement.id}-CTR${++idx}`,
      attackerId:      unit.id,
      targetId:        att.id,
      weaponType:      counterWpn,
      amount:          counterAmt,
      battleRound:     2,
      maxBattleRounds: 2,
      status:          'pending',
      results:         [],
    };

    const r = resolveBattleRound(state, counterEng, counterInit);
    if (r) results.push(r);
    // Attacker destroyed by the counter-fire: remaining stackmates have nothing to hit.
    if (!state.units.find(u => u.id === att.id && (u.hp ?? 0) > 0)) break;
  }

  return results;
}

function processBattleRoundDecision(room) {
  const state      = room.state;
  const engagement = state.combatQueue[state.currentEngagementIndex];
  const { blue, red } = state.battleRoundDecisions;

  const bothStop   = blue === 'stop' && red === 'stop';
  const maxReached = engagement.battleRound >= engagement.maxBattleRounds;

  if (bothStop || maxReached) {
    emitBrResult(room, engagement, null, false, { decisions: { blue, red } });
    finishCurrentEngagement(room);
    return;
  }

  // BR#2: determine initiative advantage
  let initiativeBonusTeam = null;
  if (blue === 'continue' && red === 'stop')  initiativeBonusTeam = 'blue';
  if (red  === 'continue' && blue === 'stop') initiativeBonusTeam = 'red';

  engagement.battleRound = 2;
  const result         = resolveBattleRound(state, engagement, initiativeBonusTeam);
  const counterResults = resolveCounterAttacks(state, engagement, blue, red);

  emitBrResult(room, engagement, result, false,
    { decisions: { blue, red }, initiativeBonusTeam, counterResults });
  finishCurrentEngagement(room);
}

function finishCurrentEngagement(room) {
  const state = room.state;
  const eng = state.combatQueue[state.currentEngagementIndex];
  eng.status = 'ended';
  gameLogger.logEngagement(room.id, state.turn, state.period, eng);
  if (state.fac) {
    state.fac.combatReport.push({
      id: eng.id, attackerId: eng.attackerId, targetId: eng.targetId, weaponType: eng.weaponType,
      rounds: eng.results.map(r => ({
        battleRound: r.battleRound,
        ok:          !!r.result?.ok,
        damage:      r.result?.totalDamage || 0,
        destroyed:   !!r.result?.destroyed,
      })),
    });
  }
  state.currentEngagementIndex += 1;

  if (state.currentEngagementIndex < state.combatQueue.length) {
    startCurrentEngagement(room);
  } else {
    finishCombatPhase(room);
  }
}

function returnAircraftToBases(state) {
  for (const u of state.units) {
    if (u.category !== 'air' || (u.hp ?? 0) <= 0) continue;
    if (u.airStatus !== 'airborne') continue;
    if (u.baseUnitId) {
      const base = state.units.find(b => b.id === u.baseUnitId && (b.hp ?? 0) > 0);
      if (base) { u.col = base.col; u.row = base.row; }
    } else if (u.baseHex) {
      u.col = u.baseHex.col;
      u.row = u.baseHex.row;
    }
    u.fuel.wasAtRefuelLocation = true;
  }
}

function finishCombatPhase(room) {
  const state = room.state;
  returnAircraftToBases(state);
  state.log.unshift('── Fase de Combate encerrada. ──');

  state.combatQueue             = [];
  state.currentEngagementIndex  = 0;
  state.battleRoundDecisions    = { blue: null, red: null };

  // Com facilitador, os resultados só valem depois de ratificados por ele —
  // a vitória e a virada de turno esperam por fac_ratify_combat.
  if (room.facilitated) {
    state.phase = 'combat_approval';
    state.log.unshift('⚖ Aguardando ratificação do combate pelo facilitador.');
    broadcast(room);
    return;
  }

  concludeTurn(room);
}

function emitGameOver(room, payload) {
  const state = room.state;
  if (room.players.blue) io.to(room.players.blue).emit('game_over', { ...payload, state: stateFor(state, 'blue') });
  if (room.players.red)  io.to(room.players.red ).emit('game_over', { ...payload, state: stateFor(state, 'red')  });
  if (room.players.facilitator) {
    io.to(room.players.facilitator).emit('game_over', { ...payload, state: facView(room) });
  }
}

// Fecha o turno depois do combate: checa vitória, avança o período e aplica o
// limite operacional de MAX_TURNS. Com facilitador, só é chamado depois da
// ratificação.
function concludeTurn(room) {
  const state = room.state;
  const winner = checkWinner(state);
  if (winner) {
    state.winner = winner;
    state.log.unshift(`🏆 ${winner === 'blue' ? 'Força Azul' : 'Força Vermelha'} VENCEU!`);
    const obj = computeObjectives(state);
    gameLogger.logGameOver(room.id, state.turn, winner, 'victory', obj, state);
    emitGameOver(room, { winner, objectives: obj, reason: 'victory' });
    return;
  }

  nextTurn(state);
  if (state.fac) state.fac.pendingMoves = [];

  // ── Limite operacional: ao fim do dia MAX_TURNS, adjudica-se o resultado ────
  // O critério acompanha a regra de vitória do cenário: por objetivos, vence o
  // maior progresso nas condições; por exaustão, vence quem conservou maior
  // fração do próprio potencial ofensivo — isto é, quem chegou mais perto de
  // exaurir o outro. Empate → Azul, nos dois casos.
  if (state.turn > MAX_TURNS) {
    const obj = computeObjectives(state);
    const porExaustao = resolveVictoryRule(state.victoryRule) === 'exhaustion';
    const blueProg = porExaustao ? offensiveStockRatio(state, 'blue') : objectiveProgress(obj.blue);
    const redProg  = porExaustao ? offensiveStockRatio(state, 'red')  : objectiveProgress(obj.red);
    const winner = redProg > blueProg ? 'red' : 'blue';   // empate → Azul
    state.winner = winner;
    const criterio = porExaustao ? 'potencial ofensivo remanescente' : 'progresso nos objetivos';
    state.log.unshift(`⏱ Limite operacional de ${MAX_TURNS} dias atingido — adjudicação por ${criterio} (Azul ${(blueProg * 100).toFixed(0)}% · Vermelho ${(redProg * 100).toFixed(0)}%).`);
    state.log.unshift(`🏆 ${winner === 'blue' ? 'Força Azul' : 'Força Vermelha'} VENCEU!`);
    gameLogger.logGameOver(room.id, state.turn, winner, 'timeout', obj, state);
    emitGameOver(room, { winner, objectives: obj, reason: 'timeout' });
    return;
  }

  broadcast(room);
}

// Alvos e limiares das condições de vitória da OB padrão: shared/objectives.js.
// Uma OB carregada de planilha traz os seus em `state.cenario` (ver newGame);
// estas constantes são o fallback, e com elas tudo funciona como antes.
const { OBJECTIVE_IDS, OBJECTIVE_THRESHOLDS } = require('./shared/objectives');
const objectiveIdsOf        = state => state?.cenario?.objectiveIds || OBJECTIVE_IDS;
const objectiveThresholdsOf = state => state?.cenario?.thresholds   || OBJECTIVE_THRESHOLDS;

// `progress` é a fração real de conclusão (0..1) de cada condição, inclusive
// crédito parcial nas condições binárias (dano relativo no alvo). É o que a
// adjudicação por limite de turnos usa, para recompensar dano entregue em vez
// de contagem de condições baratas.
const frac = (cur, need) => (need > 0 ? Math.min(1, Math.max(0, cur / need)) : 0);

// A composição de força pode duplicar um meio (ver capability_factors): um
// objetivo escrito sobre 'RED-GBPA' precisa valer para 'RED-GBPA~2' também,
// senão afundar a original já cumpriria a condição com uma segunda intacta no
// mar. Daí casar por ID base e agregar o SP do conjunto. Sem cópias, cada
// conjunto tem um elemento e as contas dão exatamente o que davam antes.
//
// Aceita um id ou uma lista: na OB padrão o porta-aviões é um só ('RED-GBPA'),
// mas numa OB carregada de planilha o usuário pode marcar dois navios como
// `carrier` — e então a condição é afundar os dois, a mesma regra das cópias.
const matchUnits = (units, ids) => {
  const alvo = new Set([].concat(ids));
  return units.filter(x => alvo.has(baseUnitId(x.id)));
};
const groupSp    = grupo => ({
  hp:    grupo.reduce((s, x) => s + Math.max(0, x.hp || 0), 0),
  maxHp: grupo.reduce((s, x) => s + (x.maxHp || 0), 0),
});
// Conjunto neutralizado = nenhum sobrevivente. Ausente da OB conta como cumprido.
const groupDown     = grupo => grupo.length === 0 || grupo.every(x => (x.hp ?? 0) <= 0);
const groupProgress = grupo => {
  if (!grupo.length) return 1;
  const { hp, maxHp } = groupSp(grupo);
  return frac(maxHp - hp, maxHp);
};

function computeObjectives(state) {
  const u = state.units;
  const OI = objectiveIdsOf(state);
  const BT = OI.blueTargets, RT = OI.redTargets;
  const TH = objectiveThresholdsOf(state);

  // ─── Blue objectives (need ≥ 3 of 5) ────────────────────────────────────────
  const carrier    = matchUnits(u, BT.carrier);
  const carrierMet = groupDown(carrier);
  const carrierSp  = groupSp(carrier);

  // Cada ID logístico conta como UM alvo, neutralizado quando todas as suas
  // cópias caem — o limiar do estudo é "2 de 3 navios", não "2 de N cascos".
  const logGroups = BT.logistics.map(id => matchUnits(u, id)).filter(g => g.length);
  const logDead   = logGroups.filter(groupDown).length;
  const logMet    = logDead >= TH.blueLogisticsKills;

  const amphib    = matchUnits(u, BT.amphib);
  const amphibMet = groupDown(amphib);
  const amphibSp  = groupSp(amphib);

  const nucsub    = matchUnits(u, BT.nucsub);
  const nucsubMet = groupDown(nucsub);
  const nucsubSp  = groupSp(nucsub);

  const surfUnits = BT.surface.flatMap(id => matchUnits(u, id));
  const surfMax   = surfUnits.reduce((s, x) => s + x.maxHp, 0);
  const surfCur   = surfUnits.reduce((s, x) => s + Math.max(0, x.hp), 0);
  const surfDegPct = surfMax > 0 ? Math.round((1 - surfCur / surfMax) * 100) : 0;
  const surfMet   = surfDegPct >= TH.blueSurfaceDegPct;

  const blueConds = [
    { id: 'carrier',   label: 'Destruir Porta-Aviões',          met: carrierMet,
      progress: groupProgress(carrier),
      current: carrier.length ? `SP: ${carrierSp.hp}/${carrierSp.maxHp}` : 'Destruído ✓' },
    { id: 'logistics', label: `Neutralizar ${TH.blueLogisticsKills} de ${logGroups.length} Logísticos`, met: logMet,
      progress: frac(logDead, TH.blueLogisticsKills),
      current: `${logDead}/${logGroups.length} neutralizados (precisa ${TH.blueLogisticsKills})` },
    { id: 'amphib',    label: 'Neutralizar GT Anfíbio',          met: amphibMet,
      progress: groupProgress(amphib),
      current: amphib.length ? `SP: ${amphibSp.hp}/${amphibSp.maxHp}` : 'Neutralizado ✓' },
    { id: 'nucsub',    label: 'Destruir Submarino Nuclear',      met: nucsubMet,
      progress: groupProgress(nucsub),
      current: nucsub.length ? `SP: ${nucsubSp.hp}/${nucsubSp.maxHp}` : 'Destruído ✓' },
    { id: 'surface',   label: `Degradar ≥${TH.blueSurfaceDegPct}% Nav. Combatentes`, met: surfMet,
      progress: frac(surfDegPct, TH.blueSurfaceDegPct),
      current: `${surfDegPct}% degradado` },
  ];
  const blueAchieved = blueConds.filter(c => c.met).length;

  // ─── Red objectives (need both) ──────────────────────────────────────────────
  const fpsoGroups = RT.fpsos.map(id => matchUnits(u, id)).filter(g => g.length);
  const fpsoNeut   = fpsoGroups.filter(groupDown).length;
  const fpsoMet    = fpsoNeut >= TH.redFpsoKills;
  const fpsoUnits  = { length: fpsoGroups.length };

  const portUnits = RT.ports.flatMap(id => matchUnits(u, id));
  const portMax   = portUnits.reduce((s, x) => s + x.maxHp, 0);
  const portCur   = portUnits.reduce((s, x) => s + Math.max(0, x.hp), 0);
  const portDegPct = portMax > 0 ? Math.round((1 - portCur / portMax) * 100) : 0;
  const portsMet  = portDegPct >= TH.redPortDegPct;

  const redConds = [
    { id: 'fpsos', label: `Neutralizar ${TH.redFpsoKills} de ${fpsoUnits.length} FPSOs`, met: fpsoMet,
      progress: frac(fpsoNeut, TH.redFpsoKills),
      current: `${fpsoNeut}/${fpsoUnits.length} neutralizadas (precisa ${TH.redFpsoKills})` },
    { id: 'ports', label: `Degradar ≥${TH.redPortDegPct}% Portos`,   met: portsMet,
      progress: frac(portDegPct, TH.redPortDegPct),
      current: `${portDegPct}% degradado  (SP: ${portCur}/${portMax})` },
  ];
  const redAchieved = redConds.filter(c => c.met).length;

  return {
    blue: { conditions: blueConds, needed: 3, achieved: blueAchieved, won: blueAchieved >= 3 },
    red:  { conditions: redConds,  needed: 2, achieved: redAchieved,  won: redAchieved  >= 2 },
  };
}

// Progresso de um lado para a adjudicação por tempo: média das `needed` maiores
// frações de conclusão. Assim os dois lados recebem crédito parcial e condições
// extras irrelevantes não inflam o placar de quem tem mais condições.
function objectiveProgress(side) {
  const fr = side.conditions.map(c => c.progress ?? (c.met ? 1 : 0))
                            .sort((a, b) => b - a)
                            .slice(0, side.needed);
  return fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : 0;
}

// ─── Regras de vitória ────────────────────────────────────────────────────────
// Duas definições de "decisivo", escolhidas por cenário:
//
//   objectives  (padrão) — vence quem cumpre suas condições assimétricas
//                 (Azul 3 de 5; Vermelho 2 de 2). É a regra do wargame desde
//                 sempre; partidas se decidem em poucos turnos.
//   exhaustion  — vence quem deixa o adversário sem NENHUM meio ofensivo
//                 sobrevivente (arma com estoque ou capacidade ofensiva; ver
//                 metrics.hasOffensiveMeans). "Decisivo" passa a significar
//                 redução geral da capacidade de combate do oponente, e não o
//                 cumprimento de objetivos de cenário — é a definição usada no
//                 estudo de capacidades, onde a métrica E1_kcv depende dela.
//
// Empate (os dois lados satisfeitos no mesmo instante) resolve para Azul nas
// duas regras, mantendo a convenção já adotada aqui na adjudicação por tempo.
// Nota: a implementação de origem resolvia o empate de exaustão para Vermelho,
// por ordem de teste; aqui preferiu-se a consistência interna da plataforma.
const VICTORY_RULES = ['objectives', 'exhaustion'];
const VICTORY_RULE_DEFAULT = 'objectives';

function resolveVictoryRule(value) {
  return VICTORY_RULES.includes(value) ? value : VICTORY_RULE_DEFAULT;
}

function checkWinnerByObjectives(state) {
  const obj = computeObjectives(state);
  if (obj.blue.won && obj.red.won) return 'blue'; // tiebreak
  if (obj.blue.won) return 'blue';
  if (obj.red.won)  return 'red';
  return null;
}

function checkWinnerByExhaustion(state) {
  const combativo = team => state.units.some(u =>
    u.team === team && u.hp > 0 && hasOffensiveMeans(u));
  const b = combativo('blue'), r = combativo('red');
  if (!b && !r) return 'blue';   // exaustão mútua → empate para Azul
  if (!r) return 'blue';
  if (!b) return 'red';
  return null;
}

function checkWinner(state) {
  return resolveVictoryRule(state?.victoryRule) === 'exhaustion'
    ? checkWinnerByExhaustion(state)
    : checkWinnerByObjectives(state);
}

function nextTurn(state) {
  // ── Reload check (before moved flags are cleared) ────────────────────────────
  const portHexes = new Set(
    state.units.filter(u => u.team === 'blue' && u.hp > 0 && u.type === 'porto')
               .map(u => `${u.col},${u.row}`)
  );
  for (const u of state.units) {
    if (u.hp <= 0) continue;
    if (!u.initWeapons || Object.keys(u.initWeapons).length === 0) continue;

    const hexKey = `${u.col},${u.row}`;
    let reload = false;

    if (u.team === 'blue') {
      if (u.category === 'land') {
        reload = true;
      } else if (u.category === 'air') {
        reload = u.fuel?.wasAtRefuelLocation === true;
      } else if (!u.moved) {
        if (u.category === 'surface' || u.category === 'submarine') {
          reload = portHexes.has(hexKey);
        }
      }
    } else if (u.team === 'red') {
      if (u.category === 'air') {
        reload = u.fuel?.wasAtRefuelLocation === true;
      }
    }

    if (reload) {
      const restored = [];
      for (const [wpn, init] of Object.entries(u.initWeapons)) {
        const cur = u.weapons[wpn]?.quantity ?? 0;
        if (cur < init.quantity) {
          u.weapons[wpn] = { ...init };
          restored.push(wpn.toUpperCase());
        }
      }
      if (restored.length > 0) {
        state.log.unshift(`🔄 ${u.name} recompletou: ${restored.join(', ')}`);
      }
    }
  }

  // ── Fuel: naval refuel for units stacked with a provider at end of turn ──────
  const fuelReports = recoverNavalFuel(state);
  for (const { unit: u } of fuelReports) {
    state.log.unshift(`⛽ ${u.name}(${u.team}) reabasteceu: ${u.fuel.current}/${u.fuel.max} FP.`);
  }

  // ── Fuel: aircraft that landed last turn become ready ─────────────────────
  recoverAircraft(state);

  // ── Advance turn ────────────────────────────────────────────────────────────
  state.units.forEach(u => { u.moved = false; });
  resetFuelTurnCounters(state);

  state.period    = state.period === 'day' ? 'night' : 'day';
  if (state.period === 'day') state.turn++;
  state.phase     = 'movement';
  state.blueDone  = state.redDone = false;
  state.blueAttacks = state.redAttacks = null;
  const per = state.period === 'day' ? 'Diurno' : 'Noturno';
  state.log.unshift(`──── Turno ${state.turn} · Período ${per} ────`);
  state.log.unshift('Fase de Movimentação iniciada.');
  if (state.log.length > 50) state.log = state.log.slice(0, 50);
  saveMovementSnapshot(state);
}

// ─── Damage degradation ───────────────────────────────────────────────────────
function applyDegradation(unit, damageDealt, state = null) {
  const ratio = damageDealt / (unit.maxHp || 1);

  // Build pool of categories that can still lose at least 1 point
  const pool = [];

  if (unit.initDetectionRange && Object.values(unit.detectionRange || {}).some(v => v > 1))
    pool.push('detection');
  if ((unit.movement ?? 0) > 1)
    pool.push('movement');
  if (Object.values(unit.capabilities || {}).some(v => v > 1))
    pool.push('combat_capability');
  if (unit.fuel?.fuelType === 'naval' && (unit.fuel.max ?? 0) > 1)
    pool.push('fuel');

  if (pool.length === 0) return null;

  // Usa o RNG da partida quando ela é semeada (simulação construtiva), para
  // que a degradação por dano também seja reprodutível.
  const rnd = typeof state?.rng === 'function' ? state.rng : Math.random;
  const category = pool[Math.floor(rnd() * pool.length)];

  if (category === 'detection') {
    const initMax   = Math.max(1, ...Object.values(unit.initDetectionRange));
    const reduction = Math.max(1, Math.floor(ratio * initMax));
    for (const key of Object.keys(unit.detectionRange)) {
      if ((unit.detectionRange[key] ?? 0) > 0)
        unit.detectionRange[key] = Math.max(1, unit.detectionRange[key] - reduction);
    }
    return `Detecção −${reduction}`;
  }

  if (category === 'movement') {
    const reduction = Math.max(1, Math.floor(ratio * (unit.initMovement || 1)));
    unit.movement = Math.max(1, unit.movement - reduction);
    return `Movimentação −${reduction}`;
  }

  if (category === 'combat_capability') {
    const caps = unit.capabilities || {};
    const sorted = Object.entries(caps).filter(([, v]) => v > 1).sort(([, a], [, b]) => b - a);
    if (sorted.length === 0) return null;
    const [capKey, capVal] = sorted[0];
    const initVal   = unit.initCapabilities?.[capKey] ?? capVal;
    const reduction = Math.max(1, Math.floor(ratio * initVal));
    caps[capKey] = Math.max(1, capVal - reduction);
    return `${capKey} −${reduction}`;
  }

  if (category === 'fuel') {
    const reduction = Math.max(1, Math.floor(ratio * (unit.initFuelMax || 1) * 0.5));
    unit.fuel.max     = Math.max(1, unit.fuel.max - reduction);
    if (unit.fuel.current > unit.fuel.max) unit.fuel.current = unit.fuel.max;
    return `Combustível −${reduction}FP`;
  }

  return null;
}

// ─── Bot player (solo mode) ───────────────────────────────────────────────────
// O bot é deliberadamente onisciente (lê state.units sem filtro de detecção):
// compensa a ausência de planejamento humano com informação perfeita.

const BOT_TUNING = {
  aggressiveness:      1.0,             // 0..1 — menor = mais distraível p/ defesa
  opportunityRadius:   2,               // combatente inimigo a este raio vira alvo imediato
  refuelFloor:         FUEL_TURN_LIMIT, // FP mínimo antes de buscar reabastecimento
  logisticsFleeRadius: 4,               // logística foge de combatentes a este raio
  stopHpFrac:          0.4,             // rodada: recua abaixo desta fração de SP
  finishHpThreshold:   2,               // ...exceto se o alvo está a isto de cair
};

// Procedência registrada nos logs para as decisões do bot. Enquanto a política
// for a heurística abaixo, é 'heuristic'; uma política aprendida passa a gravar
// 'onnx'. Constante única para que os dois pontos de gravação (movimento e
// ataque) nunca divirjam.
const BOT_AGENT = 'heuristic';

// ─── Doutrina de operação do bot ───────────────────────────────────────────────
// Duas variáveis independentes de emprego da força, configuráveis por partida
// solo (ver create_solo_room): formação (como as unidades de superfície se
// posicionam entre si) e postura (o quanto buscam ou evitam o contato). Uma
// partida sem doutrina explícita usa DOCTRINE_DEFAULT — mesmo comportamento
// de sempre (dividida/ofensiva), então scripts e testes existentes que chamam
// computeBotMoves/computeBotAttacks/botBattleRoundDecision sem esse argumento
// continuam funcionando sem mudança.
const DOCTRINE_DEFAULT = { formation: 'divided', posture: 'offensive' };

// Postura ajusta BOT_TUNING: ofensiva busca contato e gasta munição/combustível
// livremente (valores atuais, inalterados); defensiva evita se expor sem poder
// revidar, recua mais cedo em combate e reabastece com mais margem.
const POSTURE_TUNING = {
  offensive: {
    stopHpFrac: 0.4, finishHpThreshold: 2,
    opportunityRadius: 2, refuelFloorMult: 1.0,
    holdOutsideRange: false,
  },
  defensive: {
    stopHpFrac: 0.65, finishHpThreshold: 3,
    opportunityRadius: 1, refuelFloorMult: 1.6,
    holdOutsideRange: true,
  },
};

// Resolve a escolha de um eixo de doutrina feita no lobby: um valor válido
// é usado como está, 'random' sorteia entre as opções válidas (o sorteio
// acontece uma vez, na criação da sala — o valor sorteado fica fixo em
// room.botDoctrine pelo resto da partida), e qualquer outra coisa cai no
// padrão.
function resolveDoctrineChoice(value, options, fallback) {
  if (options.includes(value)) return value;
  if (value === 'random') return options[Math.floor(Math.random() * options.length)];
  return fallback;
}

function resolveBotTuning(doctrine) {
  const posture = POSTURE_TUNING[doctrine?.posture] || POSTURE_TUNING[DOCTRINE_DEFAULT.posture];
  return {
    ...BOT_TUNING,
    stopHpFrac:        posture.stopHpFrac,
    finishHpThreshold: posture.finishHpThreshold,
    opportunityRadius: posture.opportunityRadius,
    refuelFloor:       Math.round(BOT_TUNING.refuelFloor * posture.refuelFloorMult),
    holdOutsideRange:  posture.holdOutsideRange,
  };
}

const BOT_COMBATANT_TYPES =
  ['carrier','amphib','fragata','destroier','corveta','cruzador','sub_nuclear','submarino','caca','ataque'];
function botIsCombatant(u) { return BOT_COMBATANT_TYPES.includes(u.type); }

function botGenericPrio(u) {
  if (u.type === 'carrier')  return 0;
  if (u.type === 'amphib')   return 1;
  if (['fragata','destroier','corveta','cruzador'].includes(u.type)) return 2;
  if (['sub_nuclear','submarino'].includes(u.type)) return 3;
  if (['caca','ataque','patrulha','patrulha_oc','patrulha_c'].includes(u.type)) return 4;
  return 5;
}

// Pesos de alvo derivados das condições de vitória (menor = mais prioritário).
// Condições já cumpridas são puladas — o bot se re-tarefa ao completar objetivos.
function botObjectiveWeights(state, botTeam) {
  const w   = new Map();
  const obj = computeObjectives(state);
  // Alvo único ou lista (OB carregada pode marcar dois porta-aviões).
  const todos = ids => [].concat(ids);
  if (botTeam === 'blue') {
    const met = Object.fromEntries(obj.blue.conditions.map(c => [c.id, c.met]));
    const T   = objectiveIdsOf(state).blueTargets;
    if (!met.carrier)   todos(T.carrier).forEach(id => w.set(id, 0));
    if (!met.logistics) T.logistics.forEach(id => w.set(id, 0));
    if (!met.amphib)    todos(T.amphib).forEach(id => w.set(id, 0));
    if (!met.nucsub)    todos(T.nucsub).forEach(id => w.set(id, 0));
    if (!met.surface)   T.surface.forEach(id => { if (!w.has(id)) w.set(id, 1); });
  } else {
    const met = Object.fromEntries(obj.red.conditions.map(c => [c.id, c.met]));
    const T   = objectiveIdsOf(state).redTargets;
    if (!met.fpsos) T.fpsos.forEach(id => w.set(id, 0));
    if (!met.ports) T.ports.forEach(id => w.set(id, 0));
  }
  return w;
}

function botPickTarget(unit, enemies, objWeights = new Map(), tuning = BOT_TUNING) {
  const attackable = enemies.filter(e => rangeAgainst(unit.attackRange, e.category) > 0);
  if (!attackable.length) return null;
  const d = e => hexDist(unit.col, unit.row, e.col, e.row);

  // Defesa oportunista: combatente inimigo já colado vence qualquer objetivo
  // (postura defensiva reduz esse raio — evita se distrair perseguindo contato).
  const oppRadius = Math.round(tuning.opportunityRadius * (2 - tuning.aggressiveness));
  const near = attackable.filter(e => botIsCombatant(e) && d(e) <= oppRadius);
  if (near.length) {
    return near.sort((a, b) => botGenericPrio(a) - botGenericPrio(b) || d(a) - d(b))[0];
  }
  return attackable.sort((a, b) =>
    (objWeights.get(a.id) ?? 9) - (objWeights.get(b.id) ?? 9) ||
    botGenericPrio(a) - botGenericPrio(b) ||
    d(a) - d(b)
  )[0];
}

// Provedor de reabastecimento aliado mais próximo cujo hex a unidade pode ocupar
// (PORTO-S fica em terra — inacessível a navios; portos rasos, a submarinos).
function botRefuelProvider(unit, state) {
  let best = null, bestD = Infinity;
  for (const o of state.units) {
    if (o.id === unit.id || o.team !== unit.team || (o.hp ?? 0) <= 0) continue;
    if (!isNavalRefuelProvider(o)) continue;
    if (!canEnterTerrain(unit.category, getTerrain(o.col, o.row))) continue;
    const d = hexDist(unit.col, unit.row, o.col, o.row);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

// FP baixo o suficiente para priorizar reabastecimento sobre a missão.
// Custo estimado da viagem: ~3 FP por turno de deslocamento + 1 de folga.
function botNeedsRefuel(unit, provider, tuning = BOT_TUNING) {
  if (unit.fuel?.fuelType !== 'naval' || !provider) return false;
  if (isNavalRefuelProvider(unit)) return false;
  const dist = hexDist(unit.col, unit.row, provider.col, provider.row);
  const tripCost = Math.ceil(dist / Math.max(1, unit.movement)) * 3 + 1;
  return unit.fuel.current <= Math.max(tuning.refuelFloor, tripCost);
}

function botMoveToward(unit, target, state) {
  let bestPath = null;
  let bestDist = hexDist(unit.col, unit.row, target.col, target.row);
  const queue   = [{ pos: { col: unit.col, row: unit.row }, path: [{ col: unit.col, row: unit.row }], steps: 0 }];
  const visited = new Set([`${unit.col},${unit.row}`]);
  while (queue.length) {
    const { pos, path, steps } = queue.shift();
    if (steps > 0) {
      const d = hexDist(pos.col, pos.row, target.col, target.row);
      if (d < bestDist) { bestDist = d; bestPath = path; }
    }
    if (steps >= airMovementRange(unit)) continue;
    for (const nb of hexNeighbors(pos.col, pos.row)) {
      const key = `${nb.col},${nb.row}`;
      if (visited.has(key)) continue;
      if (!canEnterTerrain(unit.category, getTerrain(nb.col, nb.row))) continue;
      visited.add(key);
      queue.push({ pos: nb, path: [...path, nb], steps: steps + 1 });
    }
  }
  return bestPath;
}

// Como botMoveToward, mas maximiza a distância mínima às ameaças (fuga).
// BFS raso-primeiro garante o desempate natural por menos passos (menos FP).
function botMoveAway(unit, threats, state) {
  if (!threats.length) return null;
  const minD = (c, r) => Math.min(...threats.map(t => hexDist(c, r, t.col, t.row)));
  let bestPath  = null;
  let bestScore = minD(unit.col, unit.row);
  const queue   = [{ pos: { col: unit.col, row: unit.row }, path: [{ col: unit.col, row: unit.row }], steps: 0 }];
  const visited = new Set([`${unit.col},${unit.row}`]);
  while (queue.length) {
    const { pos, path, steps } = queue.shift();
    if (steps > 0) {
      const s = minD(pos.col, pos.row);
      if (s > bestScore) { bestScore = s; bestPath = path; }
    }
    if (steps >= airMovementRange(unit)) continue;
    for (const nb of hexNeighbors(pos.col, pos.row)) {
      const key = `${nb.col},${nb.row}`;
      if (visited.has(key)) continue;
      if (!canEnterTerrain(unit.category, getTerrain(nb.col, nb.row))) continue;
      visited.add(key);
      queue.push({ pos: nb, path: [...path, nb], steps: steps + 1 });
    }
  }
  return bestPath;
}

function computeBotMoves(state, botTeam, doctrine = DOCTRINE_DEFAULT) {
  const tuning   = resolveBotTuning(doctrine);
  const moves    = [];
  const handled  = new Set();
  // Neutros não são alvo (buildCombatQueue os rejeita): fora da lista, o bot
  // não gera ordens que o resolvedor descartaria em silêncio.
  const enemies  = state.units.filter(u => u.team !== botTeam && u.team !== NEUTRAL_TEAM && u.hp > 0);
  const own      = state.units.filter(u => u.team === botTeam && u.hp > 0 && !u.moved);
  const objW     = botObjectiveWeights(state, botTeam);
  const enemyCombatants = enemies.filter(botIsCombatant);
  const mobile   = u => u.movement > 0 && u.category !== 'land' && !isFuelDisabled(u);
  const nearest  = (u, list) => list.reduce((best, e) =>
    !best || hexDist(u.col, u.row, e.col, e.row) < hexDist(u.col, u.row, best.col, best.row) ? e : best, null);

  // Formação concentrada: as unidades de superfície se mantêm coladas na mais
  // forte ainda de pé (o "porta-estandarte") e, uma vez próximas, avançam
  // juntas sobre o MESMO alvo — o melhor alvo do ponto de vista da âncora.
  // `anchorDest` é a posição que ela terá ao final deste turno (calculada já
  // aqui, não perseguida turno a turno), pra as seguidoras convergirem numa
  // única passada em vez de sempre ficarem um turno atrás de uma âncora que
  // também está se movendo. Formação dividida (padrão) não usa nada disto —
  // cada unidade escolhe seu próprio alvo, como sempre.
  let anchor = null, anchorDest = null, sharedTarget = null;
  if (doctrine?.formation === 'concentrated') {
    const surfaceCombatants = own.filter(u => botIsCombatant(u) && u.category === 'surface');
    anchor = surfaceCombatants.reduce((best, u) => (!best || u.maxHp > best.maxHp) ? u : best, null);
    if (anchor) {
      anchorDest = { col: anchor.col, row: anchor.row };
      sharedTarget = botPickTarget(anchor, enemies, objW, tuning);
      if (sharedTarget) {
        const distA = hexDist(anchor.col, anchor.row, sharedTarget.col, sharedTarget.row);
        const atkRA = rangeAgainst(anchor.attackRange, sharedTarget.category);
        if (distA > atkRA) {
          const p = botMoveToward(anchor, sharedTarget, state);
          if (p && p.length >= 2) anchorDest = p[p.length - 1];
        }
      }
    }
  }

  // Postura defensiva: não avança para um hex ao alcance de tiro de um
  // inimigo se não puder atacar de volta a partir dele — evita se expor sem
  // poder revidar, aguardando uma posição melhor.
  const exposedWithoutReturn = (unit, dest) => {
    if (!tuning.holdOutsideRange) return false;
    const exposed = enemies.some(e => {
      const r = rangeAgainst(e.attackRange, unit.category);
      return r > 0 && hexDist(dest.col, dest.row, e.col, e.row) <= r;
    });
    if (!exposed) return false;
    return !enemies.some(e => {
      const r = rangeAgainst(unit.attackRange, e.category);
      return r > 0 && hexDist(dest.col, dest.row, e.col, e.row) <= r;
    });
  };

  // 1. Logística própria foge de combatentes inimigos próximos
  const plannedDest = new Map();
  const providers = own.filter(u => isNavalRefuelProvider(u) && u.category === 'surface');
  for (const logi of providers) {
    if (!mobile(logi)) continue;
    const threat = nearest(logi, enemyCombatants);
    if (!threat || hexDist(logi.col, logi.row, threat.col, threat.row) > tuning.logisticsFleeRadius) continue;
    const path = botMoveAway(logi, enemyCombatants, state);
    if (path && path.length >= 2) {
      moves.push({ unitId: logi.id, path });
      plannedDest.set(logi.id, path[path.length - 1]);
    }
    handled.add(logi.id);
  }

  // 2. Escolta: 1 combatente de superfície cola no logístico mais valioso
  const prime = providers
    .filter(mobile)
    .sort((a, b) => (a.type === 'tanque' ? 0 : 1) - (b.type === 'tanque' ? 0 : 1))[0];
  if (prime) {
    const goal = plannedDest.get(prime.id) ?? { col: prime.col, row: prime.row };
    const escort = own
      .filter(u => botIsCombatant(u) && u.category === 'surface' && mobile(u) &&
                   !handled.has(u.id) && !botNeedsRefuel(u, botRefuelProvider(u, state), tuning))
      .sort((a, b) => hexDist(a.col, a.row, goal.col, goal.row) - hexDist(b.col, b.row, goal.col, goal.row))[0];
    if (escort) {
      if (hexDist(escort.col, escort.row, goal.col, goal.row) > 1) {
        const path = botMoveToward(escort, goal, state);
        if (path && path.length >= 2) moves.push({ unitId: escort.id, path });
      }
      handled.add(escort.id);
    }
  }

  // 3. Demais unidades: reabastecer, decolar com critério, ou avançar ao alvo
  for (const unit of own) {
    if (handled.has(unit.id) || !mobile(unit)) continue;

    const provider = botRefuelProvider(unit, state);
    if (botNeedsRefuel(unit, provider, tuning)) {
      if (unit.col === provider.col && unit.row === provider.row) continue; // já empilhado
      const path = botMoveToward(unit, provider, state);
      if (path && path.length >= 2) moves.push({ unitId: unit.id, path });
      continue;
    }

    // Postura defensiva: já exposta ao alcance de um inimigo sem poder revidar
    // dali — recua pra fora do alcance dele em vez de avançar, "aguardando
    // momento mais oportuno" em vez de trocar tiro em desvantagem.
    if (tuning.holdOutsideRange) {
      const threatsNow = enemies.filter(e => {
        const r = rangeAgainst(e.attackRange, unit.category);
        return r > 0 && hexDist(unit.col, unit.row, e.col, e.row) <= r;
      });
      const canHitBackNow = threatsNow.some(e =>
        rangeAgainst(unit.attackRange, e.category) > 0 &&
        hexDist(unit.col, unit.row, e.col, e.row) <= rangeAgainst(unit.attackRange, e.category));
      if (threatsNow.length && !canHitBackNow) {
        const path = botMoveAway(unit, threatsNow, state);
        if (path && path.length >= 2) { moves.push({ unitId: unit.id, path }); continue; }
      }
    }

    // Formação concentrada: unidade de superfície que não é a âncora.
    const isFormationMember = !!anchor && unit.id !== anchor.id &&
      botIsCombatant(unit) && unit.category === 'surface';

    // Ainda longe do porta-estandarte: prioriza se reunir a ele antes de
    // perseguir o alvo — reunir-se nunca conta como exposição arriscada,
    // avançar junto da força é sempre a opção mais segura disponível.
    if (isFormationMember && hexDist(unit.col, unit.row, anchorDest.col, anchorDest.row) > 1) {
      const path = botMoveToward(unit, anchorDest, state);
      if (path && path.length >= 2) moves.push({ unitId: unit.id, path });
      continue;
    }

    // Âncora, membro de formação já próximo, ou formação dividida (cada
    // unidade escolhe seu próprio alvo, como sempre).
    const target = (isFormationMember || unit.id === anchor?.id)
      ? sharedTarget
      : botPickTarget(unit, enemies, objW, tuning);
    if (!target) continue;
    const dist = hexDist(unit.col, unit.row, target.col, target.row);
    const atkR = rangeAgainst(unit.attackRange, target.category);
    if (dist <= atkR) continue;

    // Aeronave pronta só decola se alcançar posição de ataque neste turno
    if (unit.category === 'air' && unit.airStatus === 'ready' &&
        dist - atkR > airMovementRange(unit)) continue;

    const path = botMoveToward(unit, target, state);
    if (!path || path.length < 2) continue;
    if (exposedWithoutReturn(unit, path[path.length - 1])) continue; // segura a posição

    moves.push({ unitId: unit.id, path });
  }
  return moves;
}

function computeBotAttacks(state, botTeam) {
  const attacks = [];
  const objW    = botObjectiveWeights(state, botTeam);
  const enemies = state.units.filter(u => u.team !== botTeam && u.team !== NEUTRAL_TEAM && u.hp > 0);
  for (const unit of state.units.filter(u => u.team === botTeam && u.hp > 0)) {
    if (!canAttack(unit)) continue;
    const d = e => hexDist(unit.col, unit.row, e.col, e.row);
    const inRange = enemies
      .filter(e => {
        const r = rangeAgainst(unit.attackRange, e.category);
        return r > 0 && d(e) <= r;
      })
      .sort((a, b) =>
        (objW.get(a.id) ?? 9) - (objW.get(b.id) ?? 9) ||
        botGenericPrio(a) - botGenericPrio(b) ||
        d(a) - d(b));
    if (inRange.length) attacks.push({ attackerId: unit.id, targetId: inRange[0].id });
  }
  return attacks;
}

// Decisão CONTINUAR/PARAR do bot após a 1ª rodada de um engajamento.
function botBattleRoundDecision(state, engagement, botTeam, doctrine) {
  const tuning = resolveBotTuning(doctrine);
  const att = state.units.find(u => u.id === engagement.attackerId);
  const def = state.units.find(u => u.id === engagement.targetId);
  const attAlive = att && att.hp > 0;
  const defAlive = def && def.hp > 0;

  if (att && att.team === botTeam) {
    // Atacante: recua sem munição, ou ferido demais com o alvo longe de cair
    // (postura defensiva recua mais cedo e exige o alvo mais perto de cair).
    if (!attAlive || !defAlive) return 'stop';
    if (getWeaponQuantity(att, engagement.weaponType) <= 0) return 'stop';
    const wounded  = att.hp / att.maxHp < tuning.stopHpFrac;
    const nearKill = def.hp <= tuning.finishHpThreshold;
    return (wounded && !nearKill) ? 'stop' : 'continue';
  }

  // Defensor: continuar se o grupo tem contra-arma utilizável (ganha iniciativa
  // se o atacante parar); parar só quando nenhum contra-ataque é possível.
  if (!attAlive) return 'stop';
  let group;
  if (engagement.targetCategory === 'surface') {
    group = state.units.filter(u => (u.hp ?? 0) > 0 && u.team === engagement.targetTeam &&
      u.col === engagement.targetCol && u.row === engagement.targetRow);
  } else {
    group = defAlive ? [def] : [];
  }
  const canCounter = group.some(u => {
    if (!canAttack(u) || u.id === att.id) return false;
    const w = selectBestWeapon(u, att, hexDist(u.col, u.row, att.col, att.row));
    return w && !isSingleRoundWeapon(w);
  });
  return canCounter ? 'continue' : 'stop';
}

// Aplica movimentos do bot ao estado (sem I/O de sala) — exportado p/ testes.
function applyBotMovesToState(state, botTeam, moves) {
  for (const { unitId, path } of moves) {
    if (!Array.isArray(path) || path.length < 2) continue;
    const unit = state.units.find(u => u.id === unitId && u.hp > 0);
    if (!unit) continue;
    const dest = path[path.length - 1];
    unit.col = dest.col; unit.row = dest.row; unit.moved = true;
    state.log.unshift(`${unit.name}(${botTeam}) → ${String.fromCharCode(65 + dest.col)}${dest.row + 1}`);
    const dist = path.length - 1;
    if (unit.category !== 'air') {
      spendNavalFuel(unit, navalMoveCost(dist));
    } else {
      unit.airStatus = 'airborne';
      spendAirFuel(unit, dist);
      if (isAirRefuelLocation(unit, state)) unit.fuel.wasAtRefuelLocation = true;
    }
  }
  for (const u of state.units) {
    if (u.hp <= 0 || u.team !== botTeam || u.moved) continue;
    if (u.category === 'air') {
      if (u.airStatus === 'airborne') {
        if (isAirRefuelLocation(u, state)) u.fuel.wasAtRefuelLocation = true;
        else spendAirFuel(u, 1);
      }
    } else { spendNavalFuel(u, navalMoveCost(0)); }
  }
  state[botTeam === 'blue' ? 'blueDone' : 'redDone'] = true;
}

function applyBotMoves(room) {
  const { state } = room;
  if (!state || state.phase !== 'movement') return;
  const bt  = room.botTeam;
  const key = bt === 'blue' ? 'blueDone' : 'redDone';
  if (state[key]) return;

  const moves = computeBotMoves(state, bt, room.botDoctrine);
  gameLogger.logMoves(room.id, state.turn, state.period, bt, moves, state, BOT_AGENT);
  applyBotMovesToState(state, bt, moves);

  if (state.blueDone && state.redDone) {
    const navalEmpty = checkNavalFuelZero(state);
    for (const u of navalEmpty) {
      const pid = room.players[u.team];
      if (pid) io.to(pid).emit('fuel_alert', { unitId: u.id, name: u.name, type: 'naval_empty' });
      state.log.unshift(`⛽ ${u.name}(${u.team}) sem combustível: não pode mover, atacar ou se defender.`);
    }
    const airLost = checkAirFuelLosses(state);
    for (const u of airLost) {
      const pid = room.players[u.team];
      if (pid) io.to(pid).emit('fuel_alert', { unitId: u.id, name: u.name, type: 'air_lost' });
      state.log.unshift(`✈ ${u.name}(${u.team}) perdida por falta de combustível.`);
    }
    state.phase = 'combat';
    state.log.unshift('Fase de Combate iniciada. Declare seus ataques.');
  } else {
    state.log.unshift('BOT encerrou a movimentação.');
  }
  if (state.log.length > 50) state.log = state.log.slice(0, 50);
  broadcast(room);
}

// ─── Server ───────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/',     (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));   // apresentação da OAS-SM
app.get('/classico', (_, res) => res.sendFile(path.join(__dirname, 'public', 'classico.html')));   // lobby do jogo base
app.get('/game', (_, res) => res.sendFile(path.join(__dirname, 'public', 'game.html')));
app.get('/construtivo', (_, res) => res.sendFile(path.join(__dirname, 'public', 'construtivo.html')));
app.get('/replay',      (_, res) => res.sendFile(path.join(__dirname, 'public', 'replay.html')));
// Variante de Segurança Marítima (OAS-SM): salas no namespace /sm (sm_server.js).
app.get('/sm',          (_, res) => res.sendFile(path.join(__dirname, 'public', 'sm.html')));
require('./sm_server').attach(io.of('/sm'));
// Questionário de validação (página estática; também publicada no GitHub Pages).
app.use('/questionario', express.static(path.join(__dirname, 'docs', 'questionario'), { index: 'index.html', dotfiles: 'ignore' }));

// ─── Simulação construtiva (PBC) ──────────────────────────────────────────────
// Lotes de partidas bot-vs-bot, sem jogadores: a página /construtivo monta um
// pacote de capacidades, dispara o lote aqui e lê o progresso até o relatório.
// Um bloco fatorial são 640 partidas; rodá-las de uma vez travaria o laço de
// eventos e derrubaria as salas abertas, então o lote avança em fatias com
// setImmediate entre elas.
const CONSTRUCTIVE_JOBS = new Map();
const JOB_TTL_MS    = 30 * 60 * 1000;   // resultado disponível por 30 min
const JOB_SLICE_MS  = 30;               // tempo por fatia antes de ceder o laço
const JOB_MAX_LIVE  = 4;                // lotes simultâneos

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of CONSTRUCTIVE_JOBS) {
    if (job.status !== 'running' && now - job.updatedAt > JOB_TTL_MS) CONSTRUCTIVE_JOBS.delete(id);
  }
}

// ─── Ordens de batalha carregadas de planilha ────────────────────────────────
// Cache em memória por impressão digital (SHA-256 do conteúdo canônico). Não é
// a fonte de verdade: o Render reinicia e apaga a memória, então o navegador
// guarda a OB validada e a reenvia (POST /api/construtivo/ob/json) quando o
// servidor responde que não a conhece. Mesmo conteúdo → mesmo id.
const OB_CACHE     = new Map();          // obId → { ob, nome, usadaEm }
const OB_CACHE_MAX = 50;
const OB_ID_RE     = /^([0-9a-f]{16}|padrao)$/;

function registrarOB(ob, nome) {
  const obId = scenario.ehPadrao(ob) ? 'padrao' : scenario.obHash(ob);
  if (obId === 'padrao') return obId;    // a padrão sem edição usa o caminho de sempre
  OB_CACHE.delete(obId);                 // reinserir = mais recente (LRU pela ordem do Map)
  OB_CACHE.set(obId, { ob: deepFreeze(ob), nome: String(nome || 'planilha').slice(0, 80), usadaEm: Date.now() });
  while (OB_CACHE.size > OB_CACHE_MAX) OB_CACHE.delete(OB_CACHE.keys().next().value);
  return obId;
}

/**
 * OB a usar numa simulação. Sem id (ou 'padrao') é a OB de sempre. Id
 * desconhecido devolve 404 com código próprio — é o sinal para o navegador
 * reenviar a OB que tem guardada.
 */
function resolverOB(obId) {
  if (obId === undefined || obId === null || obId === '' || obId === 'padrao') {
    return { ob: ORDER_OF_BATTLE, obId: 'padrao', nome: 'Ordem de batalha padrão' };
  }
  if (!OB_ID_RE.test(String(obId))) {
    return { status: 400, erro: { error: 'Identificador de ordem de batalha inválido.' } };
  }
  const e = OB_CACHE.get(obId);
  if (!e) {
    return { status: 404, erro: { error: 'Ordem de batalha desconhecida neste servidor.', codigo: 'OB_DESCONHECIDA', obId } };
  }
  e.usadaEm = Date.now();
  OB_CACHE.delete(obId); OB_CACHE.set(obId, e);
  return { ob: e.ob, obId, nome: e.nome };
}

// Congelada: a mesma OB é lida por lotes e salas ao mesmo tempo, e qualquer
// escrita acidental nela vazaria entre eles. Em modo estrito, escrever lança.
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

app.get('/api/construtivo/meta', (req, res) => {
  const obSel = resolverOB(req.query.ob);
  if (obSel.erro) return res.status(obSel.status).json(obSel.erro);
  // Unidades por pacote e por grupo vêm da OB em uso: numa OB carregada, uma
  // fragata nova classificada em C_Azuis aparece listada no pacote.
  const { pacotes, grupos } = scenario.descreverForcas(obSel.ob);
  const notas = Object.fromEntries(obSel.ob.forces.blue.map(u => [u.id, u.notes || '']));
  res.json({
    ob: { id: obSel.obId, nome: obSel.nome, resumo: scenario.resumirOB(obSel.ob) },
    fatores: FACTOR_KEYS.map(k => ({
      chave: k,
      rotulo: CAPABILITY_FACTORS[k].label,
      custo: CAPABILITY_FACTORS[k].cost,
      unidades: pacotes[k].map(u => ({ ...u, notas: notas[u.id] || '' })),
    })),
    custoTotal: FACTOR_KEYS.reduce((s, k) => s + CAPABILITY_FACTORS[k].cost, 0),
    // Força Vermelha: ajustável por grupo-tarefa da taxonomia. É a ameaça do
    // cenário, não o que está sendo adquirido — por isso varia em composição,
    // mas não entra no custo EAC.
    gruposVermelhos: RED_GROUP_KEYS.map(sigla => ({
      sigla,
      rotulo: RED_GROUPS[sigla].label,
      dominio: RED_GROUPS[sigla].domain,
      unidades: grupos[sigla],
    })),
    quantidadeMaxima: MAX_QUANTITY,
    blocos: {
      ablacao:  ABLATION_CONDITIONS.map(c => ({ condicao: c.condicao, removida: c.capacidade_removida, custo: c.custo_total, replicas: c.replicas })),
      fatorial: { condicoes: FACTORIAL_CONDITIONS.length, replicas: FACTORIAL_CONDITIONS[0].replicas },
    },
    maxTurnsPadrao: constructiveSim.DEFAULT_MAX_TURNS,
    metricas: constructiveSim.METRIC_KEYS,
    regrasVitoria: VICTORY_RULES,
    regraVitoriaPadrao: VICTORY_RULE_DEFAULT,
  });
});

// Tamanho real da força sob uma composição. Quantidades arrastam dependentes
// (a ala aérea sai com o porta-aviões, a equipe de OpEsp sai com o submarino
// que a insere), e essa cascata atravessa grupos — somar unitIds no cliente
// daria um número errado. Aqui o cálculo passa pelo mesmo applyForceConfig que
// monta a partida, então o que a tela mostra é o que vai a campo.
app.post('/api/construtivo/forca', (req, res) => {
  const { factors, redGroups, obId } = req.body || {};
  const obSel = resolverOB(obId);
  if (obSel.erro) return res.status(obSel.status).json(obSel.erro);
  try {
    const ob = applyForceConfig(obSel.ob, { factors: factors || {}, redGroups: redGroups || {} });
    const lado = side => ({
      n: ob.forces[side].length,
      unidades: ob.forces[side].map(u => ({ id: u.id, nome: u.name })),
    });
    res.json({ azul: lado('blue'), vermelha: lado('red'), descricaoVermelha: describeRedConfig(redGroups || {}) });
  } catch (err) {
    res.status(400).json({ error: 'Composição inválida: ' + err.message });
  }
});

// ─── Ordem de batalha em planilha ─────────────────────────────────────────────
const obPlanilha = require('./shared/ob_spreadsheet');

// Baixar a OB em uso (padrão, ou uma carregada) como .xlsx.
app.get('/api/construtivo/ob/planilha', async (req, res) => {
  const obSel = resolverOB(req.query.ob);
  if (obSel.erro) return res.status(obSel.status).json(obSel.erro);
  try {
    const ob  = obSel.obId === 'padrao' ? scenario.DEFAULT_ANOTADA : obSel.ob;
    const buf = await obPlanilha.exportarPlanilha(ob, { nome: obSel.nome });
    const arq = obSel.obId === 'padrao' ? 'ordem_de_batalha_padrao.xlsx' : `ordem_de_batalha_${obSel.obId}.xlsx`;
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${arq}"`);
    res.send(buf);
  } catch (err) {
    console.error('[ob] exportação falhou:', err);
    res.status(500).json({ error: 'Não foi possível gerar a planilha.' });
  }
});

// Resposta comum aos dois caminhos de carga: valida, registra, devolve a OB
// canônica — que o navegador guarda para reenviar se o servidor reiniciar.
function responderOB(res, rascunho, nome, errosLeitura = [], avisosLeitura = []) {
  // Sem rascunho (arquivo ilegível) só há os erros de leitura. Com rascunho, a
  // validação roda MESMO havendo erros de leitura: o usuário vê tudo o que
  // precisa corrigir de uma vez, em vez de corrigir em rodadas. As células que
  // a leitura já recusou não geram um segundo erro (_invalido).
  if (!rascunho) return res.status(422).json({ erros: errosLeitura, avisos: avisosLeitura });
  const v = scenario.validarOB(rascunho);
  const avisos = [...avisosLeitura, ...v.avisos];
  const erros  = [...errosLeitura, ...v.erros];
  if (erros.length) return res.status(422).json({ erros, avisos });
  const obId = registrarOB(v.ob, nome);
  res.json({
    obId,
    nome: obId === 'padrao' ? 'Ordem de batalha padrão' : String(nome || 'planilha').slice(0, 80),
    padrao: obId === 'padrao',
    resumo: scenario.resumirOB(v.ob),
    avisos,
    ob: v.ob,
  });
}

// Carregar uma planilha. O arquivo vem como corpo bruto (o navegador manda o
// File direto no fetch) — sem parser multipart. Content-Type forçado pelo
// cliente: File.type pode vir vazio, e aí express.raw entregaria {}.
app.post('/api/construtivo/ob',
  express.raw({ type: 'application/octet-stream', limit: obPlanilha.MAX_BYTES }),
  async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ erros: ['Nenhum arquivo recebido.'], avisos: [] });
    }
    let nome = 'planilha.xlsx';
    try { nome = decodeURIComponent(String(req.get('X-Nome-Arquivo') || nome)); } catch { /* nome padrão */ }
    nome = nome.replace(/[<>&"`]/g, '').slice(0, 80);
    const lida = await obPlanilha.lerPlanilhaIsolada(req.body);
    responderOB(res, lida.rascunho, nome, lida.erros, lida.avisos);
  });

// Reenviar uma OB que o navegador já tinha validado (o servidor reiniciou e a
// esqueceu). Passa pela MESMA validação — nunca se confia no hash do cliente:
// o id é recalculado do conteúdo, e conteúdo igual dá o mesmo id.
app.post('/api/construtivo/ob/json', (req, res) => {
  const { ob, nome } = req.body || {};
  if (!ob || typeof ob !== 'object' || !ob.forces || !Array.isArray(ob.forces.blue) || !Array.isArray(ob.forces.red)) {
    return res.status(400).json({ erros: ['Ordem de batalha em formato inválido.'], avisos: [] });
  }
  // Só os campos de dado: marcas internas da leitura de planilha (_onde,
  // _invalido) poderiam suprimir erros da validação se viessem de fora.
  const limpar = u => {
    if (!u || typeof u !== 'object' || Array.isArray(u)) return {};
    const { _onde, _invalido, ...resto } = u;
    void _onde; void _invalido;
    resto.composition = Array.isArray(resto.composition)
      ? resto.composition.map(c => (c && typeof c === 'object') ? { type: c.type, quantity: c.quantity } : {})
      : [];
    return resto;
  };
  const rascunho = {
    forces: { blue: ob.forces.blue.map(limpar), red: ob.forces.red.map(limpar) },
    limiares: ob.limiares && typeof ob.limiares === 'object' ? ob.limiares : {},
  };
  responderOB(res, rascunho, typeof nome === 'string' ? nome.replace(/[<>&"`]/g, '') : 'planilha');
});

// Corpo grande demais (planilha acima de 1 MB, JSON acima do limite global):
// o padrão do Express responde com uma página HTML e o stack trace. Aqui vira
// uma mensagem que a tela consegue mostrar.
app.use('/api/construtivo', (err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ erros: [`O arquivo passa do limite de ${obPlanilha.MAX_BYTES / 1024} KB.`], avisos: [] });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Corpo da requisição inválido.', erros: ['Corpo da requisição inválido.'], avisos: [] });
  }
  next(err);
});

// Rótulos das condições de vitória — fixos dentro de uma OB, e calculados uma
// vez por OB para irem no envelope do replay. Por OB, e não uma vez só: os
// rótulos trazem contagens e limiares ("Neutralizar 3 de 4 FPSOs") que uma OB
// carregada de planilha pode ter mudado.
const { rotulosObjetivos } = require('./shared/replay_trace');
const ROTULOS_POR_OB = new Map();
function rotulosPara(obSel) {
  if (!ROTULOS_POR_OB.has(obSel.obId)) {
    if (ROTULOS_POR_OB.size > OB_CACHE_MAX) ROTULOS_POR_OB.clear();
    ROTULOS_POR_OB.set(obSel.obId, rotulosObjetivos(computeObjectives(newGame(obSel.ob))));
  }
  return ROTULOS_POR_OB.get(obSel.obId);
}

// ─── Replay de uma partida ────────────────────────────────────────────────────
// Reproduz UMA partida do simulador construtivo, gravando o caminho passo a
// passo. Nada é armazenado: como o motor é semeado, a partida é re-executada
// sob demanda a partir dos parâmetros — guardar os traços de um lote fatorial
// custaria ~180 MB por job, re-rodar custa ~20 ms.
//
// GET, e com os parâmetros todos explícitos na query — e não POST com um id de
// job — porque a URL da página /replay é repassada literalmente para cá. Uma
// URL, uma fonte de verdade, e o link continua reproduzindo a partida depois
// que o job expirou (JOB_TTL_MS = 30 min). É o que permite citar um caso.
//
// A validação é estrita de propósito: `resolveVictoryRule` cai no padrão em
// silêncio e `quantityOf(NaN)` devolve 1. Num lote isso é benigno; aqui um
// `rule=exaustao` (sem h) reproduziria OUTRA partida, que o usuário leria como
// sendo a da linha do relatório. Erro visível é muito melhor que replay
// sutilmente errado.
app.get('/api/construtivo/replay', (req, res) => {
  const q = req.query || {};
  const erro = m => res.status(400).json({ error: m });

  if (!/^\d+$/.test(String(q.seed ?? ''))) {
    return erro('Parâmetro "seed" é obrigatório e deve ser um inteiro não negativo.');
  }
  const seed = Number(q.seed);
  if (!Number.isSafeInteger(seed)) return erro('Semente fora da faixa representável.');

  // Quantidade por fator. Ausente = 1 (ordem de batalha). Aceita a forma legada
  // -1/+1 das condições de bloco, que é como shared/conditions.js as escreve.
  const factors = {};
  for (const k of FACTOR_KEYS) {
    if (q[k] === undefined || q[k] === '') { factors[k] = 1; continue; }
    if (!/^-?\d+$/.test(String(q[k]))) return erro(`Quantidade inválida para "${k}": ${q[k]}`);
    factors[k] = quantityOf(Number(q[k]));
  }

  const maxTurns = Math.max(1, Math.min(40, Number(q.maxTurns) || constructiveSim.DEFAULT_MAX_TURNS));

  if (q.rule !== undefined && !VICTORY_RULES.includes(String(q.rule))) {
    return erro(`Regra de vitória desconhecida: "${q.rule}". Use ${VICTORY_RULES.join(' ou ')}.`);
  }
  const victoryRule = q.rule ? String(q.rule) : VICTORY_RULE_DEFAULT;

  // red=INTERV:2,LOG:0
  let redGroups;
  if (q.red) {
    redGroups = {};
    for (const par of String(q.red).split(',')) {
      const [sigla, n] = par.split(':');
      if (!RED_GROUP_KEYS.includes(sigla)) {
        return erro(`Grupo Vermelho desconhecido: "${sigla}". Válidos: ${RED_GROUP_KEYS.join(', ')}.`);
      }
      if (!/^\d+$/.test(String(n ?? ''))) return erro(`Quantidade inválida para o grupo "${sigla}": ${n}`);
      redGroups[sigla] = quantityOf(Number(n));
    }
  }

  // Partida jogada com uma OB carregada só se reproduz com a mesma OB. Se o
  // servidor não a conhece (reiniciou), a página reenvia a que guardou.
  const obSel = resolverOB(q.ob);
  if (obSel.erro) return res.status(obSel.status).json(obSel.erro);

  let t;
  try {
    t = constructiveSim.traceGame({ factors, seed, maxTurns, victoryRule, redGroups,
                                    ob: obSel.ob, obId: obSel.obId });
  } catch (err) {
    console.error('[replay] falhou:', err);
    return res.status(500).json({ error: 'Não foi possível reproduzir a partida: ' + err.message });
  }

  const obtido = { vencedor: t.resultado.winner || 'censurado', turnos: t.resultado.turns };
  const conferencia = montarConferencia(q.expect, obtido, maxTurns);

  const payload = {
    partida: {
      seed, factors, redGroups: redGroups || null, maxTurns, victoryRule,
      custoTotal:    totalCost(factors),
      nCapacidades:  FACTOR_KEYS.filter(k => factors[k] >= 1).length,
      forcaVermelha: describeRedConfig(redGroups || {}),
      rotulo:        q.label ? String(q.label).slice(0, 120) : null,
      // A doutrina não é parâmetro: o laço construtivo chama computeBotMoves sem
      // ela, então os dois lados jogam sempre no padrão.
      doutrinaBot:   `${DOCTRINE_DEFAULT.formation}/${DOCTRINE_DEFAULT.posture}`,
      obId:          obSel.obId,
      obNome:        obSel.nome,
    },
    catalogo:      t.catalogo,
    quadroInicial: t.quadroInicial,
    passos:        t.passos,
    truncado:      t.truncado,
    resultado:     t.resultado,
    conferencia,
    // Vocabulário de combate: deixa a tela explicar POR QUE aquela arma foi a
    // escolhida, sem reimplementar a prioridade do motor no cliente.
    armas: {
      prioridade: WEAPON_PRIORITY,
      salvaPadrao: SALVO_SIZE,
      perfis: Object.fromEntries(Object.entries(COMBAT_CONFIG.weaponProfiles || {}).map(
        ([k, p]) => [k, { label: p.label, targets: p.targets, expendable: !!p.expendable,
                          defaultRange: p.defaultRange, interceptableBy: p.interceptableBy || [] }])),
    },
    objetivosRotulos: rotulosPara(obSel),
  };

  enviarJson(req, res, payload);
});

// `expect=blue:4` — o desfecho que o lote registrou para esta linha. Divergir
// responde 200, não erro: a partida re-executada É válida sob aqueles
// parâmetros, e uma divergência é sinal de bug que se quer VISÍVEL na tela, não
// engolido por uma página de erro.
function montarConferencia(expect, obtido, maxTurns) {
  if (!expect) return { ok: true, esperado: null, obtido, motivo: null };
  const [vencedor, turnos] = String(expect).split(':');
  if (!vencedor || !/^\d+$/.test(String(turnos ?? ''))) {
    return { ok: true, esperado: null, obtido, motivo: null };
  }
  const esperado = { vencedor, turnos: Number(turnos) };
  const ok = esperado.vencedor === obtido.vencedor && esperado.turnos === obtido.turnos;
  if (ok) return { ok: true, esperado, obtido, motivo: null };

  // Só três causas são possíveis, e vale nomeá-las: o usuário vai querer saber
  // se o relatório que está citando foi gerado por outra versão do motor.
  const soTurnos = esperado.vencedor === obtido.vencedor;
  console.warn(`[replay] divergência: lote ${esperado.vencedor}:${esperado.turnos}, ` +
               `re-execução ${obtido.vencedor}:${obtido.turnos}`);
  return {
    ok: false, esperado, obtido,
    motivo: soTurnos
      ? `Mesmo vencedor, turnos diferentes — provável limite de turnos distinto do lote `
        + `(aqui: ${maxTurns}). O limite não entra em nenhuma decisão, então o caminho `
        + `mostrado é fiel até onde vai.`
      : 'Desfecho diferente do que o lote registrou. As causas possíveis são: o código do '
        + 'motor mudou desde que o lote rodou; algum parâmetro (limite de turnos, regra de '
        + 'vitória, composição Vermelha) difere do usado no lote; ou há um defeito de '
        + 'reprodutibilidade. Não use esta reprodução como evidência do resultado do lote.',
  };
}

// gzip pelo zlib nativo: um traço de 230 KB vira ~25 KB na rede, sem acrescentar
// dependência ao projeto por causa de uma rota.
function enviarJson(req, res, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.set('Vary', 'Accept-Encoding');
  res.type('application/json');
  if (req.acceptsEncodings('gzip')) {
    res.set('Content-Encoding', 'gzip');
    return res.send(zlib.gzipSync(body));
  }
  res.send(body);
}

app.post('/api/construtivo/run', (req, res) => {
  pruneJobs();
  const emAndamento = [...CONSTRUCTIVE_JOBS.values()].filter(j => j.status === 'running').length;
  if (emAndamento >= JOB_MAX_LIVE) {
    return res.status(429).json({ error: 'Há lotes demais em execução. Aguarde um terminar.' });
  }

  const spec = req.body || {};
  let conditions;
  try {
    conditions = constructiveSim.buildConditions(spec);
  } catch (err) {
    return res.status(400).json({ error: 'Configuração inválida: ' + err.message });
  }

  // OB do lote: a padrão, ou uma carregada de planilha. O job guarda a
  // referência — se o cache a descartar durante o lote, o lote não quebra.
  const obSel = resolverOB(spec.obId);
  if (obSel.erro) return res.status(obSel.status).json(obSel.erro);

  const id  = genId() + genId();
  const job = { id, status: 'running', feito: 0, total: 0, condicaoAtual: null,
                resultado: null, erro: null, criadoEm: Date.now(), updatedAt: Date.now() };
  CONSTRUCTIVE_JOBS.set(id, job);

  // Executa em fatias: cada setImmediate devolve o laço de eventos ao servidor,
  // para que o jogo interativo não congele durante um lote longo.
  const maxTurns    = Math.max(1, Math.min(40, Number(spec.maxTurns) || constructiveSim.DEFAULT_MAX_TURNS));
  const victoryRule = resolveVictoryRule(spec.victoryRule);
  const redGroups   = spec.redGroups && typeof spec.redGroups === 'object' ? spec.redGroups : undefined;
  const ctx = { maxTurns, victoryRule, redGroups, ob: obSel.ob, obId: obSel.obId };
  try {
    constructiveSim.checarTamanho(conditions, ctx);
  } catch (err) {
    CONSTRUCTIVE_JOBS.delete(id);
    return res.status(400).json({ error: err.message });
  }
  const replicasOverride = spec.bloco && Number(spec.replicas) ? Number(spec.replicas) : null;
  const plano = [];
  for (const cond of conditions) {
    const seeds = replicasOverride ? cond.seeds.slice(0, replicasOverride) : cond.seeds;
    seeds.forEach((seed, idx) => plano.push({ cond, seed, replica: idx + 1 }));
  }
  job.total = plano.length;

  const rows = [];
  let i = 0;
  function passo() {
    // Fatia por TEMPO, não por contagem: com uma OB carregada grande, dez
    // partidas por fatia podiam prender o laço de eventos por segundos e
    // congelar as salas interativas. Sempre ao menos uma partida por fatia.
    const ate = Date.now() + JOB_SLICE_MS;
    try {
      while (i < plano.length) {
        const { cond, seed, replica } = plano[i];
        rows.push(constructiveSim.runRow(cond, seed, replica, ctx));
        job.condicaoAtual = cond.condicao;
        i++;
        if (Date.now() >= ate) break;
      }
    } catch (err) {
      job.status = 'error'; job.erro = err.message; job.updatedAt = Date.now();
      console.error('[construtivo] lote falhou:', err);
      return;
    }
    job.feito = i; job.updatedAt = Date.now();
    if (i < plano.length) { setImmediate(passo); return; }

    // Agregação final por condição.
    const porCondicao = conditions.map(cond => {
      const condRows = rows.filter(r => r.condicao === cond.condicao);
      return { condicao: cond.condicao, bloco: cond.bloco,
               capacidade_removida: cond.capacidade_removida ?? null,
               factors: cond.factors, n_capacidades: cond.n_capacidades,
               custo_total: cond.custo_total, replicas: condRows.length,
               resumo: constructiveSim.summarize(condRows) };
    });
    job.resultado = { rows, porCondicao, total: rows.length, maxTurns, victoryRule,
                      forcaVermelha: describeRedConfig(redGroups),
                      // O objeto, e não só a descrição: é o que o relatório
                      // precisa para montar o link de replay de cada partida.
                      redGroupsUsados: redGroups || {},
                      obId: obSel.obId, obNome: obSel.nome,
                      gruposPresentes: constructiveSim.presentGroups(rows) };
    job.status = 'done'; job.updatedAt = Date.now();
  }
  setImmediate(passo);

  res.json({ id, total: job.total });
});

app.get('/api/construtivo/job/:id', (req, res) => {
  const job = CONSTRUCTIVE_JOBS.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Lote não encontrado (pode ter expirado).' });
  // Durante a execução devolve só o progresso — o resultado completo de um
  // fatorial são centenas de linhas, não faz sentido reenviá-las a cada sondagem.
  if (job.status === 'running') {
    return res.json({ id: job.id, status: job.status, feito: job.feito, total: job.total, condicaoAtual: job.condicaoAtual });
  }
  res.json({ id: job.id, status: job.status, feito: job.feito, total: job.total,
             erro: job.erro, resultado: job.resultado });
});

app.get('/api/construtivo/job/:id/csv', (req, res) => {
  const job = CONSTRUCTIVE_JOBS.get(req.params.id);
  if (!job || job.status !== 'done') return res.status(404).json({ error: 'Lote não disponível.' });
  res.attachment(`construtivo_${job.id}.csv`);
  res.type('text/csv').send(constructiveSim.toCsv(job.resultado.rows));
});

// Exporta os logs de partidas (data/game-logs/*.jsonl) gravados neste servidor
// como um .zip, para download manual e inclusão no dataset de treinamento.
app.get('/api/export-logs', (_, res) => {
  const logDir = path.join(__dirname, 'data', 'game-logs');
  const files = fs.existsSync(logDir)
    ? fs.readdirSync(logDir).filter(f => f.endsWith('.jsonl'))
    : [];

  if (files.length === 0) {
    return res.status(404).json({ error: 'Nenhum log de partida encontrado neste servidor.' });
  }

  res.attachment(`game-logs_${new Date().toISOString().slice(0, 10)}.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => res.status(500).end(String(err)));
  archive.pipe(res);
  for (const f of files) archive.file(path.join(logDir, f), { name: f });
  archive.finalize();
});

// Exporta o log completo (.jsonl) de UMA partida específica — usado pelo botão
// "Exportar Log Completo" ao final do jogo. Contém todos os eventos registrados
// pelo game_logger (estado inicial, movimentos, ataques, engajamentos e estado final).
app.get('/api/export-logs/:roomId', (req, res) => {
  const roomId = String(req.params.roomId || '').toUpperCase();
  if (!/^[A-Z0-9]+$/.test(roomId)) {
    return res.status(400).json({ error: 'ID de sala inválido.' });
  }
  const logDir = path.join(__dirname, 'data', 'game-logs');
  const file = fs.existsSync(logDir)
    ? fs.readdirSync(logDir).find(f => f.endsWith(`_${roomId}.jsonl`))
    : null;

  if (!file) {
    return res.status(404).json({ error: 'Log não encontrado para esta partida neste servidor.' });
  }
  res.download(path.join(logDir, file), file);
});

const rooms = new Map();
function genId()    { return Math.random().toString(36).slice(2,8).toUpperCase(); }
function genToken() { return crypto.randomBytes(16).toString('hex'); }

// Período de graça para reconexão (ms) — configurável para testes
const REJOIN_GRACE_MS = parseInt(process.env.REJOIN_GRACE_MS, 10) || 75000;

// Encerra a sala quando o período de graça expira sem rejoin.
function endRoomByDisconnect(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.graceTimer = null;
  if (room.state && !room.state.winner) {
    const obj = computeObjectives(room.state);
    gameLogger.logGameOver(roomId, room.state.turn, null, 'disconnect', obj, room.state);
  }
  if (room.facilitated) {
    // Avisa quem ficou qual papel caiu, para a mensagem não dizer "oponente".
    const gone = ['facilitator', 'blue', 'red'].find(s => !room.players[s]) || 'facilitator';
    for (const pid of Object.values(room.players)) {
      if (pid) io.to(pid).emit('participant_disconnected', { role: gone, grace: false });
    }
  } else {
    const other = room.players.blue || room.players.red;
    if (other) io.to(other).emit('opponent_disconnected', { grace: false });
  }
  rooms.delete(roomId);
}

// Sala com facilitador: sem o facilitador a partida não anda; sem um dos
// jogadores, só importa depois que ela começou (na configuração o assento
// fica livre para ele voltar pelo código a qualquer momento).
function facNeedsGrace(room) {
  if (room.state?.winner) return false;
  if (!room.players.facilitator) return true;
  return room.state?.phase !== 'setup' && (!room.players.blue || !room.players.red);
}

function broadcast(room) {
  if (!room.state) return;
  if (room.players.blue) io.to(room.players.blue).emit('game_update', stateFor(room.state,'blue'));
  if (room.players.red)  io.to(room.players.red ).emit('game_update', stateFor(room.state,'red'));
  if (room.players.facilitator) io.to(room.players.facilitator).emit('game_update', facView(room));
}

// Visão do facilitador: estado completo + quais assentos estão ocupados.
function facView(room) {
  return { ...stateFor(room.state, 'facilitator'),
           seats: { blue: !!room.players.blue, red: !!room.players.red } };
}

// ─── Arbitragem do facilitador ────────────────────────────────────────────────
const hexName = (col, row) => `${String.fromCharCode(65 + col)}${row + 1}`;

// Unidades que viajam junto com `unit`: forças especiais hospedadas (hostId) e
// aeronaves embarcadas que ainda não decolaram (baseUnitId).
function attachedUnits(state, unit) {
  return state.units.filter(u => (u.hp ?? 0) > 0 && u.id !== unit.id && (
    u.hostId === unit.id ||
    (u.baseUnitId === unit.id && u.category === 'air' && u.airStatus !== 'airborne')
  ));
}

// Reposiciona uma unidade (e quem viaja com ela). Na configuração inicial a
// nova posição passa a ser também a "casa" da unidade (baseHex/snapshot).
function placeUnit(state, unit, col, row) {
  for (const u of [unit, ...attachedUnits(state, unit)]) {
    u.col = col; u.row = row;
    if (state.phase === 'setup') {
      u.baseHex = { col, row };
      state.movementSnapshot[u.id] = { col, row };
    } else if (u !== unit && u.category === 'air') {
      u.baseHex = { col, row };
    }
  }
}

// Zera uma unidade e tudo o que ela transporta.
function destroyWithCargo(state, unit) {
  unit.hp = 0;
  for (const u of state.units) {
    if ((u.hp ?? 0) > 0 && (u.baseUnitId === unit.id || u.hostId === unit.id) &&
        (u.category !== 'air' || u.airStatus !== 'airborne')) {
      u.hp = 0;
      state.log.unshift(`💥 ${u.name} perdido com ${unit.name}`);
    }
  }
}

function canPlaceAt(unit, col, row) {
  if (col < 0 || col >= GRID_W || row < 0 || row >= GRID_H) return false;
  return canEnterTerrain(unit.category, getTerrain(col, row));
}

const TEAM_PT = { blue: 'azul', red: 'verm', neutral: 'neutro' };

io.on('connection', socket => {
  console.log('+ connect', socket.id);

  socket.on('create_room', () => {
    const id = genId();
    rooms.set(id, { id, players:{blue:socket.id,red:null}, state:null,
                    rejoinTokens:{blue:genToken(),red:genToken()} });
    socket.data.roomId=id; socket.data.team='blue';
    socket.join(id);
    socket.emit('room_created',{roomId:id,team:'blue'});
  });

  // `factors` (opcional) vem da simulação construtiva: joga-se a partida com o
  // mesmo pacote de capacidades avaliado no lote, para confrontar o resultado
  // estatístico com uma partida conduzida por um humano.
  socket.on('create_solo_room', ({ team, formation, posture, factors, redGroups, obId } = {}) => {
    if (!['blue','red'].includes(team)) { socket.emit('join_error','Equipe inválida.'); return; }
    // OB carregada de planilha ("Jogar este pacote" a partir do simulador). Se
    // o servidor não a conhece (reiniciou), o cliente reenvia a que guardou e
    // tenta de novo — por isso um evento próprio, e não uma mensagem de erro.
    const obSel = resolverOB(obId);
    if (obSel.erro) {
      if (obSel.erro.codigo === 'OB_DESCONHECIDA') socket.emit('ob_desconhecida', { obId });
      else socket.emit('join_error', obSel.erro.error);
      return;
    }
    const id      = genId();
    const botTeam = team === 'blue' ? 'red' : 'blue';
    const capabilityFactors = factors && FACTOR_KEYS.some(k => k in factors)
      ? Object.fromEntries(FACTOR_KEYS.map(k => [k, quantityOf(factors[k])]))
      : null;
    const redComposition = redGroups && RED_GROUP_KEYS.some(k => k in redGroups)
      ? Object.fromEntries(RED_GROUP_KEYS.filter(k => k in redGroups).map(k => [k, quantityOf(redGroups[k])]))
      : null;
    const botDoctrine = {
      formation: resolveDoctrineChoice(formation, ['concentrated','divided'], DOCTRINE_DEFAULT.formation),
      posture:   resolveDoctrineChoice(posture,   ['offensive','defensive'],  DOCTRINE_DEFAULT.posture),
    };
    const room    = { id, players: { blue: null, red: null }, state: null, solo: true, botTeam, botDoctrine,
                      rejoinTokens: { blue: genToken(), red: genToken() } };
    room.players[team] = socket.id;
    rooms.set(id, room);
    socket.data.roomId = id; socket.data.team = team;
    socket.join(id);
    room.capabilityFactors = capabilityFactors;
    room.redComposition    = redComposition;
    room.ob   = obSel.ob;
    room.obId = obSel.obId;
    room.state = novaPartidaSolo(room);
    gameLogger.logStart(room.id, room.state,
      { solo: true, botTeam, botDoctrine, capabilityFactors, redComposition, obId: room.obId });
    socket.emit('game_start', { team, state: stateFor(room.state, team), solo: true, roomId: room.id,
                                rejoinToken: room.rejoinTokens[team] });
  });

  // Partida de uma sala solo a partir do que a sala guardou — pacote, força
  // Vermelha e OB. Usada na criação e no reinício: antes o reinício chamava
  // newGame() puro e a partida recomeçava com a OB padrão completa, perdendo o
  // pacote escolhido.
  function novaPartidaSolo(room) {
    const { capabilityFactors, redComposition } = room;
    const obId = room.obId || 'padrao';
    const composta = capabilityFactors || redComposition || obId !== 'padrao';
    const state = newGame(composta
      ? applyForceConfig(room.ob || ORDER_OF_BATTLE, { factors: capabilityFactors || {}, redGroups: redComposition || {} })
      : undefined, { obId });
    if (capabilityFactors) {
      const partes = FACTOR_KEYS.filter(k => capabilityFactors[k] >= 1)
        .map(k => capabilityFactors[k] > 1 ? `${k}×${capabilityFactors[k]}` : k);
      state.log.unshift(`🎚 Pacote de capacidades: ${partes.length ? partes.join(', ') : 'nenhuma'}.`);
    }
    if (redComposition) {
      state.log.unshift(`🎚 Força Vermelha: ${describeRedConfig(redComposition)}.`);
    }
    if (obId !== 'padrao') {
      const nome = OB_CACHE.get(obId)?.nome || 'planilha carregada';
      state.log.unshift(`📋 Ordem de batalha: ${nome} (${obId}).`);
    }
    return state;
  }

  // ── Sala com facilitador/instrutor ─────────────────────────────────────────
  // O facilitador abre a sala e entra direto no tabuleiro (fase 'setup'); os
  // dois jogadores entram depois pelo código, escolhendo Azul ou Vermelho.
  socket.on('create_facilitated_room', () => {
    const id   = genId();
    const room = { id, facilitated: true,
                   players: { blue: null, red: null, facilitator: socket.id },
                   state: newFacilitatedGame(),
                   rejoinTokens: { blue: genToken(), red: genToken(), facilitator: genToken() } };
    rooms.set(id, room);
    socket.data.roomId = id; socket.data.team = 'facilitator';
    socket.join(id);
    socket.emit('game_start', { team: 'facilitator', state: facView(room), roomId: id, facilitated: true,
                                rejoinToken: room.rejoinTokens.facilitator });
  });

  socket.on('join_room', ({roomId, team} = {}) => {
    const room=rooms.get(roomId?.toUpperCase?.());
    if (!room)           { socket.emit('join_error','Sala não encontrada.'); return; }
    if (room.facilitated) {
      const free = { blue: !room.players.blue, red: !room.players.red };
      if (!free.blue && !free.red) { socket.emit('join_error','Sala cheia.'); return; }
      // Sem equipe escolhida: o cliente pergunta ao jogador qual assento quer.
      if (!team) { socket.emit('join_choose_team', { roomId: room.id, free }); return; }
      if (!['blue','red'].includes(team)) { socket.emit('join_error','Equipe inválida.'); return; }
      if (!free[team]) {
        socket.emit('join_error', team === 'blue' ? 'Força Azul já ocupada.' : 'Força Vermelha já ocupada.');
        return;
      }
      room.players[team] = socket.id;
      socket.data.roomId = room.id; socket.data.team = team;
      socket.join(room.id);
      room.state.log.unshift(`👤 Jogador entrou na Força ${team === 'blue' ? 'Azul' : 'Vermelha'}.`);
      socket.emit('game_start', { team, state: stateFor(room.state, team), roomId: room.id, facilitated: true,
                                  rejoinToken: room.rejoinTokens[team] });
      broadcast(room);
      return;
    }
    if (room.solo || room.players.red){ socket.emit('join_error','Sala cheia.'); return; }
    room.players.red=socket.id; socket.data.roomId=room.id; socket.data.team='red';
    socket.join(room.id);
    room.state=newGame();
    gameLogger.logStart(room.id, room.state, { solo: false, botTeam: null });
    io.to(room.players.blue).emit('game_start',{team:'blue',state:stateFor(room.state,'blue'),roomId:room.id,
                                                rejoinToken:room.rejoinTokens.blue});
    socket.emit('game_start',{team:'red',state:stateFor(room.state,'red'),roomId:room.id,
                              rejoinToken:room.rejoinTokens.red});
  });

  // ── Rejoin após queda de conexão (período de graça) ────────────────────────
  socket.on('rejoin_room', ({ roomId, team, token } = {}) => {
    const room = rooms.get(roomId);
    if (!room || !room.state || room.state.winner)            { socket.emit('rejoin_failed'); return; }
    const seats = room.facilitated ? ['blue','red','facilitator'] : ['blue','red'];
    if (!seats.includes(team) || !token
        || room.rejoinTokens?.[team] !== token)               { socket.emit('rejoin_failed'); return; }
    if (room.players[team])                                   { socket.emit('rejoin_failed'); return; }
    room.players[team] = socket.id;
    socket.data.roomId = room.id; socket.data.team = team;
    socket.join(room.id);
    if (room.graceTimer) { clearTimeout(room.graceTimer); room.graceTimer = null; }
    // Em sala 2P, se o outro assento ainda está vago, o relógio continua p/ ele
    const stillVacant = room.facilitated
      ? facNeedsGrace(room)
      : !room.solo && (!room.players.blue || !room.players.red);
    if (stillVacant) room.graceTimer = setTimeout(() => endRoomByDisconnect(room.id), REJOIN_GRACE_MS);
    socket.emit('game_start', { team, state: team === 'facilitator' ? facView(room) : stateFor(room.state, team),
                                solo: !!room.solo, facilitated: !!room.facilitated,
                                roomId: room.id, rejoinToken: room.rejoinTokens[team], rejoined: true });
    if (room.facilitated) {
      for (const seat of seats) {
        if (seat !== team && room.players[seat]) io.to(room.players[seat]).emit('participant_reconnected', { role: team });
      }
      broadcast(room);
      // O facilitador não participa das decisões de rodada — nada a reemitir.
      if (team === 'facilitator') return;
    }

    // Se caiu no meio de um engajamento aguardando CONTINUAR/PARAR, reapresenta
    // a última rodada ao rejoinante — sem isso a partida trava para sempre
    // (o servidor fica esperando uma decisão que o cliente não tem como enviar).
    const st  = room.state;
    const eng = st.phase === 'combat' ? st.combatQueue?.[st.currentEngagementIndex] : null;
    if (eng && eng.results?.length > 0) {
      socket.emit('battle_round_result', {
        engagement: eng,
        result: eng.results[eng.results.length - 1].result,
        mustDecide: st.battleRoundDecisions?.[team] === null,
      });
    }

    if (!room.facilitated) {
      const other = team === 'blue' ? room.players.red : room.players.blue;
      if (other) io.to(other).emit('opponent_reconnected');
    }
  });

  // ── Movement ──────────────────────────────────────────────────────────────
  socket.on('commit_moves', ({moves}) => {
    const room=rooms.get(socket.data.roomId);
    if (!room?.state) return;
    const {state}=room, {team}=socket.data;

    if (!['blue','red'].includes(team))            { return; }  // facilitador não movimenta por aqui
    if (state.phase!=='movement')                  { socket.emit('action_error','Não é a fase de movimentação.'); return; }
    if (state[team==='blue'?'blueDone':'redDone']) { socket.emit('action_error','Você já encerrou a movimentação.'); return; }

    // Validate all paths before applying any
    for (const {unitId, path} of (moves||[])) {
      if (!Array.isArray(path)||path.length<2) continue;
      const unit=state.units.find(u=>u.id===unitId&&u.team===team&&u.hp>0);
      if (!unit) { socket.emit('action_error',`Unidade ${unitId} inválida.`); return; }
      if (unit.movement === 0) { socket.emit('action_error',`${unit.name}: unidade fixa.`); return; }
      if (isFuelDisabled(unit)) { socket.emit('action_error',`${unit.name}: sem combustível — não pode se mover.`); return; }
      if (path[0].col!==unit.col||path[0].row!==unit.row) { socket.emit('action_error',`Caminho inválido para ${unit.name}.`); return; }
      const maxRange = unit.category === 'air' ? airMovementRange(unit) : unit.movement;
      if (path.length-1>maxRange) { socket.emit('action_error',`${unit.name}: caminho excede alcance máximo.`); return; }
      for (let i=1;i<path.length;i++) {
        const {col,row}=path[i];
        if (col<0||col>=GRID_W||row<0||row>=GRID_H) { socket.emit('action_error',`${unit.name}: posição fora do tabuleiro.`); return; }
        if (hexDist(path[i-1].col,path[i-1].row,col,row)!==1) { socket.emit('action_error',`${unit.name}: passo não adjacente.`); return; }
        if (!canEnterTerrain(unit.category,getTerrain(col,row))) { socket.emit('action_error',`${unit.name}: terreno intransponível em ${String.fromCharCode(65+col)}${row+1}.`); return; }
      }
    }

    // Log decision BEFORE applying moves (captures state the player acted on)
    gameLogger.logMoves(room.id, state.turn, state.period, team, moves, state, 'human');

    // Apply all moves and charge movement fuel
    for (const {unitId, path} of (moves||[])) {
      if (!Array.isArray(path)||path.length<2) continue;
      const unit=state.units.find(u=>u.id===unitId&&u.team===team&&u.hp>0);
      if (!unit) continue;
      const from = { col: unit.col, row: unit.row };
      const dest=path[path.length-1];
      unit.col=dest.col; unit.row=dest.row; unit.moved=true;
      state.log.unshift(`${unit.name}(${team}) → ${String.fromCharCode(65+dest.col)}${dest.row+1}`);
      // Registro para a autorização do facilitador (origem → destino efetivo).
      if (state.fac) state.fac.pendingMoves.push({ unitId, team, from, to: { col: unit.col, row: unit.row }, path });
      const dist = path.length - 1;
      if (unit.category !== 'air') {
        spendNavalFuel(unit, navalMoveCost(dist));
      } else {
        // Aircraft that moved: become airborne, spend distance FP
        unit.airStatus = 'airborne';
        spendAirFuel(unit, dist);
        // If they flew to a base, mark for refuel and update home base
        if (isAirRefuelLocation(unit, state)) {
          unit.fuel.wasAtRefuelLocation = true;
          unit.baseHex = { col: dest.col, row: dest.row };
        }
      }
    }

    // Fuel for stationary units of this team
    for (const u of state.units) {
      if (u.hp <= 0 || u.team !== team || u.moved) continue;
      if (u.category === 'air') {
        if (u.airStatus === 'airborne') {
          if (isAirRefuelLocation(u, state)) {
            u.fuel.wasAtRefuelLocation = true;  // landed — ready next turn
          } else {
            spendAirFuel(u, 1);                 // patrol fuel cost
          }
        }
        // 'ready' aircraft: stay ready, no fuel cost
      } else {
        spendNavalFuel(u, navalMoveCost(0)); // stationary = 1 FP
      }
    }

    // Sync unmoved specops to their current host position
    for (const u of state.units) {
      if (u.category !== 'specops' || (u.hp ?? 0) <= 0 || u.moved || u.team !== team) continue;
      if (!u.hostId) continue;
      const host = state.units.find(h => h.id === u.hostId && (h.hp ?? 0) > 0);
      if (host) { u.col = host.col; u.row = host.row; }
    }

    if (team==='blue') state.blueDone=true; else state.redDone=true;
    if (state.blueDone&&state.redDone) {
      // ── End-of-movement fuel alerts ────────────────────────────────────────
      const navalEmpty = checkNavalFuelZero(state);
      for (const u of navalEmpty) {
        const pid = room.players[u.team];
        if (pid) io.to(pid).emit('fuel_alert', { unitId: u.id, name: u.name, type: 'naval_empty' });
        state.log.unshift(`⛽ ${u.name}(${u.team}) sem combustível: não pode mover, atacar ou se defender.`);
      }
      const airLost = checkAirFuelLosses(state);
      for (const u of airLost) {
        const pid = room.players[u.team];
        if (pid) io.to(pid).emit('fuel_alert', { unitId: u.id, name: u.name, type: 'air_lost' });
        state.log.unshift(`✈ ${u.name}(${u.team}) perdida por falta de combustível.`);
      }

      if (room.facilitated) {
        state.phase='movement_approval';
        state.log.unshift('⚖ Aguardando autorização dos movimentos pelo facilitador.');
      } else {
        state.phase='combat';
        state.log.unshift('Fase de Combate iniciada. Declare seus ataques.');
      }
    } else {
      const waiting=team==='blue'?'Força Vermelha':'Força Azul';
      state.log.unshift(`${team==='blue'?'Força Azul':'Força Vermelha'} encerrou a movimentação. Aguardando ${waiting}...`);
    }
    if (state.log.length>50) state.log=state.log.slice(0,50);
    broadcast(room);
    // Solo: agendar movimentação do bot após o humano confirmar
    if (room.solo) {
      const btKey = room.botTeam === 'blue' ? 'blueDone' : 'redDone';
      if (!state[btKey]) {
        const snap = state;
        setTimeout(() => { if (room.state === snap) applyBotMoves(room); },
          900 + Math.floor(Math.random() * 700));
      }
    }
  });

  // ── Combat ────────────────────────────────────────────────────────────────
  socket.on('declare_attacks', attacks => {
    const room=rooms.get(socket.data.roomId);
    if (!room?.state) return;
    const {state}=room, {team}=socket.data;
    if (!['blue','red'].includes(team)) return;   // facilitador não declara ataques
    if (state.phase!=='combat') { socket.emit('action_error','Não é a fase de combate.'); return; }
    gameLogger.logAttacks(room.id, state.turn, state.period, team, attacks, state, 'human');
    if (team==='blue') state.blueAttacks=attacks||[]; else state.redAttacks=attacks||[];
    state.log.unshift(`${team==='blue'?'Força Azul':'Força Vermelha'} confirmou ${(attacks||[]).length} ataque(s).`);
    // Solo: bot declara ataques imediatamente após o humano
    if (room.solo) {
      const btAtkKey = room.botTeam === 'blue' ? 'blueAttacks' : 'redAttacks';
      if (state[btAtkKey] === null) {
        const botAtks = computeBotAttacks(state, room.botTeam);
        gameLogger.logAttacks(room.id, state.turn, state.period, room.botTeam, botAtks, state, BOT_AGENT);
        state[btAtkKey] = botAtks;
        const botLabel = room.botTeam === 'blue' ? 'Força Azul (BOT)' : 'Força Vermelha (BOT)';
        state.log.unshift(`${botLabel} confirmou ${botAtks.length} ataque(s).`);
      }
    }
    if (state.blueAttacks!==null && state.redAttacks!==null) {
      state.log.unshift('── Resolução de Combate ──');
      if (state.fac) {
        // SP antes do combate — base da ratificação pelo facilitador.
        state.fac.combatHpSnapshot = Object.fromEntries(state.units.map(u => [u.id, u.hp]));
        state.fac.combatReport = [];
      }
      state.combatQueue            = buildCombatQueue(state);
      state.currentEngagementIndex = 0;
      state.battleRoundDecisions   = { blue: null, red: null };
      broadcast(room); // show "confirmed" status to both before first engagement
      if (state.combatQueue.length === 0) {
        finishCombatPhase(room);
      } else {
        startCurrentEngagement(room);
      }
    } else {
      broadcast(room);
    }
  });

  socket.on('battle_round_decision', ({ decision }) => {
    const room=rooms.get(socket.data.roomId);
    if (!room?.state) return;
    const {state}=room, {team}=socket.data;
    if (!['blue','red'].includes(team)) return;   // facilitador só observa
    if (state.phase !== 'combat') return;
    state.battleRoundDecisions[team] = decision;
    if (room.solo) {
      const eng = state.combatQueue[state.currentEngagementIndex];
      state.battleRoundDecisions[room.botTeam] =
        eng ? botBattleRoundDecision(state, eng, room.botTeam, room.botDoctrine) : 'stop';
    }
    const { blue, red } = state.battleRoundDecisions;
    if (blue && red) processBattleRoundDecision(room);
  });

  // ══ Facilitador: comandos de arbitragem ═══════════════════════════════════
  // Só o facilitador da sala, e só com a partida em aberto. Recusas voltam
  // como 'action_error'; comandos aceitos entram no log e são retransmitidos.
  function facRoomOf(sock) {
    const room = rooms.get(sock.data.roomId);
    if (!room?.facilitated || !room.state || room.players.facilitator !== sock.id) return null;
    if (room.state.winner) return null;
    return room;
  }
  const facLog = (room, action, details) =>
    gameLogger.logFacilitator(room.id, room.state.turn, room.state.period, action, details);
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  // Nomes de unidade são exibidos via innerHTML nos clientes (tooltip, log,
  // listas) — o que o facilitador digita não pode carregar marcação.
  const cleanName = v => (typeof v === 'string' ? v.replace(/[<>&"'`]/g, '').trim().slice(0, 40) : '');
  // Durante a resolução dos engajamentos o tabuleiro fica congelado.
  const facBusy = state => state.phase === 'combat' && state.combatQueue.length > 0;

  socket.on('fac_start_game', () => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (state.phase !== 'setup') { socket.emit('action_error','A partida já começou.'); return; }
    if (!room.players.blue || !room.players.red) {
      socket.emit('action_error','Faltam jogadores: é preciso Azul e Vermelho ocupados.'); return;
    }
    state.phase = 'movement';
    for (const u of state.units) u.baseHex = { col: u.col, row: u.row };
    saveMovementSnapshot(state);
    state.log = ['Fase de Movimentação iniciada.',
                 '──── Turno 1 · Período Diurno ────',
                 '▶ Partida liberada pelo facilitador.'];
    gameLogger.logStart(room.id, state, { facilitated: true });
    broadcast(room);
  });

  socket.on('fac_move_unit', ({ unitId, col, row } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (facBusy(state)) { socket.emit('action_error','Aguarde o fim da resolução do combate.'); return; }
    const unit = state.units.find(u => u.id === unitId && u.hp > 0);
    if (!unit) { socket.emit('action_error','Unidade inválida.'); return; }
    col = Number(col); row = Number(row);
    if (!canPlaceAt(unit, col, row)) {
      socket.emit('action_error',`${unit.name}: terreno intransponível em ${hexName(col, row)}.`); return;
    }
    placeUnit(state, unit, col, row);
    const pm = state.fac.pendingMoves.find(m => m.unitId === unit.id);
    if (pm) pm.to = { col, row };
    state.log.unshift(`⚖ ${unit.name}(${TEAM_PT[unit.team]}) reposicionado em ${hexName(col, row)}.`);
    facLog(room, 'move_unit', { unitId, col, row });
    broadcast(room);
  });

  // Nega um movimento: a unidade volta para onde estava no início do período.
  socket.on('fac_deny_move', ({ unitId } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (state.phase !== 'movement_approval') { socket.emit('action_error','Não é a fase de autorização de movimentos.'); return; }
    const pm   = state.fac.pendingMoves.find(m => m.unitId === unitId);
    const unit = state.units.find(u => u.id === unitId && u.hp > 0);
    if (!pm || !unit) { socket.emit('action_error','Movimento inválido.'); return; }
    placeUnit(state, unit, pm.from.col, pm.from.row);
    pm.to = { ...pm.from }; pm.denied = true;
    state.log.unshift(`⚖ Movimento de ${unit.name}(${TEAM_PT[unit.team]}) negado.`);
    facLog(room, 'deny_move', { unitId });
    broadcast(room);
  });

  socket.on('fac_approve_movements', () => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (state.phase !== 'movement_approval') { socket.emit('action_error','Não é a fase de autorização de movimentos.'); return; }
    state.phase = 'combat';
    state.log.unshift('⚖ Movimentos autorizados pelo facilitador.');
    state.log.unshift('Fase de Combate iniciada. Declare seus ataques.');
    facLog(room, 'approve_movements', { denied: state.fac.pendingMoves.filter(m => m.denied).map(m => m.unitId) });
    broadcast(room);
  });

  // Ratifica o resultado do combate, com os ajustes de SP que o facilitador
  // julgar necessários (restaurar uma unidade, agravar um dano...).
  socket.on('fac_ratify_combat', ({ hpChanges } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (state.phase !== 'combat_approval') { socket.emit('action_error','Não é a fase de ratificação do combate.'); return; }
    const applied = [];
    for (const { unitId, hp } of (Array.isArray(hpChanges) ? hpChanges : [])) {
      const unit = state.units.find(u => u.id === unitId && u.team !== NEUTRAL_TEAM);
      if (!unit) continue;
      const before = unit.hp;
      const after  = clampInt(hp, 0, unit.maxHp);
      if (after === before) continue;
      unit.hp = after;
      if (after === 0) destroyWithCargo(state, unit);
      state.log.unshift(`⚖ ${unit.name}(${TEAM_PT[unit.team]}): SP ajustado ${before} → ${after}.`);
      applied.push({ unitId, from: before, to: after });
    }
    state.log.unshift('⚖ Combate ratificado pelo facilitador.');
    facLog(room, 'ratify_combat', { hpChanges: applied });
    state.fac.combatReport = [];
    state.fac.combatHpSnapshot = {};
    concludeTurn(room);
  });

  // Ajusta quantidades de uma unidade: SP, movimento, munição, nome. Na
  // configuração inicial o valor novo vira o "cheio" da unidade.
  socket.on('fac_edit_unit', ({ unitId, changes } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (facBusy(state)) { socket.emit('action_error','Aguarde o fim da resolução do combate.'); return; }
    const unit = state.units.find(u => u.id === unitId && u.hp > 0);
    if (!unit) { socket.emit('action_error','Unidade inválida.'); return; }
    const c = changes || {};
    const inSetup = state.phase === 'setup';
    if (cleanName(c.name)) unit.name = cleanName(c.name);
    if (c.maxHp != null) {
      unit.maxHp = clampInt(c.maxHp, 1, 99);
      unit.hp    = inSetup ? unit.maxHp : Math.min(unit.hp, unit.maxHp);
    }
    if (c.hp != null && !inSetup) {
      unit.hp = clampInt(c.hp, 0, unit.maxHp);
      if (unit.hp === 0) destroyWithCargo(state, unit);
    }
    if (c.movement != null) {
      unit.movement = unit.initMovement = clampInt(c.movement, 0, 20);
      if (unit.fuel?.fuelType === 'air') {
        unit.fuel.max = unit.initFuelMax = unit.movement * 2;
        if (inSetup || unit.fuel.current > unit.fuel.max) unit.fuel.current = unit.fuel.max;
      }
    }
    if (c.weapons && typeof c.weapons === 'object') {
      for (const [k, q] of Object.entries(c.weapons)) {
        if (!unit.weapons[k]) continue;
        const qty = clampInt(q, 0, 99);
        unit.weapons[k].quantity = qty;
        if (inSetup || qty > (unit.initWeapons[k]?.quantity ?? 0)) {
          unit.initWeapons[k] = { ...unit.weapons[k] };
        }
      }
    }
    state.log.unshift(`⚖ ${unit.name}(${TEAM_PT[unit.team]}) ajustado pelo facilitador.`);
    facLog(room, 'edit_unit', { unitId, changes: c });
    broadcast(room);
  });

  // Duplica uma unidade (aumenta a quantidade daquele meio na força).
  socket.on('fac_clone_unit', ({ unitId } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (facBusy(state)) { socket.emit('action_error','Aguarde o fim da resolução do combate.'); return; }
    const src = state.units.find(u => u.id === unitId && u.hp > 0);
    if (!src) { socket.emit('action_error','Unidade inválida.'); return; }
    const n    = ++state.fac.cloneSeq;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id    = `${src.id}-F${n}`;
    copy.name  = `${src.name} (${state.units.filter(u => u.id === src.id || u.id.startsWith(`${src.id}-F`)).length + 1})`;
    copy.hp    = copy.maxHp;
    copy.moved = false;
    copy.movement       = copy.initMovement;
    copy.detectionRange = JSON.parse(JSON.stringify(copy.initDetectionRange || copy.detectionRange));
    copy.capabilities   = JSON.parse(JSON.stringify(copy.initCapabilities   || copy.capabilities));
    copy.weapons        = JSON.parse(JSON.stringify(copy.initWeapons        || {}));
    if (copy.fuel?.usesFuel) copy.fuel.current = copy.fuel.max;
    if (copy.category === 'air') { copy.airStatus = 'ready'; if (copy.fuel) copy.fuel.wasAtRefuelLocation = false; }
    state.units.push(copy);
    state.movementSnapshot[copy.id] = { col: copy.col, row: copy.row };
    state.log.unshift(`⚖ ${copy.name}(${TEAM_PT[copy.team]}) adicionado à ordem de batalha.`);
    facLog(room, 'clone_unit', { unitId, newId: copy.id });
    broadcast(room);
  });

  // Retira uma unidade (e o que ela transporta). Na configuração ela some da
  // ordem de batalha; com a partida em andamento, conta como perdida.
  socket.on('fac_remove_unit', ({ unitId } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (facBusy(state)) { socket.emit('action_error','Aguarde o fim da resolução do combate.'); return; }
    const unit = state.units.find(u => u.id === unitId && u.hp > 0);
    if (!unit) { socket.emit('action_error','Unidade inválida.'); return; }
    if (state.phase === 'setup') {
      const gone = new Set([unit.id, ...state.units
        .filter(u => u.baseUnitId === unit.id || u.hostId === unit.id).map(u => u.id)]);
      state.units = state.units.filter(u => !gone.has(u.id));
      for (const id of gone) delete state.movementSnapshot[id];
    } else {
      destroyWithCargo(state, unit);
    }
    state.fac.pendingMoves = state.fac.pendingMoves.filter(m => m.unitId !== unit.id);
    state.log.unshift(`⚖ ${unit.name}(${TEAM_PT[unit.team]}) retirado pelo facilitador.`);
    facLog(room, 'remove_unit', { unitId });
    broadcast(room);
  });

  socket.on('fac_add_neutral', ({ template, name, col, row } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (facBusy(state)) { socket.emit('action_error','Aguarde o fim da resolução do combate.'); return; }
    const tpl = NEUTRAL_TEMPLATES[template];
    if (!tpl) { socket.emit('action_error','Tipo de unidade neutra inválido.'); return; }
    col = Number(col); row = Number(row);
    if (!canPlaceAt({ category: tpl.category }, col, row)) {
      socket.emit('action_error',`${tpl.name}: terreno intransponível em ${hexName(col, row)}.`); return;
    }
    const n    = ++state.fac.neutralSeq;
    const nm   = cleanName(name) || `${tpl.name} ${n}`;
    const unit = makeNeutralUnit(`NEU-${n}`, tpl, nm, col, row);
    state.units.push(unit);
    state.movementSnapshot[unit.id] = { col, row };
    state.log.unshift(`⚖ Contato neutro ${unit.name} inserido em ${hexName(col, row)}.`);
    facLog(room, 'add_neutral', { template, id: unit.id, col, row });
    broadcast(room);
  });

  // Regra de vitória do cenário — escolha do facilitador, só na configuração.
  // Depois que a partida começa, mudar o critério de vitória no meio do jogo
  // seria mudar o jogo sob os pés dos jogadores.
  socket.on('fac_set_victory_rule', ({ rule } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    if (state.phase !== 'setup') { socket.emit('action_error','A regra de vitória só muda na configuração.'); return; }
    if (!VICTORY_RULES.includes(rule)) { socket.emit('action_error','Regra de vitória inválida.'); return; }
    state.victoryRule = rule;
    const nome = rule === 'exhaustion' ? 'exaustão ofensiva' : 'objetivos do cenário';
    state.log.unshift(`⚖ Regra de vitória do cenário: ${nome}.`);
    facLog(room, 'set_victory_rule', { rule });
    broadcast(room);
  });

  socket.on('fac_message', ({ to, text } = {}) => {
    const room = facRoomOf(socket); if (!room) return;
    const state = room.state;
    const body = typeof text === 'string' ? text.trim().slice(0, 300) : '';
    if (!body || !['all', 'blue', 'red'].includes(to)) return;
    const msg = { id: `MSG-${state.messages.length + 1}`, to, text: body,
                  turn: state.turn, period: state.period, ts: new Date().toISOString() };
    state.messages.push(msg);
    for (const team of ['blue', 'red']) {
      if ((to === 'all' || to === team) && room.players[team]) io.to(room.players[team]).emit('facilitator_message', msg);
    }
    facLog(room, 'message', { to, text: body });
    broadcast(room);
  });

  socket.on('restart', () => {
    const room=rooms.get(socket.data.roomId);
    if (!room) return;
    if (room.state && !room.state.winner && room.state.phase !== 'setup') {
      const obj = computeObjectives(room.state);
      gameLogger.logGameOver(room.id, room.state.turn, null, 'restart', obj, room.state);
    }
    // Com facilitador, só ele reinicia — e a sala volta para a configuração.
    if (room.facilitated) {
      if (socket.data.team !== 'facilitator') return;
      room.state = newFacilitatedGame();
      socket.emit('game_start', { team: 'facilitator', state: facView(room), roomId: room.id, facilitated: true,
                                  rejoinToken: room.rejoinTokens.facilitator });
      for (const seat of ['blue','red']) {
        if (room.players[seat]) {
          io.to(room.players[seat]).emit('game_start', { team: seat, state: stateFor(room.state, seat),
                                                         roomId: room.id, facilitated: true,
                                                         rejoinToken: room.rejoinTokens[seat] });
        }
      }
      broadcast(room);
      return;
    }
    room.state = room.solo ? novaPartidaSolo(room) : newGame();
    gameLogger.logStart(room.id, room.state, { solo: !!room.solo, botTeam: room.botTeam ?? null,
                                               botDoctrine: room.botDoctrine ?? null,
                                               capabilityFactors: room.capabilityFactors ?? null,
                                               redComposition: room.redComposition ?? null,
                                               obId: room.obId ?? 'padrao' });
    if (room.players.blue) io.to(room.players.blue).emit('game_start',{team:'blue',state:stateFor(room.state,'blue'),solo:!!room.solo,roomId:room.id,rejoinToken:room.rejoinTokens?.blue});
    if (room.players.red)  io.to(room.players.red ).emit('game_start',{team:'red', state:stateFor(room.state,'red'), solo:!!room.solo,roomId:room.id,rejoinToken:room.rejoinTokens?.red});
  });

  socket.on('abandon_game', () => {
    const room=rooms.get(socket.data.roomId); if (!room?.state) return;
    if (room.state.winner) return;
    const myTeam    = socket.data.team;
    // O facilitador não abandona em nome de ninguém; ele encerra reiniciando.
    if (!['blue','red'].includes(myTeam)) return;
    const otherTeam = myTeam === 'blue' ? 'red' : 'blue';
    room.state.winner = otherTeam;
    const label = myTeam === 'blue' ? 'Força Azul' : 'Força Vermelha';
    room.state.log.unshift(`🏳 ${label} abandonou o jogo. ${otherTeam === 'blue' ? 'Força Azul' : 'Força Vermelha'} vence por W.O.`);
    const obj = computeObjectives(room.state);
    gameLogger.logGameOver(room.id, room.state.turn, otherTeam, 'abandon', obj, room.state);
    emitGameOver(room, { winner: otherTeam, objectives: obj, reason: 'abandon' });
    if (room.graceTimer) { clearTimeout(room.graceTimer); room.graceTimer = null; }
  });

  socket.on('disconnect', () => {
    const {roomId,team}=socket.data; if (!roomId) return;
    const room=rooms.get(roomId); if (!room) return;
    if (room.players[team] !== socket.id) return; // assento já reocupado por rejoin

    // ── Sala com facilitador ────────────────────────────────────────────────
    // O assento vaga e os demais são avisados de QUAL papel caiu. A sala só
    // entra em contagem regressiva quando a ausência de fato trava a partida
    // (ver facNeedsGrace): sem o facilitador sempre; sem um jogador, só
    // depois que a partida começou.
    if (room.facilitated) {
      room.players[team] = null;
      if (!room.state || room.state.winner) {
        if (room.graceTimer) clearTimeout(room.graceTimer);
        rooms.delete(roomId);
        return;
      }
      const grace = facNeedsGrace(room);
      for (const pid of Object.values(room.players)) {
        if (pid) io.to(pid).emit('participant_disconnected',
          { role: team, grace, seconds: Math.round(REJOIN_GRACE_MS / 1000) });
      }
      if (room.graceTimer) clearTimeout(room.graceTimer);
      room.graceTimer = grace
        ? setTimeout(() => endRoomByDisconnect(roomId), REJOIN_GRACE_MS)
        : null;
      broadcast(room);
      return;
    }

    // Sem partida em andamento (lobby) ou já encerrada: encerra na hora
    if (!room.state || room.state.winner) {
      const other=team==='blue'?room.players.red:room.players.blue;
      if (other) io.to(other).emit('opponent_disconnected', { grace: false });
      if (room.graceTimer) clearTimeout(room.graceTimer);
      rooms.delete(roomId);
      return;
    }

    // Partida em andamento: abre período de graça para reconexão
    room.players[team] = null;
    const other=team==='blue'?room.players.red:room.players.blue;
    if (other) io.to(other).emit('opponent_disconnected',
      { grace: true, seconds: Math.round(REJOIN_GRACE_MS / 1000) });
    if (room.graceTimer) clearTimeout(room.graceTimer);
    room.graceTimer = setTimeout(() => endRoomByDisconnect(roomId), REJOIN_GRACE_MS);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Servidor em http://localhost:${PORT}`));
}

// Exported for tests (combat internals). Importing the module does not start
// the HTTP/Socket.IO listener thanks to the require.main guard above.
module.exports = {
  newGame, newFacilitatedGame, buildCombatQueue, defendingGroup, stateFor,
  NEUTRAL_TEAM, NEUTRAL_TEMPLATES, makeNeutralUnit,
  placeUnit, attachedUnits, destroyWithCargo, canPlaceAt, hexName,
  resolveBattleRound, resolveCounterAttacks,
  computeObjectives, OBJECTIVE_IDS, OBJECTIVE_THRESHOLDS, objectiveProgress,
  WEAPON_PRIORITY, BOT_TUNING,
  DOCTRINE_DEFAULT, POSTURE_TUNING, resolveBotTuning, resolveDoctrineChoice,
  computeBotMoves, computeBotAttacks, applyBotMovesToState,
  botObjectiveWeights, botPickTarget, botNeedsRefuel, botRefuelProvider,
  botMoveToward, botMoveAway, botBattleRoundDecision,
  nextTurn, checkWinner, MAX_TURNS,
};

// A simulação construtiva joga sobre esta mesma máquina de estados — é o que
// mantém a plataforma unificada. Injetado aqui, depois dos exports, porque o
// módulo é requerido lá em cima (evita o ciclo).
constructiveSim.useEngine(module.exports);
