'use strict';

// ═════════════════════════════════════════════════════════════════════════════
// HEX GRID — MAPA "OPERAÇÃO ATLÂNTICO SUL"
// Grade calibrada para coincidir com mapa.jpeg
// Flat-top hexagons (topo reto)
// ═════════════════════════════════════════════════════════════════════════════

const GRID_W = 28; // A–AB
const GRID_H = 20; // 1–20

// ─── Geometria da grade ────────────────────────────────────────────────────
// Medida na grade impressa na carta OAS-MAP-001 Ed. 2.0 (1900×1521 px;
// ajuste por mínimos quadrados em scripts/mapa_oas_map_001.py): raio de
// 38,64 px, passo de 57,96 px entre colunas e 66,93 px de altura.
const HEX_R = 38.64;
const HEX_W = HEX_R * 2;
const HEX_H = HEX_R * Math.sqrt(3);

// ─── Canvas: imagem 1900×1521 exibida a 100% ──────────────────────────────
// A carta é desenhada esticada para CVS_W×CVS_H; uma exportação de maior
// resolução da mesma carta pode substituir mapa.jpeg sem mudar nada aqui.
const CVS_W = 1900;
const CVS_H = 1521;

// ─── Origem da grade sobre o mapa ──────────────────────────────────────────
// Centro do hexágono A-1
const OX = 67.25;
const OY = 108.25;

// ═════════════════════════════════════════════════════════════════════════════
// CONVERSÕES
// ═════════════════════════════════════════════════════════════════════════════

function oddqToCube(col, row) {
  const x = col;
  const z = row - (col - (col & 1)) / 2;

  return {
    x,
    y: -x - z,
    z
  };
}

function cubeToOddq(x, z) {
  return {
    col: x,
    row: z + (x - (x & 1)) / 2
  };
}

const CUBE_DIRS = [
  { dx:+1, dy:-1, dz: 0 },
  { dx:+1, dy: 0, dz:-1 },
  { dx: 0, dy:+1, dz:-1 },
  { dx:-1, dy:+1, dz: 0 },
  { dx:-1, dy: 0, dz:+1 },
  { dx: 0, dy:-1, dz:+1 },
];

function hexNeighbors(col, row) {
  const c = oddqToCube(col, row);

  return CUBE_DIRS
    .map(d => cubeToOddq(c.x + d.dx, c.z + d.dz))
    .filter(({ col:nc, row:nr }) =>
      nc >= 0 &&
      nc < GRID_W &&
      nr >= 0 &&
      nr < GRID_H
    );
}

function hexDist(c1, r1, c2, r2) {
  const a = oddqToCube(c1, r1);
  const b = oddqToCube(c2, r2);

  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.z - b.z)
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PIXEL ↔ HEX
// ═════════════════════════════════════════════════════════════════════════════

function hexToPixel(col, row) {
  return {
    x: HEX_R * 1.5 * col + OX,
    y: HEX_H * (row + 0.5 * (col & 1)) + OY,
  };
}

function pixelToHex(px, py) {

  const approxCol =
    Math.round((px - OX) / (HEX_R * 1.5));

  const approxRow =
    Math.round(
      (py - OY - 0.5 * (approxCol & 1) * HEX_H) / HEX_H
    );

  const base = {
    col: Math.max(0, Math.min(GRID_W - 1, approxCol)),
    row: Math.max(0, Math.min(GRID_H - 1, approxRow)),
  };

  const candidates = [
    base,
    ...hexNeighbors(base.col, base.row)
  ];

  let best = base;
  let bestD = Infinity;

  for (const cand of candidates) {

    const { x, y } = hexToPixel(cand.col, cand.row);

    const d =
      (px - x) ** 2 +
      (py - y) ** 2;

    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }

  return best;
}

// ═════════════════════════════════════════════════════════════════════════════
// RANGE
// ═════════════════════════════════════════════════════════════════════════════

function hexesInRange(col, row, range) {

  const seen = new Set([`${col},${row}`]);

  const out = [];

  let frontier = [{ col, row }];

  for (let d = 0; d < range; d++) {

    const next = [];

    for (const h of frontier) {

      for (const nb of hexNeighbors(h.col, h.row)) {

        const k = `${nb.col},${nb.row}`;

        if (!seen.has(k)) {

          seen.add(k);

          out.push(nb);

          next.push(nb);
        }
      }
    }

    frontier = next;
  }

  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
// DESENHO
// ═════════════════════════════════════════════════════════════════════════════

function drawHex(ctx, cx, cy, fill, stroke, lw = 1) {

  ctx.beginPath();

  for (let i = 0; i < 6; i++) {

    const a = (Math.PI / 3) * i;

    const vx = cx + HEX_R * Math.cos(a);

    const vy = cy + HEX_R * Math.sin(a);

    if (i === 0) {
      ctx.moveTo(vx, vy);
    } else {
      ctx.lineTo(vx, vy);
    }
  }

  ctx.closePath();

  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// A…Z, AA, AB… (como na carta)
function hexLabel(col) {
  return col < 26 ? String.fromCharCode(65 + col)
                  : hexLabel(Math.floor(col / 26) - 1) + String.fromCharCode(65 + col % 26);
}
