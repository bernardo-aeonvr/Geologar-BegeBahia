#!/usr/bin/env python3
"""
Extrai os logos dos créditos do vídeo de encerramento da experiência antiga (fundo verde de chroma
key) como PNGs com transparência. O vídeo original não é alterado.

    python app/scripts/credits-from-video.py

Fonte:  Creditos/T_encerramento.mp4  (cópia de Assets/Vídeo/T_encerramento.mp4 do drive, 1920×1080)
        O vídeo mostra 4 logos em sequência com crossfade: GeoLogar, MGB, ExpoGeo Virtual, CNPq.
Saída:  Creditos/derivados/credito_<n>_<nome>.png, recortados ao conteúdo.
        O GeoLogar NÃO é extraído: o app usa a logo oficial (Marca/derivados/LogoGeologar_borda-limpa.png),
        que tem resolução maior.
        Creditos/derivados/cartao_<n>_<nome>.png: cada logo centralizado num cartão branco arredondado
        de mesmo tamanho (padrão branco da UI). Sem o cartão, o texto preto do CNPq some sobre o céu.

Como funciona, para cada logo:
  1. Pega um quadro em que o logo está com opacidade total (fora dos crossfades).
  2. Alpha pela distância ao verde no plano CbCr, com rampa suave nas bordas (antialias).
  3. Despill: g = min(g, max(r, b)), que tira o halo verde da compressão.
  4. Recorta ao retângulo do conteúdo visível, com 4 px de margem.
Requer: ffmpeg no PATH, Pillow, numpy.
"""
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "Creditos" / "T_encerramento.mp4"
OUT = ROOT / "Creditos" / "derivados"

# (tempo do quadro em s, nome) — quadros no meio de cada logo, fora dos crossfades.
LOGOS = [(2.25, "2_mgb_museu-geologico-da-bahia"), (3.75, "3_expogeo-virtual"), (5.0, "4_cnpq")]

# Distância CbCr ao verde-chave: até LOW = fundo (alpha 0); a partir de HIGH = opaco.
LOW, HIGH = 0.30, 0.45


def frame(t: float) -> np.ndarray:
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "f.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(SRC), "-frames:v", "1", str(p)], check=True)
        return np.array(Image.open(p).convert("RGB")).astype(np.float32) / 255.0


def cbcr(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    return np.stack([(b - y) * 0.564, (r - y) * 0.713], -1)


def key(rgb: np.ndarray) -> Image.Image:
    bg = rgb[:8, :8].reshape(-1, 3).mean(0)  # canto = fundo verde
    d = np.linalg.norm(cbcr(rgb) - cbcr(bg[None, None, :]), axis=-1)
    a = np.clip((d - LOW) / (HIGH - LOW), 0, 1)
    a = a * a * (3 - 2 * a)  # smoothstep
    out = rgb.copy()
    out[..., 1] = np.minimum(out[..., 1], np.maximum(out[..., 0], out[..., 2]))  # despill
    rgba = np.dstack([out, a])
    ys, xs = np.where(a > 0.02)
    m = 4
    rgba = rgba[max(ys.min() - m, 0) : ys.max() + 1 + m, max(xs.min() - m, 0) : xs.max() + 1 + m]
    return Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA")


GEOLOGAR = ROOT / "Marca" / "derivados" / "LogoGeologar_borda-limpa.png"
CARD_W, CARD_H, CARD_R = 1200, 800, 64
LOGO_BOX = (940, 560)  # área máxima do logo dentro do cartão


def card(logo: Image.Image) -> Image.Image:
    from PIL import ImageDraw

    scale = min(LOGO_BOX[0] / logo.width, LOGO_BOX[1] / logo.height)
    # Redimensiona com alpha pré-multiplicado (sem vazamento de cor das bordas transparentes).
    lg = logo.convert("RGBa").resize((round(logo.width * scale), round(logo.height * scale)), Image.LANCZOS).convert("RGBA")
    # Superamostragem 4× para a borda arredondada sair suave.
    mask = Image.new("L", (CARD_W * 4, CARD_H * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, CARD_W * 4 - 1, CARD_H * 4 - 1), CARD_R * 4, fill=255)
    out = Image.new("RGBA", (CARD_W, CARD_H), (255, 255, 255, 0))
    out.putalpha(mask.resize((CARD_W, CARD_H), Image.LANCZOS))
    white = Image.new("RGBA", (CARD_W, CARD_H), (255, 255, 255, 255))
    white.putalpha(out.getchannel("A"))
    white.alpha_composite(lg, ((CARD_W - lg.width) // 2, (CARD_H - lg.height) // 2))
    return white


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    logos = [("1_geologar", Image.open(GEOLOGAR).convert("RGBA"))]
    for t, name in LOGOS:
        img = key(frame(t))
        dst = OUT / f"credito_{name}.png"
        img.save(dst, optimize=True)
        print(f"{SRC.name} @ {t}s -> {dst.relative_to(ROOT)} ({img.size[0]}x{img.size[1]})")
        logos.append((name, img))
    for name, img in logos:
        dst = OUT / f"cartao_{name}.png"
        card(img).save(dst, optimize=True)
        print(f"  cartão -> {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
