#!/usr/bin/env python3
"""
ampliar_mapa.py — Amplia a carta náutica do jogo de 16 para 20 colunas (A–T).

HISTÓRICO: a carta de 20×10 foi substituída pela OAS-MAP-001 Ed. 2.0 (28×20);
ver scripts/mapa_oas_map_001.py. Este script fica como registro de como a
carta de 20 colunas foi produzida.

A carta (public/mapa.jpeg) é uma imagem raster com a grade hexagonal, os
rótulos dos hexágonos, o graticulado, as sondagens, a moldura e o título já
impressos; não há fonte vetorial. Este script estende a própria imagem para
leste, com o mesmo traço:

  • corta a carta na moldura direita do mapa e afasta tudo à direita
    (moldura, latitudes) em 4 colunas da grade;
  • fora do mapa (moldura, caixa do título, faixa verde, margem inferior)
    preenche o vão repetindo uma coluna de pixels limpa da própria carta e
    recentraliza o título, o subtítulo e o texto da faixa verde;
  • no vão do mapa desenha o oceano, as linhas tracejadas de latitude e os
    meridianos 28°W–24°W (mesmo tracejado, cor e fase dos existentes), os
    contornos e rótulos dos hexágonos Q–T e algumas sondagens.

Todas as medidas abaixo foram tiradas da carta original de 3446×2832 (cor,
espessura, tracejado, fontes ajustadas por mínimos quadrados). A geometria da
grade impressa: centro x = 234,5 + 202,04·col, centro y = 382,1 + 233,26·(linha
+ ½ nas colunas ímpares). public/js/hex.js usa a mesma geometria, à metade.

Uso (Pillow e numpy só para este script — não são dependências do jogo):
    python3 scripts/ampliar_mapa.py carta_16col.jpeg public/mapa.jpeg
    python3 scripts/ampliar_mapa.py --calibrar carta_16col.jpeg
A carta de 16 colunas está no histórico do git (public/mapa.jpeg antes desta
ampliação).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONTES = '/usr/share/fonts/truetype/dejavu/'

# ─── Grade impressa (resolução cheia) ─────────────────────────────────────────
X0, PASSO = 234.5, 202.04         # centro x da coluna A e passo entre colunas
Y0, ALT   = 382.1, 233.26         # centro y da linha 1 (coluna par) e altura do hex
R         = PASSO / 1.5           # raio (vértice a vértice / 2)
COLS_ANT, COLS_NOVAS, LINHAS = 16, 4, 10
VAO       = int(round(PASSO * COLS_NOVAS))   # 808 px

# ─── Moldura e faixas ─────────────────────────────────────────────────────────
X_CORTE         = 3400            # 1ª coluna da linha escura da moldura direita
X_LIMPA         = 3300            # coluna sem texto nem traço vertical (fora do mapa)
MAPA_Y0, MAPA_Y1 = 181, 2800      # área do mapa: entre a faixa verde e a moldura inferior
TOPO_Y1         = 181             # moldura superior + caixa do título + faixa verde
RESTOS_Y        = (155, 165)      # restos dos rótulos de longitude cobertos pela faixa
X_TITULO        = 1500            # à esquerda do título/subtítulo e do texto da faixa

# ─── Estilo medido ────────────────────────────────────────────────────────────
OCEANO     = (247, 248, 250)
TRACO_HEX  = (132, 86, 87)        # contorno dos hexágonos, 3 px
COR_ROTULO = (84, 51, 48)         # "O-1": DejaVu Sans Mono Bold 14, centro + 80,6 px
DY_ROTULO  = 80.6
COR_SOND   = (106, 117, 130)      # sondagens: DejaVu Sans 12,5
COR_TICK   = (57, 51, 37)
LAT_Y      = [203, 437, 671, 905, 1139, 1373, 1606, 1840, 2074, 2308, 2542, 2776]  # 18°S…29°S
MER_X0, MER_PASSO = 273.0, 173.67  # 46°W e 1° de longitude
LAT_PAR_Y  = 203                   # 18°S: graus pares = traço forte

def meridiano_x(lon_w):            # lon_w em graus oeste
    return MER_X0 + (46 - lon_w) * MER_PASSO

def centro(col, lin):
    return X0 + PASSO * col, Y0 + ALT * (lin + 0.5 * (col & 1))

def vertices(col, lin):
    cx, cy = centro(col, lin)
    return [(cx + R, cy), (cx + R / 2, cy + ALT / 2), (cx - R / 2, cy + ALT / 2),
            (cx - R, cy), (cx - R / 2, cy - ALT / 2), (cx + R / 2, cy - ALT / 2)]

def rotulo(col, lin):
    return f'{chr(65 + col)}-{lin + 1}'

# ─── Traços ───────────────────────────────────────────────────────────────────
def tracejado(pos, par):
    """Padrão do graticulado: graus pares 13 px a cada 25; ímpares 7 a cada 40."""
    if par:
        return (pos % 25) < 13, 195
    k = (pos - 20) % 40
    if k > 6:
        return False, 0
    return True, 225 if k in (0, 6) else 218

def linha_lat(arr, y, x0, x1):
    par = round((y - LAT_PAR_Y) / 233.9) % 2 == 0
    for x in range(x0, x1):
        on, v = tracejado(x, par)
        if on:
            arr[y, x] = (v, v, v + (2 if not par else 0))

def linha_mer(arr, x, y0, y1, par):
    for y in range(y0, y1):
        on, v = tracejado(y - (5 if par else 0), par)
        if on:
            arr[y, x] = (v, v, v)

def _chave(a, b):
    return tuple(sorted([(round(a[0]), round(a[1])), (round(b[0]), round(b[1]))]))

def arestas(cols):
    """Arestas únicas dos hexágonos das colunas dadas, menos as que a coluna
    anterior (já impressa) compartilha com elas."""
    vistas = set()
    for l in range(LINHAS):
        v = vertices(min(cols) - 1, l)
        vistas.update(_chave(v[i], v[(i + 1) % 6]) for i in range(6))
    out = []
    for c in cols:
        for l in range(LINHAS):
            v = vertices(c, l)
            for i in range(6):
                a, b = v[i], v[(i + 1) % 6]
                k = _chave(a, b)
                if k not in vistas:
                    vistas.add(k); out.append((a, b))
    return out

def desenhar_arestas(img, segs, x0, x1):
    """Contornos com antisserrilhado (4× e redução), recortados à área do mapa."""
    S = 4
    w, h = x1 - x0, MAPA_Y1 - MAPA_Y0
    camada = Image.new('L', (w * S, h * S), 0)
    d = ImageDraw.Draw(camada)
    for (ax, ay), (bx, by) in segs:
        d.line([((ax - x0) * S, (ay - MAPA_Y0) * S), ((bx - x0) * S, (by - MAPA_Y0) * S)],
               fill=255, width=3 * S)
    alfa = camada.resize((w, h), Image.LANCZOS)
    cor = Image.new('RGB', (w, h), TRACO_HEX)
    regiao = img.crop((x0, MAPA_Y0, x1, MAPA_Y1))
    img.paste(Image.composite(cor, regiao, alfa), (x0, MAPA_Y0))

def desenhar_rotulos(img, cols):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONTES + 'DejaVuSansMono-Bold.ttf', 14)
    for c in cols:
        for l in range(LINHAS):
            cx, cy = centro(c, l)
            d.text((cx, cy + DY_ROTULO), rotulo(c, l), font=f, fill=COR_ROTULO, anchor='mm')

# Sondagens de águas profundas a leste de Trindade (profundidades típicas da
# bacia do Brasil, ~5 000–5 500 m), em pontos livres do interior dos hexágonos.
SONDAGENS = [((16, 0), (-38, -20), '5390'), ((17, 1), (30, -30), '5260'), ((18, 0), (-20, 25), '5470'),
             ((19, 2), (25, -35), '5510'), ((16, 3), (35, 10), '5180'), ((18, 4), (-35, -25), '5330'),
             ((17, 5), (-30, 20), '5420'), ((19, 6), (-25, -30), '5560'), ((16, 7), (30, -25), '5240'),
             ((18, 8), (35, 15), '5380'), ((17, 9), (-35, -30), '5150')]

def desenhar_sondagens(img):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONTES + 'DejaVuSans.ttf', 12.5)
    for (c, l), (dx, dy), txt in SONDAGENS:
        cx, cy = centro(c, l)
        d.text((cx + dx, cy + dy), txt, font=f, fill=COR_SOND, anchor='mm')

def margem_inferior(img, lons):
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONTES + 'DejaVuSansMono.ttf', 14)
    for lon in lons:
        x = round(meridiano_x(lon))
        d.line([(x, 2803), (x, 2807)], fill=COR_TICK, width=1)
        if lon % 2 == 0:
            d.text((meridiano_x(lon) + 0.5, 2813.5), f'{lon}°W', font=f, fill=(58, 50, 38), anchor='mm')

# ─── Composição ───────────────────────────────────────────────────────────────
def ampliar(orig):
    a = np.asarray(orig.convert('RGB')).copy()
    H, W, _ = a.shape
    if (W, H) != (3446, 2832):
        sys.exit(f'esperava a carta de 16 colunas (3446×2832), recebi {W}×{H}')

    # 1) topo: apaga os restos dos rótulos de longitude sob a faixa verde
    y0, y1 = RESTOS_Y
    a[y0:y1, 101:X_CORTE] = a[y0:y1, X_LIMPA:X_LIMPA + 1]

    # 2) abre o vão: tudo à direita do corte vai VAO px para leste
    n = np.empty((H, W + VAO, 3), np.uint8)
    n[:, :X_CORTE] = a[:, :X_CORTE]
    n[:, X_CORTE + VAO:] = a[:, X_CORTE:]
    n[:, X_CORTE:X_CORTE + VAO] = a[:, X_LIMPA:X_LIMPA + 1]   # moldura, faixas, margem
    n[MAPA_Y0:MAPA_Y1, X_CORTE:X_CORTE + VAO] = OCEANO        # oceano no vão do mapa

    # 3) recentraliza título, subtítulo e o texto da faixa verde (meio vão)
    meio = VAO // 2
    bloco = a[:TOPO_Y1, X_TITULO:X_CORTE].copy()
    n[:TOPO_Y1, X_TITULO + meio:X_CORTE + meio] = bloco
    n[:TOPO_Y1, X_TITULO:X_TITULO + meio] = a[:TOPO_Y1, X_TITULO:X_TITULO + 1]

    # 4) graticulado no vão: latitudes e meridianos 28°W…24°W
    xa, xb = X_CORTE, X_CORTE + VAO
    for y in LAT_Y:
        linha_lat(n, y, xa, xb)
    # 28°W cai sobre a antiga moldura (x≈3399): também é desenhado
    lons = [lon for lon in range(28, 22, -1) if xa - 2 <= meridiano_x(lon) < xb]
    for lon in lons:
        linha_mer(n, round(meridiano_x(lon)), MAPA_Y0, MAPA_Y1, lon % 2 == 0)

    img = Image.fromarray(n)
    # 5) hexágonos Q–T e rótulos; sondagens; margem inferior
    novas = range(COLS_ANT, COLS_ANT + COLS_NOVAS)
    desenhar_arestas(img, arestas(novas), X_CORTE - 80, X_CORTE + VAO)
    desenhar_sondagens(img)
    desenhar_rotulos(img, novas)
    margem_inferior(img, lons)
    return img

def calibrar(orig):
    """Redesenha a coluna O (já impressa) sobre a original e mede a diferença:
    com a geometria e o estilo certos, o redesenho quase não altera a imagem."""
    a0 = np.asarray(orig.convert('RGB')).astype(float)
    img = orig.convert('RGB').copy()
    segs = []
    for l in range(LINHAS):
        v = vertices(14, l)
        segs += [(v[i], v[(i + 1) % 6]) for i in range(6)]
    desenhar_arestas(img, segs, 2900, 3240)
    desenhar_rotulos(img, [14])
    a1 = np.asarray(img).astype(float)
    reg = (slice(MAPA_Y0, MAPA_Y1), slice(2900, 3240))
    dif = np.abs(a1[reg] - a0[reg]).sum(2)
    print(f'coluna O redesenhada: diferença média {dif.mean():.2f}, '
          f'pixels alterados >60: {(dif > 60).sum()} de {dif.size}')
    for dx in (-2, 2):    # referência: a mesma coisa deslocada 2 px
        global X0
        X0 += dx
        img2 = orig.convert('RGB').copy()
        segs2 = []
        for l in range(LINHAS):
            v = vertices(14, l)
            segs2 += [(v[i], v[(i + 1) % 6]) for i in range(6)]
        desenhar_arestas(img2, segs2, 2900, 3240)
        d2 = np.abs(np.asarray(img2).astype(float)[reg] - a0[reg]).sum(2)
        print(f'  (deslocada {dx:+d} px: diferença média {d2.mean():.2f}, >60: {(d2 > 60).sum()})')
        X0 -= dx

if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--calibrar':
        calibrar(Image.open(args[1]))
    elif len(args) == 2:
        out = ampliar(Image.open(args[0]))
        out.save(args[1], quality=92, subsampling=0, optimize=True)
        print(f'{args[1]}: {out.width}×{out.height}')
    else:
        sys.exit(__doc__)
