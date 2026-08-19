#!/usr/bin/env python3
"""public/assets/ 의 후처리 결과를 실제 게임 크기로 한 장에 모아 검수한다.

  python3 tools/art/contact.py [출력경로]

배경은 체커보드 — 크로마키 실패로 남은 배경 사각형이 바로 눈에 띈다.
배경(bg-zone*)은 축소 썸네일, 나머지는 게임에서 그려지는 실제 픽셀 크기.
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "..", "public", "assets"))

COLS = 12
CELL = 96          # 셀 한 변 (스프라이트는 이 안에 실제 크기로 놓인다)
BG_THUMB = (108, 192)  # 배경 썸네일 (720x1280 의 15%)
PAD = 8


def checker(size: tuple[int, int], step: int = 8) -> Image.Image:
    img = Image.new("RGBA", size, (56, 56, 62, 255))
    d = ImageDraw.Draw(img)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2 == 0:
                d.rectangle((x, y, x + step - 1, y + step - 1), fill=(72, 72, 80, 255))
    return img


def order_key(name: str) -> tuple:
    """bg-zone0, monster0 … 숫자 접미를 사람 순서로."""
    head = name.rstrip("0123456789")
    tail = name[len(head):]
    group = ["bg-zone", "monster", "boss", "hero", "skill", "artifact", "equip", "coin"]
    gi = next((i for i, g in enumerate(group) if name.startswith(g)), len(group))
    return (gi, head, int(tail) if tail else -1)


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "contact.png")
    files = {os.path.splitext(f)[0]: f for f in os.listdir(ASSETS)
             if os.path.splitext(f)[1] in (".png", ".jpg")}
    names = sorted(files, key=order_key)
    if not names:
        sys.exit(f"에셋이 없습니다: {ASSETS}")

    bgs = [n for n in names if n.startswith("bg-zone")]
    rest = [n for n in names if not n.startswith("bg-zone")]

    bg_rows = (len(bgs) + COLS - 1) // COLS
    rest_rows = (len(rest) + COLS - 1) // COLS
    w = COLS * (CELL + PAD) + PAD
    h = PAD + bg_rows * (BG_THUMB[1] + PAD + 14) + rest_rows * (CELL + PAD + 14) + PAD
    sheet = checker((w, h))
    d = ImageDraw.Draw(sheet)

    y = PAD
    for row_start in range(0, len(bgs), COLS):
        row = bgs[row_start:row_start + COLS]
        for i, name in enumerate(row):
            x = PAD + i * (CELL + PAD)
            img = Image.open(os.path.join(ASSETS, files[name])).convert("RGBA")
            img = img.resize(BG_THUMB, Image.LANCZOS)
            sheet.alpha_composite(img, (x + (CELL - BG_THUMB[0]) // 2, y))
            d.text((x, y + BG_THUMB[1] + 2), name, fill=(230, 230, 235, 255))
        y += BG_THUMB[1] + PAD + 14

    for row_start in range(0, len(rest), COLS):
        row = rest[row_start:row_start + COLS]
        for i, name in enumerate(row):
            x = PAD + i * (CELL + PAD)
            img = Image.open(os.path.join(ASSETS, files[name])).convert("RGBA")
            if img.width > CELL or img.height > CELL:
                img.thumbnail((CELL, CELL), Image.LANCZOS)
            sheet.alpha_composite(img, (x + (CELL - img.width) // 2,
                                        y + (CELL - img.height) // 2))
            d.text((x, y + CELL + 2), name, fill=(230, 230, 235, 255))
        y += CELL + PAD + 14

    sheet.convert("RGB").save(out, quality=94)
    print(f"{len(names)} assets -> {out}")


if __name__ == "__main__":
    main()
