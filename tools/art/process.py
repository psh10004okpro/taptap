#!/usr/bin/env python3
"""생성 원본(raw/)을 게임 텍스처 규격으로 후처리해 public/assets/ 에 배치.

  python3 tools/art/process.py [키 필터...]

규격은 BootScene 절차 텍스처와 1:1 로 맞춘다 (씬 코드는 크기 무수정).
"""
from __future__ import annotations  # 3.9 호환 (X | None 어노테이션)

import json
import os
import sys
from collections import deque

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
# ART_RAW: generate.py 와 같은 환경변수. 스타일 후보를 별도 폴더에 뽑아 두고
# 확정되면 그 폴더를 그대로 후처리한다 (기존 원본을 덮지 않는다).
RAW = os.environ.get("ART_RAW") or os.path.join(HERE, "raw")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "public", "assets"))

# key prefix -> (kind, w, h)
SPECS: list[tuple[str, str, int, int]] = [
    ("bg-zone", "bg", 720, 1280),
    # src/config.ts 의 MONSTER_SIZE / BOSS_SIZE 와 반드시 같아야 한다
    ("monster", "sprite", 280, 240),
    ("boss", "sprite", 340, 300),
    ("hero", "circle", 42, 42),
    ("pet", "circle", 52, 52),
    ("skill", "circle", 76, 76),
    ("artifact", "icon", 44, 44),
    ("equip", "icon", 44, 44),
    ("coin", "icon", 28, 28),
    ("fairy", "icon", 48, 48),
]


def spec_for(key: str) -> tuple[str, int, int] | None:
    best = None
    for prefix, kind, w, h in SPECS:
        if key.startswith(prefix) and (best is None or len(prefix) > len(best[0])):
            best = (prefix, kind, w, h)
    return best[1:] if best else None


def _flood_key(img: Image.Image, tol: int) -> Image.Image:
    """가장자리에서 이어진, 코너색과 tol 이내인 픽셀만 투명화."""
    out = img.convert("RGBA")
    px = out.load()
    w, h = out.size
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
    return out


def _stats(img: Image.Image) -> tuple[float, float]:
    """(불투명 비율, 가장자리 테두리의 투명 비율)."""
    a = img.getchannel("A")
    w, h = img.size
    total = w * h
    opaque = sum(1 for v in a.getdata() if v > 0)
    ring = []
    for x in range(0, w, 3):
        ring.append(a.getpixel((x, 1)))
        ring.append(a.getpixel((x, h - 2)))
    for y in range(0, h, 3):
        ring.append(a.getpixel((1, y)))
        ring.append(a.getpixel((w - 2, y)))
    clear = sum(1 for v in ring if v == 0) / max(1, len(ring))
    return opaque / total, clear


def edge_chroma_key(img: Image.Image, tol: int = 28) -> Image.Image:
    """알파가 없을 때 배경 제거.

    배경이 완전한 단색이 아니면(실사풍 렌더의 하늘·비네팅) 낮은 허용오차로는
    회색 조각이 남고, 그렇다고 이웃 색을 따라 걷게 하면 피사체 안쪽까지 먹는다.
    그래서 **허용오차를 단계적으로 올리며 결과를 검사**한다:
      - 가장자리 테두리가 98% 이상 투명해졌는가 (배경이 실제로 지워졌는가)
      - 피사체가 5% 이상 남아 있는가 (너무 많이 먹지 않았는가)
    두 조건을 만족하는 첫 값을 쓰고, 없으면 가장 보수적인 결과를 쓴다.
    """
    best = None
    for t in (tol, 40, 52, 66):
        cand = _flood_key(img, t)
        opaque, clear = _stats(cand)
        if best is None:
            best = cand
        if clear >= 0.98 and opaque >= 0.05:
            return cand
        if opaque < 0.05:      # 더 올리면 피사체가 사라진다
            break
        best = cand
    return best if best is not None else img.convert("RGBA")


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
            # 배경은 알파가 필요 없다 — jpg 로 저장해 용량을 1/10 로 줄인다
            # (png 2MB x 10 장이면 첫 로딩만 20MB — 모바일에서 못 쓴다)
            out = crop_resize(img, w, h)
            out.convert("RGB").save(os.path.join(OUT, key + ".jpg"),
                                    "JPEG", quality=82, optimize=True, progressive=True)
            stale = os.path.join(OUT, key + ".png")
            if os.path.exists(stale):
                os.remove(stale)
            n += 1
            print(f"{key}: {kind} {w}x{h} (jpg)")
            continue
        if kind == "sprite":
            out = fit_bottom(img, w, h)
        elif kind == "circle":
            out = circle_crop(img, w, h)
        else:
            out = fit_center(img, w, h)
        out.save(os.path.join(OUT, key + ".png"), optimize=True)
        n += 1
        print(f"{key}: {kind} {w}x{h}")

    # manifest.json 갱신 — BootScene 이 로드할 키의 단일 출처.
    # files 에는 png 가 아닌 키만 적는다 (BootScene 기본값이 <key>.png).
    files = {}
    keys = []
    for fn in sorted(os.listdir(OUT)):
        stem, ext = os.path.splitext(fn)
        if ext not in (".png", ".jpg"):
            continue
        keys.append(stem)
        if ext != ".png":
            files[stem] = fn
    keys.sort()
    with open(os.path.join(OUT, "manifest.json"), "w") as mf:
        json.dump({"keys": keys, "files": files}, mf, ensure_ascii=False, indent=0)
    print(f"done: {n} -> {OUT} (manifest: {len(keys)} keys, {len(files)} non-png)")


if __name__ == "__main__":
    main()
