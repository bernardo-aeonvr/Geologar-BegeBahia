#!/usr/bin/env python3
"""
Gera uma versão com alpha correto de um pop-up exportado SEM transparência (fundo preto fora do
cartão arredondado). O arquivo original não é alterado.

    python scripts/black-to-alpha.py "<origem.png>" "<destino.png>"

Como funciona:
  1. "Balde de tinta" a partir das bordas da imagem: marca como fundo só o preto CONECTADO à borda
     (o interior escuro do cartão não é tocado, porque o contorno claro do cartão é um anel fechado).
  2. Fundo → alpha 0.
  3. Pixels de antialias do contorno (vizinhos do fundo) → alpha proporcional ao brilho em relação
     ao contorno, com a cor "desmultiplicada" — borda lisa, sem halo escuro.
  4. Recorta o resultado ao retângulo do cartão (sem margens transparentes inúteis).
Requer: Pillow, numpy.
"""
import sys
from collections import deque

import numpy as np
from PIL import Image

BG_MAX = 100  # canal máximo considerado "preto de fundo" (fundo medido: 0–6; contorno: ~233)


def main(src: str, dst: str) -> None:
    rgb = np.array(Image.open(src).convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape
    mx = rgb.max(-1)

    # 1. flood fill a partir de todas as bordas
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if mx[y, x] < BG_MAX and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if mx[y, x] < BG_MAX and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and mx[ny, nx] < BG_MAX:
                bg[ny, nx] = True
                q.append((ny, nx))

    # 2–3. alpha: fundo e seus vizinhos imediatos (antialias externo do contorno) recebem alpha
    # proporcional ao brilho; o restante fica opaco.
    edge = bg.copy()
    edge[1:, :] |= bg[:-1, :]
    edge[:-1, :] |= bg[1:, :]
    edge[:, 1:] |= bg[:, :-1]
    edge[:, :-1] |= bg[:, 1:]
    outline = np.percentile(mx[edge & ~bg], 90) if (edge & ~bg).any() else 233.0
    alpha = np.ones((h, w), np.float32)
    a = np.clip(mx / outline, 0, 1)
    alpha[edge] = a[edge]
    alpha[bg & (mx < 12)] = 0.0
    out = rgb.copy()
    nz = edge & (alpha > 0)
    out[nz] = np.clip(rgb[nz] / alpha[nz][:, None], 0, 255)

    rgba = np.dstack([out, alpha * 255]).round().astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")

    # 4. recorta ao retângulo do conteúdo visível
    ys, xs = np.where(alpha > 0.01)
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    img.save(dst, optimize=True)

    inner = alpha[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4]
    print(f"{src} -> {dst}")
    print(f"  fundo transparente: {int((alpha == 0).sum())} px · contorno ~{outline:.0f}")
    print(f"  interior do cartão opaco: {bool((inner == 1).all())} · tamanho final {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
