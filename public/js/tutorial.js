'use strict';
// ═════════════════════════════════════════════════════════════════════════════
// TUTORIAL "COMO JOGAR" — página inicial
// Os passos interativos reaproveitam a renderização do próprio jogo: a mesma
// carta (mapa.jpeg), a mesma grade (hex.js / terrain.js) e os mesmos contadores
// de unidade (units.js), recortados numa janela do teatro de operações. As
// regras exibidas (faixas de combustível, detecção noturna, alcance das armas,
// interceptação) espelham as do servidor (fuel_model.js, server.js stateFor,
// shared/combat_config.js), e as unidades usam os valores da ordem de batalha.
// ═════════════════════════════════════════════════════════════════════════════
(function () {
  const TUT_STEPS = 9;
  const MAX_DAYS  = 12;
  let tutStep = 0;

  const overlay = document.getElementById('tutorial-overlay');
  if (!overlay) return;
  const $ = id => document.getElementById(id);
  const prevBtn = $('tut-prev'), nextBtn = $('tut-next');
  const counter = overlay.querySelector('.tut-counter');
  const dotsBox = $('tut-dots');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Textos dinâmicos (os fixos estão na marcação). Mesmas redações da tela de
  // jogo (client.js) onde o tutorial imita um painel do jogo.
  const TXT = {
    counter:      '{{n}} / {{total}}',
    next:         'Próximo →',
    enterGame:    '✓ ENTRAR NO JOGO',
    teamBlue:     'FORÇA AZUL',
    turnLabel:    'Turno {{turn}}/{{max}}',
    day:          '☀ Diurno',
    night:        '🌙 Noturno',
    phaseMov:     'Movimentação',
    phaseCombat:  'Combate',
    yourTurn:     '▶ SUA VEZ',
    fuelTiers:    '⚡ Esta unidade pode navegar em alta velocidade. Consumo neste período: até 1 hex = 1 FP · 2 hexes = 2 FP · 3 ou mais hexes = 3 FP.',
    fuelPlan:     '⛽ Consumo neste período: <b>{{cost}} FP</b> (restarão {{left}}/{{max}} FP)',
    fuelHigh:     '⚡ Alta velocidade: consumo de 3 FP neste período.',
    fuelNext:     '↑ Avançar mais 1 hex aumenta o consumo para {{cost}} FP.',
    fuelNextHigh: '⚡ Avançar mais 1 hex entra em alta velocidade: consumo de {{cost}} FP.',
    path:         'Caminho: {{steps}}/{{max}} passo(s)',
    endMov:       'Encerrar Movimentação',
    endMovN:      'Encerrar Movimentação ({{n}})',
    movS1:        'Clique no SAG-1 (contador azul, na bacia petrolífera) para selecioná-lo.',
    movS2:        'Clique nos hexágonos para traçar a rota — a cor mostra o consumo de combustível do período.',
    movS3:        'Rota com {{n}} passo(s). Amplie, desfaça com ↩ ou encerre a movimentação.',
    movDone:      'Movimentos revelados ao mesmo tempo — o SAG2 vermelho também se moveu. Consumo do SAG-1: {{cost}} FP (restam {{fp}}/10).',
    detDay:       '☀ Dia: o SAG-1 vê navios a até 2 hexágonos e detecta o SAG1 vermelho. O submarino SB1 detecta o LOG1.',
    detNight:     '🌙 Noite: o alcance do SAG-1 cai 2 hexágonos (fica só o próprio hex) e o SAG1 some do mapa. O SB1 usa sonar e continua vendo o LOG1.',
    engTitle:     'ENGAJAMENTOS REGISTRADOS ({{n}})',
    engEmpty:     'Nenhum engajamento registrado. Selecione uma unidade sua e clique num alvo vermelho; cada engajamento aparece aqui e como seta numerada no mapa.',
    engSelect:    'Selecionar o atacante no mapa',
    engLess:      'Diminuir salva',
    engMore:      'Aumentar salva',
    engRemove:    'Remover engajamento',
    engFuelNote:  'Cada engajamento custa +1 FP ao navio atacante.',
    engEnd:       'Encerrar Fase de Engajamentos ({{n}})',
    engS1:        'Clique numa unidade sua — o SAG-2 ou o submarino SB1.',
    engS2:        'Clique num alvo vermelho (hachurado) para registrar um engajamento.',
    engS3:        'Escolha a arma e o tamanho da salva e confirme.',
    engS4:        '{{n}} engajamento(s) registrado(s). Registre outro ou encerre a fase.',
    engDone:      'Fase encerrada. Quando os dois lados encerram, os engajamentos são resolvidos um a um — veja o próximo passo.',
    wpAvail:      '({{qty}} disp.)',
    wpUnlimited:  '(ilimitado)',
    brContinue:   'Se só você continuar, a <b>2ª rodada</b> acontece com a sua <b>iniciativa</b>: cada impacto rola 2d6 e fica com o maior. O grupo defensor contra-ataca com armas de curto alcance. Se os dois continuarem, há 2ª rodada sem iniciativa.',
    brStop:       'Se os dois pararem, o engajamento termina aqui. Se só o adversário continuar, a 2ª rodada acontece com a iniciativa <b>dele</b>.',
  };
  const t = (k, p = {}) => (TXT[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, v) => p[v] ?? '');
  const WEAPON_LABEL = { mss: 'MSS', torpedo: 'TORPEDO', navalGun: 'CANHÃO', airAttack: 'AT.AÉR' };

  // ── Navegação ──────────────────────────────────────────────────────────────
  for (let i = 0; i < TUT_STEPS; i++) {
    const d = document.createElement('button');
    d.className = 'tut-dot';
    d.dataset.s = i;
    d.setAttribute('aria-label', `Passo ${i + 1}`);
    d.addEventListener('click', () => { tutStep = i; render(); });
    dotsBox.appendChild(d);
  }

  function render() {
    overlay.querySelectorAll('.tut-step').forEach(el =>
      el.classList.toggle('active', +el.dataset.s === tutStep));
    dotsBox.querySelectorAll('.tut-dot').forEach(el => {
      const s = +el.dataset.s;
      el.classList.toggle('active', s === tutStep);
      el.classList.toggle('done', s < tutStep);
    });
    counter.textContent = t('counter', { n: tutStep + 1, total: TUT_STEPS });
    prevBtn.classList.toggle('invisible', tutStep === 0);
    const last = tutStep === TUT_STEPS - 1;
    nextBtn.textContent = last ? t('enterGame') : t('next');
    nextBtn.className   = last ? 'act-btn green' : 'act-btn blue';
    renderHuds();
    STEP_RENDER[tutStep]?.();
  }
  function show()  { loadAssets(); tutStep = 0; render(); overlay.classList.remove('hidden'); nextBtn.focus(); }
  function close() { overlay.classList.add('hidden'); }

  nextBtn.addEventListener('click', () => {
    if (tutStep < TUT_STEPS - 1) { tutStep++; render(); }
    else { close(); document.getElementById('lobby')?.scrollIntoView({ behavior: 'smooth' }); }
  });
  prevBtn.addEventListener('click', () => { if (tutStep > 0) { tutStep--; render(); } });
  overlay.querySelector('.tut-skip-btn').addEventListener('click', close);
  document.getElementById('btn-tutorial')?.addEventListener('click', show);
  document.addEventListener('keydown', e => {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') close();
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' && tutStep < TUT_STEPS - 1) { tutStep++; render(); }
    if (e.key === 'ArrowLeft'  && tutStep > 0)             { tutStep--; render(); }
  });

  // Barra superior idêntica ao cabeçalho do jogo (força · turno · período · fase · SUA VEZ)
  function renderHuds() {
    overlay.querySelectorAll('.sim-hud').forEach(h => {
      const kind  = h.dataset.hud;
      const night = kind === 'detection' && det.night;
      const phase = kind === 'combat' ? t('phaseCombat') : t('phaseMov');
      h.innerHTML = `<span class="hud-badge">${t('teamBlue')}</span>
        <span>${t('turnLabel', { turn: 1, max: MAX_DAYS })}</span>
        <span>${night ? t('night') : t('day')}</span>
        <span class="hud-phase">${phase}</span>
        <span class="hud-turn">${t('yourTurn')}</span>`;
    });
  }

  // ── Mini-mapa com a renderização do jogo ───────────────────────────────────
  // Janela do teatro (coordenadas de jogo): colunas J–S, linhas 6–10 — a costa
  // do Sudeste, as bacias petrolíferas e o mar aberto a leste. Em passos da
  // grade a partir do centro de J-6, para acompanhar a calibração de hex.js.
  const VIEW = (() => {
    const o = hexToPixel(9, 5), passo = HEX_R * 1.5;
    return { x0: o.x - 0.894 * passo, y0: o.y - 0.695 * HEX_H, w: 10.69 * passo, h: 5.68 * HEX_H };
  })();
  // Carta e ícones só são baixados quando o tutorial é aberto pela primeira vez.
  const mapImg = new Image();
  let mapReady = false, assetsRequested = false;
  function loadAssets() {
    if (assetsRequested) return;
    assetsRequested = true;
    mapImg.onload = () => { mapReady = true; redrawAll(); };
    mapImg.src = '/mapa.jpeg';
    if (typeof initIcons === 'function') initIcons(() => redrawAll());
  }

  class MiniMap {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.scale = canvas.width / VIEW.w;
    }
    begin() {
      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.cv.width, this.cv.height);
      c.setTransform(this.scale, 0, 0, this.scale, -VIEW.x0 * this.scale, -VIEW.y0 * this.scale);
      if (mapReady) c.drawImage(mapImg, 0, 0, CVS_W, CVS_H);
      else { c.fillStyle = '#0a2035'; c.fillRect(0, 0, CVS_W, CVS_H); }
      for (let r = 0; r < GRID_H; r++) for (let col = 0; col < GRID_W; col++) {
        const { x, y } = hexToPixel(col, r);
        drawHex(c, x, y, null, T_BORDER[TERRAIN_MAP[r][col]], 0.8);
      }
    }
    hex(col, row, fill, stroke, lw) {
      const { x, y } = hexToPixel(col, row);
      drawHex(this.ctx, x, y, fill, stroke, lw);
    }
    unit(u, selected, alpha = 1) {
      const c = this.ctx, { x, y } = hexToPixel(u.col, u.row);
      c.save();
      c.globalAlpha = alpha;
      c.beginPath(); c.arc(x, y, HEX_R * 0.58, 0, Math.PI * 2);
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
      drawUnitCounter(c, u, x, y, selected);
      c.restore();
    }
    label(col, row, text, color, dy = 0.55) {
      const c = this.ctx, { x, y } = hexToPixel(col, row);
      c.save();
      c.font = `bold ${Math.round(HEX_R * 0.26)}px sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 3;
      c.fillStyle = color;
      c.fillText(text, x, y + HEX_R * dy);
      c.restore();
    }
    name(u) {
      const c = this.ctx, { x, y } = hexToPixel(u.col, u.row);
      c.save();
      c.font = `bold ${Math.round(HEX_R * 0.22)}px 'Courier New', monospace`;
      c.textAlign = 'center'; c.textBaseline = 'top';
      const w = c.measureText(u.name).width + 8, ty = y + HEX_R * 0.62;
      c.fillStyle = 'rgba(4,12,22,0.78)';
      c.fillRect(x - w / 2, ty - 1, w, HEX_R * 0.28);
      c.fillStyle = u.team === 'blue' ? '#c8dcff' : '#ffc4bd';
      c.fillText(u.name, x, ty);
      c.restore();
    }
    hexAt(evt) {
      const r = this.cv.getBoundingClientRect();
      const gx = VIEW.x0 + (evt.clientX - r.left) * (VIEW.w / r.width);
      const gy = VIEW.y0 + (evt.clientY - r.top) * (VIEW.h / r.height);
      return pixelToHex(gx, gy);
    }
    // posição em px CSS relativa ao canvas (para posicionar janelas HTML)
    cssPos(col, row) {
      const r = this.cv.getBoundingClientRect(), { x, y } = hexToPixel(col, row);
      return { x: (x - VIEW.x0) * r.width / VIEW.w, y: (y - VIEW.y0) * r.height / VIEW.h };
    }
  }
  const same = (a, b) => a.col === b.col && a.row === b.row;
  const key  = h => `${h.col},${h.row}`;

  // ── Regras espelhadas do jogo ──────────────────────────────────────────────
  const HIGH_SPEED_DIST = 3;
  const FUEL_TIER_RGB = { 1: '0,230,118', 2: '255,179,0', 3: '255,87,34' };
  const navalMoveCost = d => (d <= 1 ? 1 : Math.min(d, HIGH_SPEED_DIST));

  // BFS do alcance a partir do fim da rota (mesmo critério do cliente do jogo)
  function reachable(start, steps, blocked) {
    const out = new Map(), q = [{ ...start, dist: 0, prev: null }];
    const seen = new Set([key(start), ...blocked]);
    while (q.length) {
      const cur = q.shift();
      if (cur.dist >= steps) continue;
      for (const nb of hexNeighbors(cur.col, cur.row)) {
        const k = key(nb);
        if (seen.has(k) || !canEnterTerrain('surface', TERRAIN_MAP[nb.row][nb.col])) continue;
        seen.add(k);
        const node = { col: nb.col, row: nb.row, dist: cur.dist + 1, prev: cur };
        out.set(k, node); q.push(node);
      }
    }
    return out;
  }

  // ═══ Passo 3 — Movimentação ════════════════════════════════════════════════
  // SAG-1 (BLUE-SAG-S1): fragatas, SP 9, MOV 4, 10 FP. SAG2 (RED-GE-3) é o contato.
  const MOV_START = { col: 13, row: 7 };
  const mov = {
    map: new MiniMap($('tut-mov-canvas')),
    blue: null, red: null, sel: false, path: [], reach: new Map(), done: false, anim: false,
  };
  function movReset() {
    mov.blue = { team: 'blue', type: 'fragata', name: 'SAG-1', hp: 9, maxHp: 9, mov: 4, fp: 10, fpMax: 10, ...MOV_START };
    mov.red  = { team: 'red',  type: 'fragata', name: 'SAG2', hp: 9, maxHp: 9, col: 16, row: 7 };
    mov.sel = false; mov.path = [{ ...MOV_START }]; mov.done = false; mov.anim = false;
    movRecalc(); movRender();
  }
  function movRecalc() {
    const steps = mov.path.length - 1;
    mov.reach = mov.sel && !mov.done
      ? reachable(mov.path[mov.path.length - 1], mov.blue.mov - steps, [...mov.path.map(key), key(mov.red)])
      : new Map();
  }
  function movDraw() {
    const m = mov.map; m.begin();
    const steps = mov.path.length - 1;
    const tierOf = d => navalMoveCost(steps + d);
    for (const h of mov.reach.values()) {
      const c = FUEL_TIER_RGB[tierOf(h.dist)];
      m.hex(h.col, h.row, `rgba(${c},${h.dist === 1 ? 0.22 : 0.10})`, `rgba(${c},${h.dist === 1 ? 0.72 : 0.34})`, h.dist === 1 ? 1.8 : 1.0);
    }
    for (const h of mov.reach.values()) {
      const tier = tierOf(h.dist);
      if (tier > 1 && tierOf(h.dist - 1) !== tier)
        m.label(h.col, h.row, `${tier} FP${tier >= HIGH_SPEED_DIST ? ' ⚡' : ''}`, `rgb(${FUEL_TIER_RGB[tier]})`);
    }
    // rota traçada (amarelo, passos numerados — como no jogo)
    for (let i = 1; i < mov.path.length && !mov.done; i++) {
      const p = mov.path[i], last = i === mov.path.length - 1;
      m.hex(p.col, p.row, last ? 'rgba(255,220,0,0.40)' : 'rgba(255,220,0,0.20)', last ? 'rgba(255,220,0,0.95)' : 'rgba(255,220,0,0.65)', last ? 2.2 : 1.6);
      m.label(p.col, p.row, String(i), 'rgba(255,255,255,0.95)', 0);
    }
    if (!mov.done && mov.path.length > 1) m.unit({ ...mov.blue, ...mov.path[mov.path.length - 1] }, false, 0.4);
    m.unit(mov.red, false);
    m.unit(mov.blue, mov.sel && !mov.done);
    m.name(mov.red); m.name(mov.blue);
  }
  function movPanel() {
    const steps = mov.path.length - 1, cost = navalMoveCost(steps);
    const u = mov.blue;
    let fuel = '';
    if (!mov.done && mov.sel) {
      const lines = [];
      if (steps === 0) lines.push(t('fuelTiers'));
      else {
        lines.push(t('fuelPlan', { cost, left: Math.max(0, u.fp - cost), max: u.fpMax }));
        if (steps >= HIGH_SPEED_DIST) lines.push(t('fuelHigh'));
        else if (steps < u.mov) {
          const next = navalMoveCost(steps + 1);
          if (next > cost) lines.push(t(next >= HIGH_SPEED_DIST ? 'fuelNextHigh' : 'fuelNext', { cost: next }));
        }
      }
      const cls = steps >= HIGH_SPEED_DIST ? 'fuel-plan high' : steps >= 2 ? 'fuel-plan mid' : 'fuel-plan';
      fuel = `<div class="${cls}">${lines.map(l => `<div>${l}</div>`).join('')}</div>`;
    }
    $('tut-mov-unit').innerHTML = `
      <div class="u-name blue">${esc(u.name)}</div>
      <div class="hp-bar"><div class="hp-fill" style="width:100%"></div></div>
      <div class="u-stats">
        <span>SP</span><span>${u.hp}/${u.maxHp}</span>
        <span>MOV</span><span>${u.mov}</span>
        <span>Combustível</span><span>${u.fp}/${u.fpMax} FP</span>
        <span>Det S/Aé/Sb/T</span><span>2/2/1/1</span>
      </div>
      ${steps > 0 && !mov.done ? `<div class="u-hint">${t('path', { steps, max: u.mov })}</div>` : ''}
      ${fuel}`;
    const end = $('tut-mov-end');
    end.textContent = steps > 0 ? t('endMovN', { n: 1 }) : t('endMov');
    end.disabled = mov.done || mov.anim;
    $('tut-mov-undo').disabled = steps === 0 || mov.done || mov.anim;
    $('tut-mov-reset').classList.toggle('hidden', !mov.done);
    const st = $('tut-mov-status');
    st.innerHTML = mov.done ? t('movDone', { cost: mov.lastCost, fp: u.fp })
      : !mov.sel ? t('movS1')
      : steps === 0 ? t('movS2') : t('movS3', { n: steps });
    st.className = 'sim-status' + (mov.done ? ' ok' : steps >= HIGH_SPEED_DIST ? ' warn' : '');
  }
  function movRender() { movDraw(); movPanel(); }

  $('tut-mov-canvas').addEventListener('click', e => {
    if (mov.done || mov.anim) return;
    const h = mov.map.hexAt(e);
    if (same(h, mov.blue)) { mov.sel = !mov.sel || mov.path.length > 1; movRecalc(); movRender(); return; }
    if (!mov.sel) return;
    const node = mov.reach.get(key(h));
    if (!node) return;
    const seg = [];
    for (let n = node; n && n.prev; n = n.prev) seg.unshift({ col: n.col, row: n.row });
    mov.path.push(...seg);
    movRecalc(); movRender();
  });
  $('tut-mov-undo').addEventListener('click', () => {
    if (mov.path.length > 1) { mov.path.pop(); movRecalc(); movRender(); }
  });
  $('tut-mov-reset').addEventListener('click', movReset);
  $('tut-mov-end').addEventListener('click', () => {
    if (mov.done || mov.anim) return;
    const steps = mov.path.length - 1;
    mov.lastCost = navalMoveCost(steps);
    mov.anim = true; mov.reach = new Map(); mov.sel = false;
    const path = mov.path.slice(1);
    let i = 0;
    const tick = () => {
      if (i < path.length) { Object.assign(mov.blue, path[i++]); movDraw(); setTimeout(tick, 260); return; }
      // revelação simultânea: o adversário também se moveu (para um hex livre)
      const dest = [{ col: 17, row: 6 }, { col: 16, row: 6 }, { col: 17, row: 7 }].find(h => !same(h, mov.blue));
      Object.assign(mov.red, dest);
      mov.blue.fp -= mov.lastCost;
      mov.anim = false; mov.done = true;
      movRender();
    };
    movPanel(); setTimeout(tick, 120);
  });

  // ═══ Passo 4 — Detecção ════════════════════════════════════════════════════
  // Alcances reais: SAG-1 detecta superfície a 2; o submarino SB1 também a 2,
  // mas por sonar — não perde alcance à noite.
  const det = {
    map: new MiniMap($('tut-det-canvas')), night: false,
    blue: [
      { team: 'blue', type: 'fragata',   name: 'SAG-1', hp: 9, maxHp: 9, col: 13, row: 7, det: 2, sub: false },
      { team: 'blue', type: 'submarino', name: 'SB1',   hp: 2, maxHp: 2, col: 15, row: 9, det: 2, sub: true },
    ],
    red: [
      { team: 'red', type: 'destroier', name: 'SAG1', hp: 10, maxHp: 10, col: 13, row: 5 },
      { team: 'red', type: 'logistico', name: 'LOG1', hp: 6,  maxHp: 6,  col: 17, row: 8 },
    ],
  };
  const detRange = u => Math.max(0, u.det - (det.night && !u.sub ? 2 : 0));
  function detDraw() {
    const m = det.map; m.begin();
    // névoa fora do alcance de detecção de qualquer unidade própria (como no jogo)
    const c = m.ctx;
    const covered = h => det.blue.some(u => hexDist(u.col, u.row, h.col, h.row) <= detRange(u));
    const rClip = HEX_R + 1;
    c.save();
    c.beginPath();
    for (let r = 0; r < GRID_H; r++) for (let col = 0; col < GRID_W; col++) {
      if (covered({ col, row: r })) continue;
      const { x, y } = hexToPixel(col, r);
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 3 * i, vx = x + rClip * Math.cos(a), vy = y + rClip * Math.sin(a);
        i ? c.lineTo(vx, vy) : c.moveTo(vx, vy);
      }
      c.closePath();
    }
    c.clip();
    if ('filter' in c) {
      c.filter = 'blur(7px) brightness(0.62) saturate(0.55)';
      if (mapReady) c.drawImage(mapImg, 0, 0, CVS_W, CVS_H);
      c.filter = 'none';
    }
    c.fillStyle = det.night ? 'rgba(4,10,24,0.50)' : 'rgba(6,16,28,0.30)';
    c.fillRect(0, 0, CVS_W, CVS_H);
    c.restore();
    for (const u of det.blue) {
      const rr = detRange(u);
      for (let r = 0; r < GRID_H; r++) for (let col = 0; col < GRID_W; col++) {
        const d = hexDist(u.col, u.row, col, r);
        if (d === rr && rr > 0) m.hex(col, r, null, u.sub ? 'rgba(128,203,196,0.75)' : 'rgba(130,177,255,0.8)', 1.6);
      }
    }
    const seen = det.red.filter(e => det.blue.some(u => hexDist(u.col, u.row, e.col, e.row) <= detRange(u)));
    for (const u of [...seen, ...det.blue]) m.unit(u, false);
    for (const u of [...seen, ...det.blue]) m.name(u);
  }
  function detRender() {
    detDraw();
    $('tut-det-day').className   = 'act-btn ' + (det.night ? 'gray' : 'yellow');
    $('tut-det-night').className = 'act-btn ' + (det.night ? 'yellow' : 'gray');
    $('tut-det-status').innerHTML = t(det.night ? 'detNight' : 'detDay');
    renderHuds();
  }
  $('tut-det-day').addEventListener('click',   () => { det.night = false; detRender(); });
  $('tut-det-night').addEventListener('click', () => { det.night = true;  detRender(); });

  // ═══ Passo 5 — Engajamentos ════════════════════════════════════════════════
  // Armas e alcances da ordem de batalha: SAG-2 (BLUE-SAG-S2) tem 24 MSS a 2 hex,
  // canhão a 1 e helicópteros de ataque (AT.AÉR) a 4; o SB1 (BLUE-SUB-1) tem
  // 2 MSS e 6 torpedos a 2 hex. Alvo válido = dentro do alcance de ataque
  // contra superfície (2) e com alguma arma que alcance — a regra do jogo.
  const WPN = {
    mss:       { range: 2, exp: true },
    torpedo:   { range: 2, exp: true },
    navalGun:  { range: 1, exp: false },
    airAttack: { range: 4, exp: false },
  };
  const eng = { map: new MiniMap($('tut-eng-canvas')) };
  function engReset() {
    eng.blue = [
      { id: 'S2', team: 'blue', type: 'fragata', name: 'SAG-2', hp: 10, maxHp: 10, col: 12, row: 7, atk: 2,
        weapons: { mss: 24 }, caps: { navalGun: 4, airAttack: 2 } },
      { id: 'B1', team: 'blue', type: 'submarino', name: 'SB1', hp: 2, maxHp: 2, col: 14, row: 9, atk: 2,
        weapons: { mss: 2, torpedo: 6 }, caps: {} },
    ];
    eng.red = [
      { id: 'G3', team: 'red', type: 'fragata',   name: 'SAG2', hp: 9, maxHp: 9, col: 13, row: 6 },
      { id: 'L1', team: 'red', type: 'logistico', name: 'LOG1', hp: 6, maxHp: 6, col: 14, row: 8 },
    ];
    eng.sel = null; eng.list = []; eng.picker = null; eng.done = false;
    $('tut-wp').classList.add('hidden');
    engRender();
  }
  const unitById = id => [...eng.blue, ...eng.red].find(u => u.id === id);
  function weaponsFor(att, tgt) {
    const d = hexDist(att.col, att.row, tgt.col, tgt.row), out = [];
    if (d > att.atk) return out;
    for (const [k, q] of Object.entries(att.weapons)) if (q > 0 && d <= WPN[k].range) out.push({ k, q, exp: true });
    for (const k of Object.keys(att.caps)) if (d <= WPN[k].range) out.push({ k, exp: false });
    return out;
  }
  function engDrawArrows(m) {
    const c = m.ctx, pairs = new Map();
    eng.list.forEach((a, i) => {
      const att = unitById(a.att), tgt = unitById(a.tgt);
      const p1 = hexToPixel(att.col, att.row), p2 = hexToPixel(tgt.col, tgt.row);
      const active = eng.sel === a.att;
      const color = active ? 'rgba(255,214,79,0.95)' : 'rgba(255,112,67,0.9)';
      const k = key(att) + '>' + key(tgt), n = pairs.get(k) || 0; pairs.set(k, n + 1);
      const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const off = n * HEX_R * 0.22, nx = -uy * off, ny = ux * off;
      drawHex(c, p2.x, p2.y, null, color, 2.4);
      const sx = p1.x + ux * HEX_R * 0.30 + nx, sy = p1.y + uy * HEX_R * 0.30 + ny;
      const ex = p2.x - ux * HEX_R * 0.45 + nx, ey = p2.y - uy * HEX_R * 0.45 + ny;
      c.save();
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = active ? 3 : 2.2;
      c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 3;
      c.setLineDash([HEX_R * 0.22, HEX_R * 0.14]);
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
      c.setLineDash([]);
      const ah = HEX_R * 0.32;
      c.beginPath(); c.moveTo(ex, ey);
      c.lineTo(ex - ux * ah - uy * ah * 0.55, ey - uy * ah + ux * ah * 0.55);
      c.lineTo(ex - ux * ah + uy * ah * 0.55, ey - uy * ah - ux * ah * 0.55);
      c.closePath(); c.fill();
      // número do engajamento
      const bx = sx + (ex - sx) * 0.42, by = sy + (ey - sy) * 0.42, r = HEX_R * 0.24;
      c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2);
      c.fillStyle = 'rgba(10,20,32,0.92)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = color; c.stroke();
      c.fillStyle = '#fff'; c.font = `bold ${Math.round(r * 1.15)}px sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(i + 1), bx, by + 0.5);
      c.restore();
    });
  }
  function engDraw() {
    const m = eng.map; m.begin();
    const att = eng.sel && unitById(eng.sel);
    if (att && !eng.done) {
      for (const e of eng.red) {
        if (!weaponsFor(att, e).length) continue;
        const declared = eng.list.some(a => a.att === att.id && a.tgt === e.id);
        const { x, y } = hexToPixel(e.col, e.row);
        drawHex(m.ctx, x, y, declared ? 'rgba(255,60,60,0.50)' : 'rgba(255,60,60,0.22)',
          declared ? 'rgba(255,120,120,1.0)' : 'rgba(255,80,80,0.75)', 2.0);
        hatch(m.ctx, x, y, declared ? 'rgba(255,150,150,0.55)' : 'rgba(255,90,90,0.35)');
      }
    }
    for (const u of [...eng.red, ...eng.blue]) m.unit(u, u.id === eng.sel);
    for (const u of [...eng.red, ...eng.blue]) m.name(u);
    engDrawArrows(m);
  }
  function hatch(c, cx, cy, color) {
    c.save(); c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i, vx = cx + HEX_R * Math.cos(a), vy = cy + HEX_R * Math.sin(a);
      i ? c.lineTo(vx, vy) : c.moveTo(vx, vy);
    }
    c.closePath(); c.clip();
    c.strokeStyle = color; c.lineWidth = 1.2; c.beginPath();
    for (let d = -2 * HEX_R; d <= 2 * HEX_R; d += 14) { c.moveTo(cx + d - HEX_R, cy - HEX_R); c.lineTo(cx + d + HEX_R, cy + HEX_R); }
    c.stroke(); c.restore();
  }
  function engPanel() {
    const n = eng.list.length;
    $('tut-eng-title').textContent = t('engTitle', { n });
    $('tut-eng-list').innerHTML = !n ? `<p class="eng-empty">${t('engEmpty')}</p>` : eng.list.map((a, i) => {
      const att = unitById(a.att), tgt = unitById(a.tgt), w = WPN[a.w];
      const data = `data-i="${i}"`;
      return `<div class="eng-entry${eng.sel === a.att ? ' active' : ''}">
        <span class="eng-num">${i + 1}</span>
        <div class="eng-body">
          <button class="eng-att" data-sel ${data} title="${t('engSelect')}">${esc(att.name)}</button>
          <span class="eng-arrow">→</span><span class="eng-tgt">${esc(tgt.name)}</span>
          <div class="eng-meta">
            <span class="atk-wpn-tag">${WEAPON_LABEL[a.w]}${w.exp ? ` ×${a.amt}` : ''}</span>
            <span class="eng-dist">${hexDist(att.col, att.row, tgt.col, tgt.row)} hex</span>
            ${w.exp && !eng.done ? `<span class="atk-amt-ctrl">
              <button class="atk-adj-btn" data-adj="-1" ${data} title="${t('engLess')}">−</button>
              <button class="atk-adj-btn" data-adj="1" ${data} title="${t('engMore')}">+</button></span>` : ''}
          </div>
        </div>
        ${eng.done ? '' : `<button class="eng-del" data-del ${data} title="${t('engRemove')}">✕</button>`}
      </div>`;
    }).join('') + (n ? `<p class="eng-note">${t('engFuelNote')}</p>` : '');
    const end = $('tut-eng-end');
    end.textContent = t('engEnd', { n });
    end.disabled = eng.done;
    $('tut-eng-reset').classList.toggle('hidden', !eng.done);
    const st = $('tut-eng-status');
    st.innerHTML = eng.done ? t('engDone')
      : eng.picker ? t('engS3')
      : n && !eng.sel ? t('engS4', { n })
      : eng.sel ? t('engS2') : t('engS1');
    st.className = 'sim-status' + (eng.done ? ' ok' : '');
  }
  function engRender() { engDraw(); engPanel(); }

  // Seletor de armas como o do jogo: salva começa em 1, −/+ até o estoque.
  function openPicker(att, tgt) {
    const opts = weaponsFor(att, tgt);
    eng.picker = { att: att.id, tgt: tgt.id, opts, amt: {} };
    $('tut-wp-target').textContent = `→ ${tgt.name}`;
    $('tut-wp-body').innerHTML = opts.map((o, i) => {
      eng.picker.amt[o.k] = 1;
      return `<div class="wp-row"><label class="wp-label">
          <input type="radio" name="tut-wp" value="${o.k}" ${i === 0 ? 'checked' : ''}>
          <span class="wp-name">${WEAPON_LABEL[o.k]}</span>
          <span class="wp-qty">${o.exp ? t('wpAvail', { qty: o.q }) : t('wpUnlimited')}</span>
        </label>
        ${o.exp ? `<div class="wp-qty-ctrl"><button class="wp-adj" data-wk="${o.k}" data-d="-1">−</button>
          <span class="wp-amt" data-wa="${o.k}">1</span>
          <button class="wp-adj" data-wk="${o.k}" data-d="1">+</button></div>` : ''}
      </div>`;
    }).join('');
    const wp = $('tut-wp'), p = eng.map.cssPos(tgt.col, tgt.row);
    wp.classList.remove('hidden');
    const wrap = wp.parentElement.getBoundingClientRect();
    wp.style.left = Math.max(6, Math.min(wrap.width - wp.offsetWidth - 6, p.x + 30)) + 'px';
    wp.style.top  = Math.max(6, Math.min(wrap.height - wp.offsetHeight - 6, p.y - wp.offsetHeight / 2)) + 'px';
    engPanel();
  }
  function closePicker() { eng.picker = null; $('tut-wp').classList.add('hidden'); engPanel(); }
  $('tut-wp-body').addEventListener('click', e => {
    const b = e.target.closest('[data-wk]'); if (!b || !eng.picker) return;
    const k = b.dataset.wk, att = unitById(eng.picker.att);
    eng.picker.amt[k] = Math.max(1, Math.min(att.weapons[k], eng.picker.amt[k] + Number(b.dataset.d)));
    $('tut-wp-body').querySelector(`[data-wa="${k}"]`).textContent = eng.picker.amt[k];
  });
  $('tut-wp-cancel').addEventListener('click', closePicker);
  $('tut-wp-confirm').addEventListener('click', () => {
    if (!eng.picker) return;
    const w = $('tut-wp-body').querySelector('input[name="tut-wp"]:checked')?.value;
    if (w) eng.list.push({ att: eng.picker.att, tgt: eng.picker.tgt, w, amt: eng.picker.amt[w] || 1 });
    closePicker(); engRender();
  });
  $('tut-eng-canvas').addEventListener('click', e => {
    if (eng.done || eng.picker) return;
    const h = eng.map.hexAt(e);
    const own = eng.blue.find(u => same(u, h));
    if (own) { eng.sel = eng.sel === own.id ? null : own.id; engRender(); return; }
    const tgt = eng.red.find(u => same(u, h));
    const att = eng.sel && unitById(eng.sel);
    if (!tgt || !att || !weaponsFor(att, tgt).length) return;
    const idx = eng.list.findIndex(a => a.att === att.id && a.tgt === tgt.id);
    if (idx >= 0) { eng.list.splice(idx, 1); engRender(); return; }   // clicar de novo remove, como no jogo
    engDraw(); openPicker(att, tgt);
  });
  $('tut-eng-list').addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b || eng.done) return;
    const a = eng.list[+b.dataset.i]; if (!a) return;
    if (b.hasAttribute('data-del')) eng.list.splice(+b.dataset.i, 1);
    else if (b.dataset.adj) {
      const max = unitById(a.att).weapons[a.w] || 1;
      a.amt = Math.max(1, Math.min(max, a.amt + Number(b.dataset.adj)));
    } else if (b.hasAttribute('data-sel')) eng.sel = a.att;
    engRender();
  });
  $('tut-eng-end').addEventListener('click', () => { eng.done = true; eng.sel = null; closePicker(); engRender(); });
  $('tut-eng-reset').addEventListener('click', engReset);

  // ═══ Passo 6 — Resolução: decisão continuar/parar ══════════════════════════
  $('tut-br-continue').addEventListener('click', () => { $('tut-br-info').innerHTML = t('brContinue'); });
  $('tut-br-stop').addEventListener('click',     () => { $('tut-br-info').innerHTML = t('brStop'); });

  // ═══ Passo 2 — contadores de exemplo ═══════════════════════════════════════
  function unitsDraw() {
    const cv = $('tut-unit-canvas'), c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    const s = 0.7;
    c.setTransform(s, 0, 0, s, 0, 0);
    const sample = [
      { team: 'blue', type: 'fragata',   hp: 9, maxHp: 9,  x: 75 },
      { team: 'red',  type: 'carrier',   hp: 3, maxHp: 6,  x: 214 },
      { team: 'blue', type: 'submarino', hp: 2, maxHp: 2,  x: 353, stack: 2 },
    ];
    for (const u of sample) {
      const y = 78;
      drawHex(c, u.x, y, 'rgba(10,30,60,0.55)', 'rgba(80,140,200,0.35)', 1);
      c.beginPath(); c.arc(u.x, y, HEX_R * 0.58, 0, Math.PI * 2); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
      drawUnitCounter(c, u, u.x, y, false);
      if (u.stack) {
        c.beginPath(); c.arc(u.x + HEX_R * 0.42, y - HEX_R * 0.42, 12, 0, Math.PI * 2);
        c.fillStyle = '#ffd54f'; c.fill();
        c.fillStyle = '#000'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(u.stack), u.x + HEX_R * 0.42, y - HEX_R * 0.42 + 0.5);
      }
    }
  }

  const STEP_RENDER = {
    2: unitsDraw,
    3: () => { if (!mov.blue) movReset(); else movRender(); },
    4: detRender,
    5: () => { if (!eng.blue) engReset(); else engRender(); },
    6: () => { $('tut-br-info').innerHTML = ''; },
  };
  function redrawAll() {
    if (overlay.classList.contains('hidden')) return;
    STEP_RENDER[tutStep]?.();
  }
  window.addEventListener('resize', () => { if (eng.picker) closePicker(); });
})();
