#!/usr/bin/env python3
"""
Gera os assets de marca do app a partir da logo original da Geologar (que não é alterada).

    python app/scripts/brand-assets.py

Fonte:  Marca/LogoGeologar.png   (cópia de Assets/LogoGeologar.png do drive, 800×800 RGBA)

1. Derivado com borda limpa → Marca/derivados/LogoGeologar_borda-limpa.png
   O original tem resíduo de chroma key verde nos pixels SEMITRANSPARENTES da borda do círculo
   (anel de raio ~379–390 px), visível como um contorno verde-claro. Esses pixels recebem a cor
   do disco (branco), mantendo o alpha. Pixels opacos (inclusive o brilho esverdeado do globo)
   não são tocados.
2. Saídas do app (redimensionadas com alpha pré-multiplicado → sem franja verde):
   app/public/brand/logo-geologar.png (400 px), favicon-32.png, apple-touch-icon.png (180),
   icon-192.png.
Requer: Pillow, numpy.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "Marca" / "LogoGeologar.png"
DERIVED = ROOT / "Marca" / "derivados" / "LogoGeologar_borda-limpa.png"
OUT = ROOT / "app" / "public" / "brand"


def clean_edge(img: Image.Image) -> Image.Image:
    a = np.array(img.convert("RGBA"))
    alpha = a[..., 3]
    edge = (alpha > 0) & (alpha < 255)
    a[edge, :3] = 255  # borda do disco branco
    a[alpha == 0, :3] = 255  # cor "escondida" sob alpha 0 também branca (evita vazamento ao filtrar)
    print(f"  pixels de borda limpos: {int(edge.sum())}")
    return Image.fromarray(a, "RGBA")


def resize(img: Image.Image, size: int) -> Image.Image:
    # Pré-multiplica antes de redimensionar para a cor sob pixels transparentes não vazar.
    return img.convert("RGBa").resize((size, size), Image.LANCZOS).convert("RGBA")


def main() -> None:
    DERIVED.parent.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    clean = clean_edge(Image.open(SRC))
    clean.save(DERIVED, optimize=True)
    print(f"{SRC.name} -> {DERIVED.relative_to(ROOT)}")
    for name, size in [("logo-geologar.png", 400), ("favicon-32.png", 32), ("apple-touch-icon.png", 180), ("icon-192.png", 192)]:
        resize(clean, size).save(OUT / name, optimize=True)
        print(f"  app/public/brand/{name} ({size}px)")


if __name__ == "__main__":
    main()
