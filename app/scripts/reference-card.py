#!/usr/bin/env python3
"""
Gera o cartão "Referência Bibliográfica" dos créditos da Etapa 5, no mesmo formato dos cartões de
logo (credits-from-video.py): cartão branco arredondado de 1200×800, título em vermelho da marca e
texto em marinho (padrão da UI).

    python app/scripts/reference-card.py

Saída: Creditos/derivados/cartao_0_referencia.png
Fonte tipográfica: Segoe UI (Windows), a mesma da interface no Windows. Requer: Pillow.
O título do periódico vai em negrito (ABNT).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Creditos" / "derivados" / "cartao_0_referencia.png"
FONTS = Path("C:/Windows/Fonts")

W, H, R = 1200, 800, 64
PAD_X = 96
ACCENT = (145, 9, 12)  # --ui-accent
TEXT = (28, 37, 48)  # --ui-text
MUTED = (93, 104, 116)  # --ui-muted

TITLE = "REFERÊNCIA BIBLIOGRÁFICA"
# (texto, negrito) — formato ABNT.
REFERENCE = [
    ("SANTOS, Rafael Martins de Oliveira; RODRIGUES, Amanda Goulart; DAL’ BÓ, Patrick Führ. ", False),
    ("Caracterização Petrográfica dos Calcários Ornamentais da Formação Caatinga (BA). ", False),
    ("Anuário do Instituto de Geociências", True),
    # NBSP ( ) mantém "v. 43", "n. 2" e "p. 139–149" na mesma linha.
    (", v. 43, n. 2, p. 139–149, 2020.", False),
]
DOI = "DOI: 10.11137/2020_2_139_149"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def wrap(runs, fonts, max_w):
    """
    Quebra (texto, negrito) em linhas. Cada palavra é uma lista de pedaços [(texto, negrito)], para
    que pontuação colada a um trecho em negrito (ex.: "Geociências,") não seja separada dele.
    """
    words: list[list[tuple[str, bool]]] = []
    prev_ends_space = True
    for text, b in runs:
        for k, w in enumerate(text.split(" ")):
            if not w:
                continue
            if k == 0 and not prev_ends_space and words:
                words[-1].append((w, b))  # colado à palavra anterior
            else:
                words.append([(w, b)])
        prev_ends_space = text.endswith(" ")
    space = fonts[False].getlength(" ")
    wlen = lambda word: sum(fonts[b].getlength(t) for t, b in word)
    lines, line, width = [], [], 0.0
    for word in words:
        wl = wlen(word)
        add = wl if not line else space + wl
        if line and width + add > max_w:
            lines.append(line)
            line, width = [word], wl
        else:
            line.append(word)
            width += add
    if line:
        lines.append(line)
    return lines, space


def main() -> None:
    S = 2  # superamostragem para bordas suaves
    img = Image.new("RGBA", (W * S, H * S), (255, 255, 255, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, W * S - 1, H * S - 1), R * S, fill=(255, 255, 255, 255))

    size = 40
    fonts = {False: font("segoeui.ttf", size * S), True: font("segoeuib.ttf", size * S)}
    lines, space = wrap(REFERENCE, fonts, (W - 2 * PAD_X) * S)
    lh = round(size * 1.45) * S
    # Altura do bloco (título 64 + fio 54 + linhas + 18 + DOI) → centraliza na vertical.
    block = (64 + 54 + 18) * S + lh * len(lines) + 32 * S * 1.4
    top = (H * S - block) / 2

    # Título: caixa alta espaçada em vermelho + fio vermelho curto.
    tf = font("segoeuib.ttf", 34 * S)
    x, y = PAD_X * S, top
    for ch in TITLE:
        d.text((x, y), ch, font=tf, fill=ACCENT)
        x += tf.getlength(ch) + 0.16 * 34 * S
    y += 64 * S
    d.rounded_rectangle((PAD_X * S, y, (PAD_X + 72) * S, y + 6 * S), 3 * S, fill=ACCENT)
    y += 54 * S

    # Referência.
    for line in lines:
        x = PAD_X * S
        for i, word in enumerate(line):
            if i:
                x += space
            for t, b in word:
                d.text((x, y), t, font=fonts[b], fill=TEXT)
                x += fonts[b].getlength(t)
        y += lh

    y += 18 * S
    d.text((PAD_X * S, y), DOI, font=font("segoeui.ttf", 32 * S), fill=MUTED)
    bottom = y + 32 * S * 1.4
    assert bottom < (H - 60) * S, f"texto não cabe no cartão ({bottom / S:.0f}px)"

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.resize((W, H), Image.LANCZOS).save(OUT, optimize=True)
    print(f"-> {OUT.relative_to(ROOT)} ({len(lines)} linhas)")


if __name__ == "__main__":
    main()
