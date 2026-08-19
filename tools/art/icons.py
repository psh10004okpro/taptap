#!/usr/bin/env python3
"""앱 아이콘 · 스플래시 · 스토어 등록 이미지 생성 (generate.py 와 같은 STYLE).

  export ELICE_API_KEY=... ELICE_BASE_URL=...
  python3 tools/art/icons.py

출력
  tools/art/raw/appicon.png                       원본 (있으면 건너뜀)
  android/.../mipmap-*/ic_launcher[_round|_foreground].png
  android/.../values/ic_launcher_background.xml    어댑티브 배경색
  android/.../drawable*/splash.png                 기존 버킷 크기에 맞춰 재생성
  store/icon-512.png                               Play 등록용 아이콘
  store/feature-1024x500.png                       Play 피처 그래픽
  public/icon-192.png, public/icon-512.png         웹(PWA)·파비콘용

기본 Capacitor 아이콘(파란 X)은 스토어 심사 이전에 반드시 교체돼야 한다.
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import STYLE, gen_one  # noqa: E402  (같은 API·재시도 로직 재사용)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(HERE, "raw")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
STORE = os.path.join(ROOT, "store")
PUBLIC = os.path.join(ROOT, "public")

BG = (13, 10, 26)  # index.html / capacitor.config.ts 의 #0d0a1a 와 동일

ICON_PROMPT = (
    "app icon for a dark fantasy idle tap RPG: a single massive horned demon skull "
    "emblem facing forward, ivory horns curving upward, glowing molten orange eyes, "
    "centered crest composition filling the frame, thick readable silhouette that "
    "survives at 48 pixels, deep indigo-black background with a subtle orange rim "
    "glow, no text, no letters, no border, " + STYLE
)

# 런처 아이콘: 레거시 정사각/원형 (dp) 과 어댑티브 전경(108dp)
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
LEGACY_DP = 48
ADAPTIVE_DP = 108
# 어댑티브는 바깥 25% 가 잘린다 — 안전영역(66dp) 안에 내용을 넣는다
SAFE_RATIO = 66 / 108


def load_master() -> Image.Image:
    p = os.path.join(RAW, "appicon.png")
    if not os.path.exists(p):
        os.makedirs(RAW, exist_ok=True)
        key, status = gen_one({"key": "appicon", "prompt": ICON_PROMPT,
                               "size": "1024x1024", "quality": "medium",
                               "background": None})
        print(f"appicon: {status}")
        if not os.path.exists(p):
            sys.exit("아이콘 원본 생성 실패")
    return Image.open(p).convert("RGB")


def square(master: Image.Image, size: int) -> Image.Image:
    side = min(master.size)
    m = master.crop(((master.width - side) // 2, (master.height - side) // 2,
                     (master.width + side) // 2, (master.height + side) // 2))
    return m.resize((size, size), Image.LANCZOS)


def rounded(img: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    out = img.convert("RGBA")
    mask = Image.new("L", out.size, 0)
    r = round(out.width * radius_ratio)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, out.width - 1, out.height - 1), r, fill=255)
    out.putalpha(mask)
    return out


def circle(img: Image.Image) -> Image.Image:
    out = img.convert("RGBA")
    mask = Image.new("L", out.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, out.width - 1, out.height - 1), fill=255)
    out.putalpha(mask)
    return out


def disc(master: Image.Image, size: int, inset: float = 0.84) -> Image.Image:
    """원형 판 위에 엠블럼을 축소 배치 — 원형 마스크로 뿔이 잘리는 것을 막는다."""
    plate = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    d.ellipse((0, 0, size - 1, size - 1), fill=BG + (255,))
    art = round(size * inset)
    plate.alpha_composite(circle(square(master, art)),
                          ((size - art) // 2, (size - art) // 2))
    # 테두리 한 줄 — 어두운 배경 위에서 아이콘 경계가 사라지지 않게
    d.ellipse((0, 0, size - 1, size - 1), outline=(196, 120, 46, 210),
              width=max(1, size // 48))
    return plate


def adaptive_foreground(master: Image.Image, size: int) -> Image.Image:
    """108dp 캔버스 중앙 66dp 안에 아이콘을 넣는다 (배경은 단색 레이어가 담당)."""
    inner = round(size * SAFE_RATIO)
    art = disc(master, inner)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(art, ((size - inner) // 2, (size - inner) // 2))
    return canvas


def write_launcher(master: Image.Image) -> int:
    n = 0
    for name, mult in DENSITIES.items():
        d = os.path.join(RES, f"mipmap-{name}")
        if not os.path.isdir(d):
            continue
        legacy = round(LEGACY_DP * mult)
        rounded(square(master, legacy)).save(os.path.join(d, "ic_launcher.png"))
        disc(master, legacy).save(os.path.join(d, "ic_launcher_round.png"))
        adaptive_foreground(master, round(ADAPTIVE_DP * mult)).save(
            os.path.join(d, "ic_launcher_foreground.png"))
        n += 3
    # 어댑티브 배경: 흰색(기본값) → 게임 배경색
    p = os.path.join(RES, "values", "ic_launcher_background.xml")
    with open(p, "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                '    <color name="ic_launcher_background">#0D0A1A</color>\n</resources>\n')
    return n


def splash_canvas(master: Image.Image, w: int, h: int) -> Image.Image:
    """단색 배경 + 중앙 엠블럼 + 은은한 광량. 모든 버킷에서 크롭 사고가 없다."""
    canvas = Image.new("RGB", (w, h), BG)
    side = round(min(w, h) * 0.42)
    art = rounded(square(master, side), 0.24)
    # 뒤쪽 글로우
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gr = round(side * 0.78)
    ImageDraw.Draw(glow).ellipse(
        (w // 2 - gr, h // 2 - gr, w // 2 + gr, h // 2 + gr), fill=(120, 52, 18, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=side * 0.18))
    canvas = Image.alpha_composite(canvas.convert("RGBA"), glow)
    canvas.alpha_composite(art, ((w - side) // 2, (h - side) // 2))
    return canvas.convert("RGB")


def write_splash(master: Image.Image) -> int:
    n = 0
    for root, _dirs, files in os.walk(RES):
        if "splash.png" not in files:
            continue
        p = os.path.join(root, "splash.png")
        with Image.open(p) as cur:
            w, h = cur.size
        splash_canvas(master, w, h).save(p)
        n += 1
    return n


def write_store(master: Image.Image) -> None:
    os.makedirs(STORE, exist_ok=True)
    # Play 등록 아이콘: 512x512, 알파 없음, 라운딩은 스토어가 입힌다
    square(master, 512).save(os.path.join(STORE, "icon-512.png"))
    # 피처 그래픽 1024x500 — 아이콘을 왼쪽에 두고 나머지는 어두운 여백(문구는 스토어에서)
    fg = Image.new("RGB", (1024, 500), BG)
    art = rounded(square(master, 380), 0.24)
    glow = Image.new("RGBA", (1024, 500), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((60, -40, 700, 560), fill=(120, 52, 18, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=70))
    fgc = Image.alpha_composite(fg.convert("RGBA"), glow)
    fgc.alpha_composite(art, (170, 60))
    fgc.convert("RGB").save(os.path.join(STORE, "feature-1024x500.png"))
    # 웹/PWA
    rounded(square(master, 512)).save(os.path.join(PUBLIC, "icon-512.png"))
    rounded(square(master, 192)).save(os.path.join(PUBLIC, "icon-192.png"))


def main() -> None:
    master = load_master()
    n = write_launcher(master)
    s = write_splash(master)
    write_store(master)
    print(f"런처 {n}장, 스플래시 {s}장, 스토어/웹 아이콘 4장 생성")


if __name__ == "__main__":
    main()
