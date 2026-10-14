'use strict';

/**
 * board.js — Tabuleiro e tipos de plataforma, compartilhados pelo servidor e
 * pelo validador de ordens de batalha carregadas de planilha.
 *
 * Saíram de server.js sem mudança: o validador (shared/scenario.js) precisa
 * recusar uma unidade posta em terreno impossível e uma composição de tipo
 * desconhecido, e nada em shared/ pode requerer server.js.
 */

// Grade 28×20 (A–AB × 1–20), hexágonos odd-q — carta OAS-MAP-001 Ed. 2.0
// (13°S–34°S), espelho de public/js/terrain.js. Gerada por
// scripts/mapa_oas_map_001.py: nas colunas G–Z, linhas 6–15 (a área da carta
// anterior, 20×10, deslocada de +6 colunas e +5 linhas) o terreno é o do jogo
// base, inalterado; fora dela vem da própria carta.
const GRID_W = 28;
const GRID_H = 20;

const T_LAND = 0, T_SHALLOW = 1, T_SHELF = 2, T_DEEP = 3, T_OIL = 4;
const TERRAIN_MAP = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  1  ~14°S  Salvador/BA
  [0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  2  ~15°S  Ilhéus
  [0,0,0,0,0,0,0,0,0,0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  3  ~16°S
  [0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  4  ~17°S  Porto Seguro
  [0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  5  ~18°S  Abrolhos
  [0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  6  ~19°S
  [0,0,0,0,0,0,0,0,0,0,0,1,1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  7  ~20°S  Vitória/ES
  [0,0,0,0,0,0,0,0,0,0,1,1,2,4,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  8  ~21°S
  [0,0,0,0,0,0,0,0,0,1,1,2,4,4,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  //  9  ~22°S  ★PLT-04/05 · Açu
  [0,0,0,0,0,0,0,0,1,1,2,4,4,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 10  ~23°S  Rio de Janeiro
  [0,0,0,0,0,0,0,1,1,2,4,4,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 11  ~24°S  ★PLT-02/03 · Santos
  [0,0,0,0,0,1,1,2,2,4,4,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 12  ~25°S  ★PLT-01
  [0,0,0,0,1,2,2,2,2,4,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 13  ~26°S  Paranaguá
  [0,0,0,0,1,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 14  ~27°S  Itajaí
  [0,0,0,0,1,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 15  ~28°S  Imbituba
  [0,0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 16  ~29°S
  [0,0,0,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 17  ~30°S  Porto Alegre
  [0,0,0,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 18  ~31°S
  [0,1,1,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 19  ~32°S  Rio Grande
  [0,1,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],  // 20  ~33°S
];
const TERRAIN_NAMES = {
  [T_LAND]: 'terra', [T_SHALLOW]: 'águas rasas', [T_SHELF]: 'plataforma continental',
  [T_DEEP]: 'águas profundas', [T_OIL]: 'bacia petrolífera',
};

// Letra da coluna, como na carta: A…Z, AA, AB (espelho de hexLabel em
// public/js/hex.js).
function colLetra(col) {
  return col < 26 ? String.fromCharCode(65 + col)
                  : colLetra(Math.floor(col / 26) - 1) + String.fromCharCode(65 + col % 26);
}

function getTerrain(col, row) {
  if (row < 0 || row >= GRID_H || col < 0 || col >= GRID_W) return T_LAND;
  return TERRAIN_MAP[row][col];
}
function canEnterTerrain(category, terrain) {
  if (category === 'air' || category === 'specops') return true;
  if (category === 'land')      return terrain === T_LAND || terrain === T_SHALLOW;
  if (category === 'submarine') return terrain !== T_LAND && terrain !== T_SHALLOW;
  return terrain !== T_LAND; // surface
}

// Tipo de composição (o 1º item de `composition`) → tipo de plataforma exibido.
// O tipo dirige o comportamento do bot (botIsCombatant, botGenericPrio) e o
// modelo de combustível — é por isso que a ordem da composição importa.
const COMP_DISPLAY_TYPE = {
  'operacoes_especiais':   'specops',
  'navio_aeródromo':       'carrier',
  'navio_doca':            'amphib',
  'navio_desembarque':     'amphib',
  'fragata':               'fragata',
  'corveta':               'corveta',
  'destroier':             'destroier',
  'destroyer':             'destroier',
  'cruzador':              'cruzador',
  'navio_patoc':           'patrulha_oc',
  'navio_patrulha':        'patrulha_c',
  'navio_logistico':       'logistico',
  'navio_tanque':          'tanque',
  'submarino_nuclear':     'sub_nuclear',
  'submarino_convencional':'submarino',
  'patrulha_maritima':     'patrulha',
  'caca':                  'caca',
  'ataque':                'ataque',
  'aew':                   'aew',
  'helicoptero_ASW':       'helicoptero',
  'helicoptero_ASup':      'helicoptero',
  'bateria_costeira':      'bateria_costeira',
  'bateria_ada':           'bateria_ada',
  'base_naval':            'bateria_ada',
  'plataforma':            'fpso',
  'porto':                 'porto',
  'aeroporto':             'aeroporto',
};
const DISPLAY_TYPE_FALLBACK = { surface: 'fragata', submarine: 'submarino', air: 'patrulha', land: 'corveta', specops: 'specops' };

module.exports = {
  GRID_W, GRID_H,
  T_LAND, T_SHALLOW, T_SHELF, T_DEEP, T_OIL,
  TERRAIN_MAP, TERRAIN_NAMES, colLetra, getTerrain, canEnterTerrain,
  COMP_DISPLAY_TYPE, DISPLAY_TYPE_FALLBACK,
};
