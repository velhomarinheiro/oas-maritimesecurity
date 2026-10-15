'use strict';

/**
 * replay_board.js — Camadas de desenho do tabuleiro, para o visualizador.
 * =======================================================================
 *
 * CÓPIA DELIBERADA de public/js/client.js (linhas 1891-2118). Manter em
 * sincronia quando o desenho do jogo mudar.
 *
 * Por que copiar em vez de importar: client.js resolve ~45 elementos do DOM e
 * abre um socket em escopo de módulo (`const ctx = canvas.getContext('2d')` na
 * linha 8, `const socket = io()` na 432). Carregá-lo aqui exigiria o DOM
 * inteiro de game.html e uma conexão que o replay não usa. Extrair as camadas
 * para um módulo comum seria uma cirurgia de ~250 linhas no arquivo central do
 * jogo, que não tem teste de renderização cobrindo — risco desproporcional ao
 * benefício. O arquivo separado mantém a fronteira "copiado de client.js"
 * visível, para uma unificação futura.
 *
 * O que MUDA em relação ao original: `drawUnits` perde os dois blocos de
 * unidades-fantasma (client.js:2023-2054), que desenham destinos planejados
 * por um jogador humano — num replay o movimento já aconteceu.
 *
 * Depende de hex.js (HEX_R, GRID_W/H, OX/OY, hexToPixel, drawHex, hexLabel),
 * terrain.js (TERRAIN_MAP, T_BORDER, INFRA) e units.js (drawUnitCounter), que
 * são carregados antes e usados sem alteração.
 */

const RP = {
  ctx:      null,
  unidades: [],      // [{id, team, type, col, row, hp, maxHp, ...}] do quadro atual
  mapa:     null,    // Image de /mapa.jpeg
  mapaOk:   false,
  rotas:    [],      // [{path:[{col,row}], team}] — rotas do passo de movimento
  foco:     [],      // [{col,row}] — hexes em destaque
  disparos: [],      // [{de:{col,row}, para:{col,row}, acertou, destruiu}]
  zoom:     1,
  panX:     0,
  panY:     0,
};

function rpInit(canvas) {
  canvas.width  = CVS_W;
  canvas.height = CVS_H;
  RP.ctx = canvas.getContext('2d');
  RP.mapa = new Image();
  RP.mapa.onload  = () => { RP.mapaOk = true;  rpRender(); };
  RP.mapa.onerror = () => { RP.mapaOk = false; rpRender(); };
  RP.mapa.src = '/mapa.jpeg';
}

function rpRender() {
  const ctx = RP.ctx;
  if (!ctx) return;
  ctx.clearRect(0, 0, CVS_W, CVS_H);
  ctx.save();
  ctx.translate(RP.panX, RP.panY);
  ctx.scale(RP.zoom, RP.zoom);

  rpBackground(ctx);
  rpRotas(ctx);
  rpGrid(ctx);
  rpFoco(ctx);
  rpInfra(ctx);
  rpUnits(ctx);
  rpDisparos(ctx);
  rpCoordLabels(ctx);

  ctx.restore();
}

// ── Fundo (client.js:1891) ───────────────────────────────────────────────────
function rpBackground(ctx) {
  if (RP.mapaOk) {
    ctx.drawImage(RP.mapa, 0, 0, CVS_W, CVS_H);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, CVS_W, CVS_H);
  g.addColorStop(0.0, '#0d2a45');
  g.addColorStop(0.2, '#0a2238');
  g.addColorStop(1.0, '#071520');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CVS_W, CVS_H);
}

// ── Grade (client.js:1988) ───────────────────────────────────────────────────
function rpGrid(ctx) {
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const { x, y } = hexToPixel(c, r);
      drawHex(ctx, x, y, null, T_BORDER[TERRAIN_MAP[r][c]], 0.8);
    }
  }
}

// ── Infraestrutura (client.js:1999) ──────────────────────────────────────────
const RP_INFRA_COLORS = { naval: '#82b1ff', port: '#80cbc4', aero: '#b0bec5', oil: '#ffcc02' };

function rpInfra(ctx) {
  for (const inf of INFRA) {
    const { x, y } = hexToPixel(inf.col, inf.row);
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 4;
    ctx.fillStyle   = RP_INFRA_COLORS[inf.type] || '#fff';
    ctx.font        = `bold ${Math.round(HEX_R * 0.38)}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(inf.label, x, y - HEX_R * 0.1);
    ctx.shadowBlur  = 0;
    ctx.fillStyle   = 'rgba(255,255,200,0.7)';
    ctx.font        = `${Math.round(HEX_R * 0.2)}px 'Courier New', monospace`;
    ctx.fillText(inf.name, x, y + HEX_R * 0.38);
  }
}

// ── Rótulos de coordenada (client.js:2098) ───────────────────────────────────
function rpCoordLabels(ctx) {
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur  = 3;
  ctx.fillStyle   = 'rgba(200,220,240,0.55)';
  ctx.font        = `${Math.round(HEX_R * 0.27)}px 'Courier New', monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'top';
  for (let c = 0; c < GRID_W; c++) ctx.fillText(hexLabel(c), hexToPixel(c, 0).x, OY / 2 - 6);
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < GRID_H; r++) ctx.fillText(r + 1, OX - 6, hexToPixel(0, r).y);
  ctx.shadowBlur = 0;
}

// ── Rotas do passo de movimento (adaptado de drawPathTrail, client.js:1966) ──
// A numeração dos hexes vem do original: é o que deixa visível a ORDEM do
// trajeto, não só o destino.
function rpRotas(ctx) {
  for (const { path, team } of RP.rotas) {
    if (!path || path.length < 2) continue;
    const azul = team === 'blue';
    const meio   = azul ? 'rgba(100,180,255,0.16)' : 'rgba(255,120,110,0.16)';
    const meioL  = azul ? 'rgba(100,180,255,0.50)' : 'rgba(255,120,110,0.50)';
    const fim    = azul ? 'rgba(100,180,255,0.34)' : 'rgba(255,120,110,0.34)';
    const fimL   = azul ? 'rgba(130,200,255,0.90)' : 'rgba(255,150,140,0.90)';
    for (let i = 1; i < path.length; i++) {
      const { x, y } = hexToPixel(path[i].col, path[i].row);
      const ultimo   = i === path.length - 1;
      drawHex(ctx, x, y, ultimo ? fim : meio, ultimo ? fimL : meioL, ultimo ? 2.2 : 1.6);
      ctx.save();
      ctx.fillStyle    = 'rgba(255,255,255,0.92)';
      ctx.font         = `bold ${Math.round(HEX_R * 0.30)}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor  = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur   = 3;
      ctx.fillText(String(i), x, y);
      ctx.restore();
    }
  }
}

// ── Hexes em foco ────────────────────────────────────────────────────────────
function rpFoco(ctx) {
  for (const h of RP.foco) {
    const { x, y } = hexToPixel(h.col, h.row);
    drawHex(ctx, x, y, null, 'rgba(255,213,79,0.95)', 3);
  }
}

// ── Unidades (client.js:2020, sem os blocos de fantasma 2023-2054) ───────────
function rpUnits(ctx) {
  for (const u of RP.unidades) {
    if ((u.hp ?? 0) <= 0) continue;
    const { x, y } = hexToPixel(u.col, u.row);
    ctx.beginPath();
    ctx.arc(x, y, HEX_R * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    drawUnitCounter(ctx, u, x, y, false);
  }

  // Selo de empilhamento: importa de verdade neste jogo, porque um grupo-tarefa
  // empilhado defende em conjunto (defendingGroup, server.js).
  const pilhas = {};
  for (const u of RP.unidades) {
    if ((u.hp ?? 0) <= 0) continue;
    const k = `${u.col},${u.row}`;
    (pilhas[k] = pilhas[k] || { col: u.col, row: u.row, n: 0 }).n++;
  }
  for (const { col, row, n } of Object.values(pilhas)) {
    if (n < 2) continue;
    const { x, y } = hexToPixel(col, row);
    const r  = HEX_R * 0.22;
    const bx = x + HEX_R * 0.38;
    const by = y - HEX_R * 0.38;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(255,200,0,0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth   = 1;
    ctx.stroke();
    ctx.fillStyle   = '#000';
    ctx.font        = `bold ${Math.round(r * 1.3)}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), bx, by);
  }
}

// ── Disparos do engajamento ──────────────────────────────────────────────────
// Redundância de canal: acerto e erro diferem em cor E em traço (cheio vs.
// pontilhado), e a destruição ganha um marcador próprio.
function rpDisparos(ctx) {
  for (const d of RP.disparos) {
    const a = hexToPixel(d.de.col, d.de.row);
    const b = hexToPixel(d.para.col, d.para.row);
    ctx.save();
    ctx.lineWidth   = d.acertou ? 4 : 2.5;
    ctx.strokeStyle = d.acertou ? 'rgba(255,170,60,0.95)' : 'rgba(190,200,215,0.75)';
    if (!d.acertou) ctx.setLineDash([10, 8]);
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur  = 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();

    if (d.destruiu) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,80,60,0.95)';
      ctx.lineWidth   = 4;
      const s = HEX_R * 0.45;
      ctx.beginPath();
      ctx.moveTo(b.x - s, b.y - s); ctx.lineTo(b.x + s, b.y + s);
      ctx.moveTo(b.x + s, b.y - s); ctx.lineTo(b.x - s, b.y + s);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/**
 * Enquadra um conjunto de hexes: calcula zoom e deslocamento que os ponham em
 * tela com margem. A 360px o mapa inteiro deixa cada contador com ~14px de
 * altura — ilegível —, por isso o acompanhamento automático da ação.
 */
function rpFocar(hexes, { ativo = true } = {}) {
  if (!ativo || !hexes.length) { RP.zoom = 1; RP.panX = 0; RP.panY = 0; return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const h of hexes) {
    const { x, y } = hexToPixel(h.col, h.row);
    x0 = Math.min(x0, x - HEX_R * 1.6); x1 = Math.max(x1, x + HEX_R * 1.6);
    y0 = Math.min(y0, y - HEX_R * 1.6); y1 = Math.max(y1, y + HEX_R * 1.6);
  }
  const z = Math.max(1, Math.min(5, Math.min(CVS_W / (x1 - x0), CVS_H / (y1 - y0))));
  RP.zoom = z;
  RP.panX = Math.max(CVS_W * (1 - z), Math.min(0, CVS_W / 2 - ((x0 + x1) / 2) * z));
  RP.panY = Math.max(CVS_H * (1 - z), Math.min(0, CVS_H / 2 - ((y0 + y1) / 2) * z));
}
