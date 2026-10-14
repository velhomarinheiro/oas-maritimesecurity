#!/usr/bin/env python3
"""
mapa_oas_map_001.py — Grade 28×20 do jogo sobre a carta OAS-MAP-001 Ed. 2.0.

A carta oficial da OAS-SM (docs/sm/figuras/carta_oas_sm.png, 13°S–34°S,
grade A–AB × 1–20) é a carta anterior de 20×10 (A–T × 1–10) ampliada: a
mesma grade impressa, com 6 colunas a oeste, 2 a leste, 5 linhas ao norte e
5 ao sul. Cada hexágono antigo (c, r) é o hexágono novo (c + 6, r + 5) — o
deslocamento de colunas é par, então a paridade odd-q se preserva e as
distâncias entre hexágonos não mudam. Os portos, as bases aéreas e as quatro
FPSOs da ordem de batalha caem, na carta nova, exatamente nos hexágonos
antigos + (6, 5).

O que o script faz:
  1. ajusta a geometria da grade impressa (centro de A-1 e raio) por
     varredura sobre os pixels do traço dos hexágonos;
  2. classifica o terreno de cada hexágono pela cor da carta (terra, faixa
     azul costeira, plataforma, oceano, hachura de bacia petrolífera);
  3. compõe a matriz do jogo: na área da carta anterior (colunas G–Z,
     linhas 6–15) mantém o terreno do jogo base — é ele que as regras de
     movimentação e detecção calibraram; fora dela usa a classificação;
     onde o jogo base supunha costa além da borda oeste (águas rasas sem
     terra vizinha, agora que a costa aparece) passa a plataforma;
  4. imprime a matriz para shared/board.js e public/js/terrain.js e o
     hexágono de cada símbolo de infraestrutura impresso na carta.

Uso (Pillow e numpy só para este script — não são dependências do jogo):
    python3 scripts/mapa_oas_map_001.py docs/sm/figuras/carta_oas_sm.png
    python3 scripts/mapa_oas_map_001.py --calibrar docs/sm/figuras/carta_oas_sm.png
    python3 scripts/mapa_oas_map_001.py --conferir docs/sm/figuras/carta_oas_sm.png
O mapa do jogo (public/mapa.jpeg) é a própria carta, em JPEG de qualidade 92.
"""
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

COLS, LINHAS = 28, 20
# Ajuste da grade impressa (--calibrar): centro de A-1 e raio, em pixels da
# carta de 1900×1521. public/js/hex.js usa os mesmos valores.
X0, Y0, R = 67.25, 108.25, 38.64
ALT = math.sqrt(3) * R

# Deslocamento da carta anterior (20×10) dentro da nova.
DC, DR = 6, 5
BASE_W, BASE_H = 20, 10

T_LAND, T_SHALLOW, T_SHELF, T_DEEP, T_OIL = 0, 1, 2, 3, 4

# Terreno do jogo base (shared/board.js antes desta ampliação), 20×10.
TERRENO_BASE = [
    [0,0,0,0,0,0,1,2,3,3,3,3,3,3,3,3,3,3,3,3],
    [0,0,0,0,0,1,1,2,3,3,3,3,3,3,3,3,3,3,3,3],
    [0,0,0,0,1,1,2,4,3,3,3,3,3,3,3,3,3,3,3,3],
    [0,0,0,1,1,2,4,4,3,3,3,3,3,3,3,3,3,3,3,3],
    [0,0,1,1,2,4,4,2,3,3,3,3,3,3,3,3,3,3,3,3],
    [0,1,1,2,4,4,2,3,3,3,3,3,3,3,3,3,3,3,3,3],
    [1,1,2,4,4,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    [1,2,2,4,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    [1,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
    [1,2,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3],
]

# Cores medidas na legenda e no corpo da carta.
CORES = {
    'terra':  [(251, 230, 168), (234, 197, 118), (240, 210, 140)],
    'rasa':   [(200, 224, 231)],
    'plat':   [(220, 235, 240)],
    'oceano': [(245, 248, 250)],
    'bacia':  [(222, 185, 130), (240, 215, 170)],
}
LIMIAR_COR = 300   # distância² máxima à cor de referência

# Símbolos de infraestrutura: posição do símbolo na carta (px).
INFRA_CARTA = {
    'PLT-01': (530, 846), 'PLT-02': (473, 812), 'PLT-03': (646, 777),
    'PLT-04': (704, 677), 'PLT-05': (762, 643),
    'PRT-01 Santos': (403, 793), 'PRT-02 Rio de Janeiro': (549, 716),
    'PRT-03 Vitória/Tubarão': (707, 547), 'PRT-04 Açu': (665, 648),
    'PRT-05 Angra dos Reis': (505, 722), 'PRT-06 São Sebastião': (450, 778),
    'PRT-07 Salvador': (793, 73), 'PRT-08 Paranaguá': (295, 899),
    'PRT-09 Itajaí': (285, 993), 'PRT-10 Rio Grande': (110, 1333),
    'PRT-11 Ilhéus': (770, 165), 'PRT-12 São Francisco do Sul': (288, 940),
    'PRT-13 Imbituba': (288, 1078), 'PRT-14 Porto Alegre': (175, 1210),
    'BN-01 Base Naval do Rio de Janeiro': (591, 712),
    'BA-01 Santa Cruz': (499, 669), 'BA-02 Galeão': (548, 641),
    'BA-03 Guarulhos': (371, 720), 'BA-04 Cumbica': (381, 800),
    'BA-05 Vitória': (683, 505), 'BA-06 Campos': (628, 543),
    'BA-07 Macaé': (605, 627), 'BA-08 Cabo Frio': (613, 665),
    'BA-09 BAN São Pedro da Aldeia': (534, 663), 'BA-10 Salvador': (751, 92),
    'BA-11 Ilhéus': (730, 194), 'BA-12 Porto Seguro': (748, 287),
    'BA-13 Viracopos': (327, 725), 'BA-14 Curitiba': (245, 872),
    'BA-15 Navegantes': (248, 973), 'BA-16 Florianópolis': (268, 1047),
    'BA-17 Porto Alegre': (157, 1157),
    'ILH-01 Trindade': (1257, 563), 'ILH-02 Martim Vaz': (1282, 563),
    'ILH-03 Abrolhos': (790, 395),
}


def centro(c, r, x0=X0, y0=Y0, raio=R):
    alt = math.sqrt(3) * raio
    return x0 + 1.5 * raio * c, y0 + alt * (r + 0.5 * (c & 1))


def vizinhos(c, r):
    d = ([(1, 0), (1, 1), (0, -1), (0, 1), (-1, 0), (-1, 1)] if c & 1 else
         [(1, -1), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 0)])
    return [(c + a, r + b) for a, b in d if 0 <= c + a < COLS and 0 <= r + b < LINHAS]


def letra(c):
    return chr(65 + c) if c < 26 else letra(c // 26 - 1) + chr(65 + c % 26)


def carregar(caminho):
    return np.asarray(Image.open(caminho).convert('RGB')).astype(int)


def calibrar(img):
    """Varre (x0, y0, raio) maximizando a fração de bordas sobre o traço."""
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    traco = ((r - g) > 45) & ((r - b) > 45) & (r > 120) & (r < 235)
    h, w = traco.shape

    def nota(x0, y0, raio):
        acertos = total = 0
        for c in range(COLS):
            for rr in range(LINHAS):
                cx, cy = centro(c, rr, x0, y0, raio)
                for i in range(6):
                    a0, a1 = math.pi / 3 * i, math.pi / 3 * (i + 1)
                    for t in (0.25, 0.5, 0.75):
                        x = cx + raio * ((1 - t) * math.cos(a0) + t * math.cos(a1))
                        y = cy + raio * ((1 - t) * math.sin(a0) + t * math.sin(a1))
                        xi, yi = int(round(x)), int(round(y))
                        if 1 <= xi < w - 1 and 1 <= yi < h - 1:
                            acertos += traco[yi - 1:yi + 2, xi - 1:xi + 2].any()
                            total += 1
        return acertos / max(total, 1)

    melhor = max(((nota(x, y, rr), x, y, rr)
                  for rr in np.arange(R - 0.3, R + 0.3, 0.02)
                  for x in np.arange(X0 - 1.5, X0 + 1.5, 0.25)
                  for y in np.arange(Y0 - 1.5, Y0 + 1.5, 0.25)))
    return melhor


def fracoes(img):
    """Fração de pixels de cada cor de referência no miolo de cada hexágono."""
    nomes = list(CORES)
    out = {}
    for c in range(COLS):
        for r in range(LINHAS):
            cx, cy = centro(c, r)
            cont = dict.fromkeys(nomes, 0)
            n = 0
            for dy in range(-26, 27, 3):
                for dx in range(-30, 31, 3):
                    if dx * dx + dy * dy > (0.75 * R) ** 2:
                        continue
                    px = img[int(cy + dy), int(cx + dx)]
                    d, nome = min((sum((px[i] - ref[i]) ** 2 for i in range(3)), k)
                                  for k, refs in CORES.items() for ref in refs)
                    if d < LIMIAR_COR:
                        cont[nome] += 1
                        n += 1
            out[(c, r)] = {k: v / max(n, 1) for k, v in cont.items()}
    return out


def terreno(img):
    f = fracoes(img)
    t = {k: (T_LAND if v['terra'] >= 0.5 else None) for k, v in f.items()}
    for k, v in f.items():
        if t[k] is not None:
            continue
        if v['bacia'] >= 0.10:
            t[k] = T_OIL
        elif any(t[n] == T_LAND for n in vizinhos(*k)):
            t[k] = T_SHALLOW
        elif v['rasa'] + v['plat'] >= 0.25:
            t[k] = T_SHELF
        else:
            t[k] = T_DEEP
    grade = [[t[(c, r)] for c in range(COLS)] for r in range(LINHAS)]

    # Área da carta anterior: terreno do jogo base.
    for r in range(BASE_H):
        for c in range(BASE_W):
            grade[r + DR][c + DC] = TERRENO_BASE[r][c]
    # Borda oeste do jogo base (colunas A–B antigas): águas rasas sem terra
    # vizinha supunham a costa fora do tabuleiro; com a costa visível, são
    # plataforma.
    for r in range(BASE_H):
        for c in range(2):
            cc, rr = c + DC, r + DR
            if grade[rr][cc] == T_SHALLOW and not any(
                    grade[y][x] == T_LAND for x, y in vizinhos(cc, rr)):
                grade[rr][cc] = T_SHELF
    return grade


def hex_de(x, y):
    return min(((x - centro(c, r)[0]) ** 2 + (y - centro(c, r)[1]) ** 2, c, r)
               for c in range(COLS) for r in range(LINHAS))[1:]


def linhas_js(grade):
    return [f"  [{','.join(map(str, row))}],  // {r + 1:2d}" for r, row in enumerate(grade)]


def conferir(grade):
    """Compara com a matriz de shared/board.js."""
    raiz = Path(__file__).resolve().parent.parent
    texto = (raiz / 'shared' / 'board.js').read_text(encoding='utf-8')
    corpo = texto[texto.index('const TERRAIN_MAP = ['):]
    corpo = corpo[:corpo.index('];')]
    lidas = [list(map(int, m.group(1).split(',')))
             for m in re.finditer(r'\[([0-9,]+)\]', corpo)]
    return lidas == grade


def main(argv):
    modo = argv[1] if argv[1].startswith('--') else None
    caminho = argv[-1]
    img = carregar(caminho)
    if modo == '--calibrar':
        nota, x0, y0, raio = calibrar(img)
        print(f'X0={x0:.2f} Y0={y0:.2f} R={raio:.2f} (nota {nota:.4f})')
        return 0
    grade = terreno(img)
    if modo == '--conferir':
        igual = conferir(grade)
        print('shared/board.js confere com a carta' if igual else 'DIVERGE de shared/board.js')
        return 0 if igual else 1
    print('const TERRAIN_MAP = [')
    print('\n'.join(linhas_js(grade)))
    print('];\n')
    for nome, (x, y) in INFRA_CARTA.items():
        c, r = hex_de(x, y)
        print(f'{nome:36s} {letra(c)}-{r + 1:<3d} col={c:2d} row={r:2d} terreno={grade[r][c]}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
