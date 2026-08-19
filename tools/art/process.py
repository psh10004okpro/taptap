#!/usr/bin/env python3
"""생성 원본(raw/)을 게임 텍스처 규격으로 후처리해 public/assets/ 에 배치.

  python3 tools/art/process.py [키 필터...]

규격은 BootScene 절차 텍스처와 1:1 로 맞춘다 (씬 코드는 크기 무수정).
"""
import json
import os
import sys
from collections import deque

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "assets"))

# key prefix -> (kind, w, h)
SPECS: list[tuple[str, str, int, int]] = [
    ("bg-zone", "bg", 720, 1280),
    ("monster", "sprite", 200, 170),
    ("boss", "sprite", 280, 250),
    ("hero", "circle", 42, 42),
    ("skill", "circle", 76, 76),
    ("artifact", "icon", 44, 44),
    ("equip", "icon", 44, 44),
    ("coin", "icon", 28, 28),
]


def spec_for(key: str) -> tuple[str, int, int] | None:
    best = None
    for prefix, kind, w, h in SPECS:
        if key.startswith(prefix) and (best is None or len(prefix) > len(best[0])):
            best = (prefix, kind, w, h)
    return best[1:] if best else None


def edge_chroma_key(img: Image.Image, tol: int = 28) -> Image.Image:
    """알파가 없을 때: 가장자리에서 이어진 배경색 픽셀만 투명화 (내부 동일색 보존)."""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def is_bg(p: tuple) -> bool:
        return all(abs(p[i] - bg[i]) <= tol for i in range(3))

    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(px[x, y]):
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(px[x, y]):
                q.append((x, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        p = px[x, y]
        if not is_bg(p):
            continue
        px[x, y] = (p[0], p[1], p[2], 0)
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    return img


def has_alpha(img: Image.Image) -> bool:
    return img.mode == "RGBA" and img.getextrema()[3][0] < 250


def fit_bottom(img: Image.Image, w: int, h: int, pad: float = 0.04) -> Image.Image:
    """투명 여백 트림 후 캔버스에 바닥 정렬로 contain."""
    if not has_alpha(img):
        img = edge_chroma_key(img)
    box = img.getbbox()
    if box:
        img = img.crop(box)
    scale = min(w * (1 - pad * 2) / img.width, h * (1 - pad) / img.height)
    img = img.resize((max(1, round(img.width * scale)),
                      max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(img, ((w - img.width) // 2, h - img.height - round(h * pad * 0.5)), img)
    return canvas


def fit_center(img: Image.Image, w: int, h: int, pad: float = 0.03) -> Image.Image:
    if not has_alpha(img):
        img = edge_chroma_key(img)
    box = img.getbbox()
    if box:
        img = img.crop(box)
    scale = min(w * (1 - pad * 2) / img.width, h * (1 - pad * 2) / img.height)
    img = img.resize((max(1, round(img.width * scale)),
                      max(1, round(img.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(img, ((w - img.width) // 2, (h - img.height) // 2), img)
    return canvas


def circle_crop(img: Image.Image, w: int, h: int) -> Image.Image:
    """중앙 정사각 크롭 → 원형 마스크 (영웅/스킬 아이콘)."""
    img = img.convert("RGBA")
    side = min(img.size)
    img = img.crop(((img.width - side) // 2, max(0, (img.height - side) // 2 - side // 10),
                    (img.width + side) // 2, max(0, (img.height - side) // 2 - side // 10) + side))
    big = w * 8
    img = img.resize((big, big), Image.LANCZOS)
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    img.putalpha(mask)
    return img.resize((w, h), Image.LANCZOS)


def crop_resize(img: Image.Image, w: int, h: int) -> Image.Image:
    """비율 맞춰 중앙 크롭 후 리사이즈 (배경)."""
    img = img.convert("RGB")
    target = w / h
    cur = img.width / img.height
    if cur > target:
        cw = round(img.height * target)
        img = img.crop(((img.width - cw) // 2, 0, (img.width + cw) // 2, img.height))
    else:
        ch = round(img.width / target)
        img = img.crop((0, (img.height - ch) // 2, img.width, (img.height + ch) // 2))
    return img.resize((w, h), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    filters = sys.argv[1:]
    files = sorted(f for f in os.listdir(RAW) if f.endswith(".png"))
    n = 0
    for f in files:
        key = f[:-4]
        if filters and not any(key.startswith(x) for x in filters):
            continue
        spec = spec_for(key)
        if not spec:
            print(f"skip (no spec): {key}")
            continue
        kind, w, h = spec
        img = Image.open(os.path.join(RAW, f))
        if kind == "bg":
            out = crop_resize(img, w, h)
        elif kind == "sprite":
            out = fit_bottom(img, w, h)
        elif kind == "circle":
            out = circle_crop(img, w, h)
        else:
            out = fit_center(img, w, h)
        out.save(os.path.join(OUT, f), optimize=True)
        n += 1
        print(f"{key}: {kind} {w}x{h}")

    # manifest.json 갱신 — BootScene 이 로드할 키의 단일 출처
    keys = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith(".png"))
    with open(os.path.join(OUT, "manifest.json"), "w") as mf:
        json.dump({"keys": keys}, mf, ensure_ascii=False, indent=0)
    print(f"done: {n} -> {OUT} (manifest: {len(keys)} keys)")


if __name__ == "__main__":
    main()
