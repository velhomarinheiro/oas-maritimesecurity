'use strict';

// ─── Terrain type constants ──────────────────────────────────────────────────
const T_LAND    = 0;  // Área Terrestre       — impassável
const T_SHALLOW = 1;  // Águas Rasas <200m    — sem submarinos
const T_SHELF   = 2;  // Plataforma Continental
const T_DEEP    = 3;  // Águas Profundas      — subs ganham furtividade
const T_OIL     = 4;  // Bacia Petrolífera    — objetivo estratégico

// ─── Terrain map 28 × 20 — flat-top hexagons, odd-q offset ─────────────────
//  Carta OAS-MAP-001 Ed. 2.0 (13°S–34°S, 54°W–22°W); espelho de shared/board.js.
//  Col: O → L  (A=interior, AB=Atlântico aberto, a leste de Trindade)
//  Row: N → S  (1≈14°S/Salvador, 20≈33°S/sul de Rio Grande)
//
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

// ─── Grid border per terrain ─────────────────────────────────────────────────
const T_BORDER = {
  [T_LAND]:    'rgba(140,100,40, 0.50)',
  [T_SHALLOW]: 'rgba(80,190,220, 0.35)',
  [T_SHELF]:   'rgba(50,140,200, 0.28)',
  [T_DEEP]:    'rgba(40,100,180, 0.20)',
  [T_OIL]:     'rgba(210,140,30, 0.55)',
};

// ─── Terrain names ────────────────────────────────────────────────────────────
const T_NAME = {
  [T_LAND]:    'Área Terrestre',
  [T_SHALLOW]: 'Águas Rasas (<200m)',
  [T_SHELF]:   'Plataforma Continental',
  [T_DEEP]:    'Águas Profundas',
  [T_OIL]:     'Bacia Petrolífera ★',
};

// ─── Infrastructure markers (posições visuais no mapa) ───────────────────────
// Hexágonos onde a carta OAS-MAP-001 imprime cada símbolo
// (scripts/mapa_oas_map_001.py, tabela INFRA_CARTA).
const INFRA = [
  { col: 12, row: 0,  type: 'port',  label: '⚓', name: 'Porto de Salvador'      },
  { col: 11, row: 6,  type: 'port',  label: '⚓', name: 'Vitória / Tubarão'      },
  { col: 10, row: 8,  type: 'port',  label: '⚓', name: 'Porto do Açu'           },
  { col: 9,  row: 9,  type: 'naval', label: '✛', name: 'BN Rio de Janeiro'      },
  { col: 8,  row: 9,  type: 'port',  label: '⚓', name: 'Porto do Rio'           },
  { col: 7,  row: 8,  type: 'aero',  label: '✈', name: 'BA Santa Cruz / Galeão' },
  { col: 6,  row: 10, type: 'port',  label: '⚓', name: 'Porto de Santos'        },
  { col: 1,  row: 18, type: 'port',  label: '⚓', name: 'Porto do Rio Grande'    },
  { col: 12, row: 8,  type: 'oil',   label: '▲', name: 'PLT-05'                 },
  { col: 11, row: 8,  type: 'oil',   label: '▲', name: 'PLT-04'                 },
  { col: 10, row: 10, type: 'oil',   label: '▲', name: 'PLT-03'                 },
  { col: 7,  row: 10, type: 'oil',   label: '▲', name: 'PLT-02'                 },
  { col: 8,  row: 11, type: 'oil',   label: '▲', name: 'PLT-01'                 },
];

// ─── Movement rules ───────────────────────────────────────────────────────────
function canEnterTerrain(unitTypeOrCategory, terrain) {
  if (unitTypeOrCategory === 'air' || unitTypeOrCategory === 'helicoptero' || unitTypeOrCategory === 'patrulha' || unitTypeOrCategory === 'specops')
    return true;
  if (unitTypeOrCategory === 'land')
    return terrain === T_LAND || terrain === T_SHALLOW;
  if (unitTypeOrCategory === 'submarine' || unitTypeOrCategory === 'submarino')
    return terrain !== T_LAND && terrain !== T_SHALLOW;
  return terrain !== T_LAND; // surface
}
