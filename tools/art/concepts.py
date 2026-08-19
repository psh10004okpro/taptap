#!/usr/bin/env python3
"""디자인 컨셉 시안 생성 — 같은 피사체를 스타일만 바꿔 뽑고 비교 시트를 만든다.

  export ELICE_API_KEY=...
  export ELICE_BASE_URL=https://mlapi.run/<endpoint-id>/v1
  python3 tools/art/concepts.py [컨셉 slug...]     # 예: pixel dark

컨셉별로 [존 배경 / 몬스터 / 보스 / 영웅 초상] 4종을 같은 프롬프트·같은 크기로 생성해
tools/art/concepts/<slug>/ 에 정리하고, 실제 게임 프레이밍(펼침·보스·접힘)으로 합성한
목업과 비교용 HTML 시트(concepts/index.html)를 만든다.

generate.py 와 같은 API·재개 규칙을 쓴다 (raw 가 있으면 건너뜀).
전체 77종 생성은 컨셉 확정 후 generate.py 의 STYLE 을 교체해 수행한다.
"""
from __future__ import annotations

import base64
import html
import io
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from PIL import Image, ImageDraw

from process import circle_crop, crop_resize, fit_bottom

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "concepts")
KEY = os.environ.get("ELICE_API_KEY", "")
BASE = os.environ.get("ELICE_BASE_URL", "").rstrip("/")

# 게임 좌표 (src/config.ts 와 동기화 — 목업이 실제 화면과 같은 프레이밍이어야 한다)
GAME_W, GAME_H = 720, 1280
TOP_BAR_H = 150
PANEL_Y = 748
COMBAT_CENTER = (360, 470)
GROUND_Y = 588
COLLAPSED_MONSTER_Y = 696
COLLAPSED_MONSTER_SCALE = 1.65
COLLAPSED_GROUND_Y = 891
COLLAPSED_TAB_Y = 1240

# ---------------------------------------------------------------------------
# 컨셉 — STYLE 만 다르고 피사체 프롬프트는 전부 공통이다.
# ---------------------------------------------------------------------------
CONCEPTS: list[tuple[str, str, str]] = [
    ("cartoon", "밝은 카툰 치비",
     "vibrant stylized cartoon fantasy art, bold simple shapes, clean thick dark "
     "outlines, rich saturated colors, soft cel shading, high contrast, cheerful "
     "daylight mood"),
    ("dark", "다크 판타지",
     "dark fantasy digital painting, gothic grim atmosphere, desaturated moody "
     "palette of deep blues and blacks with fiery orange rim light, dramatic "
     "chiaroscuro lighting, painterly detailed brushwork, ominous mood"),
    ("pixel", "16비트 픽셀아트",
     "16-bit pixel art in the style of a retro SNES fantasy RPG, crisp visible "
     "square pixels, strictly limited 32-color palette, hard dithering gradients, "
     "no anti-aliasing, no blur, flat blocky shading"),
    ("storybook", "수채화 동화",
     "soft watercolor storybook illustration, hand-painted on textured paper, "
     "gentle pastel palette, visible brush washes and bleeding edges, delicate "
     "ink linework, warm whimsical picture-book mood"),
]

COMMON = ", no text, no watermark, no logo, no UI elements"
SPRITE = ("single isolated character centered, full body, facing the viewer, "
          "flat solid neutral gray background")
BG_RULE = ("tall vertical composition: sky and horizon in the upper 45%, wide open "
           "flat ground filling the lower 55% as an empty stage for a monster, "
           "no creatures, no characters, vertical mobile game battle background, 9:16")

# 피사체는 generate.py 의 대표 항목과 동일 (zone0 / monster0 / boss / hero0)
SUBJECTS: list[tuple[str, str, str, str, str]] = [
    # (파일명, 프롬프트 본문, 규격 접미, size, quality)
    ("bg", "sunny green grassland meadow with rolling hills, scattered flowers, "
           "distant trees", BG_RULE, "1024x1536", "medium"),
    ("monster", "cute round green slime monster with big glossy eyes and a happy grin, "
                "chibi proportions, cute but slightly menacing, standing pose", SPRITE,
     "1024x1024", "medium"),
    ("boss", "huge crimson demon ogre boss monster with ivory horns, glowing yellow "
             "eyes, sharp teeth grin, imposing and menacing", SPRITE,
     "1024x1024", "medium"),
    ("hero", "young apprentice swordsman with a simple short sword, brown hair, "
             "determined eyes, hero bust portrait from chest up, facing slightly left, "
             "dark simple backdrop", "", "1024x1024", "medium"),
]


def gen_one(slug: str, style: str, subject: tuple) -> tuple[str, str]:
    name, body, suffix, size, quality = subject
    raw_dir = os.path.join(OUT, slug, "raw")
    os.makedirs(raw_dir, exist_ok=True)
    out = os.path.join(raw_dir, name + ".png")
    tag = f"{slug}/{name}"
    if os.path.exists(out):
        return tag, "skip"
    prompt = body + (", " + suffix if suffix else "") + ", " + style + COMMON
    payload = {"model": "gpt-image-2", "prompt": prompt, "size": size,
               "n": 1, "quality": quality}
    r = None
    for attempt in range(4):
        try:
            r = requests.post(f"{BASE}/images/generations",
                              headers={"Authorization": f"Bearer {KEY}"},
                              json=payload, timeout=300)
        except requests.RequestException as e:
            if attempt == 3:
                return tag, f"error: {e}"
            time.sleep(2 ** (attempt + 1))
            continue
        if r.status_code == 200:
            img = base64.b64decode(r.json()["data"][0]["b64_json"])
            with open(out, "wb") as f:
                f.write(img)
            return tag, f"ok ({len(img) // 1024}KB)"
        if r.status_code == 400 and "quality" in r.text:
            payload.pop("quality", None)
            continue
        if 400 <= r.status_code < 500 and r.status_code != 429:
            return tag, f"http {r.status_code}: {r.text[:160]}"
        time.sleep(2 ** (attempt + 1))
    return tag, f"failed: http {r.status_code if r is not None else '?'}"


# ---------------------------------------------------------------------------
# 후처리 + 목업 합성
# ---------------------------------------------------------------------------
def ellipse(canvas: Image.Image, cx: int, cy: int, w: int, h: int,
            color: tuple[int, int, int], alpha: int) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse(
        (cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2), fill=color + (alpha,))
    canvas.alpha_composite(layer)


def band(canvas: Image.Image, y0: int, y1: int, alpha: int, label: str) -> None:
    """UI 가 덮는 영역 표시 — 실제 패널 대신 반투명 밴드로 가시 영역을 보여준다."""
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rectangle((0, y0, GAME_W, y1), fill=(14, 10, 26, alpha))
    d.text((16, y0 + 8), label, fill=(255, 255, 255, 150))
    canvas.alpha_composite(layer)


def compose(bg: Image.Image, sprite: Image.Image, mode: str) -> Image.Image:
    """GameScene 과 같은 배치로 합성 (origin 0.5/0.78, 발밑 단상 + 그림자)."""
    canvas = bg.convert("RGBA").copy()
    canvas.alpha_composite(Image.new("RGBA", canvas.size, (0, 0, 0, int(255 * 0.08))))
    collapsed = mode == "collapsed"
    scale = COLLAPSED_MONSTER_SCALE if collapsed else 1.0
    gy = COLLAPSED_GROUND_Y if collapsed else GROUND_Y
    my = COLLAPSED_MONSTER_Y if collapsed else COMBAT_CENTER[1]

    ellipse(canvas, COMBAT_CENTER[0], gy, round(460 * scale), round(70 * scale),
            (65, 48, 96), 255)
    ellipse(canvas, COMBAT_CENTER[0], gy + round(4 * scale),
            round(190 * scale), round(40 * scale), (0, 0, 0), 90)

    s = sprite
    if scale != 1.0:
        s = s.resize((round(s.width * scale), round(s.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(s, (COMBAT_CENTER[0] - s.width // 2,
                               my - round(s.height * 0.78)))

    band(canvas, 0, TOP_BAR_H, 205, "TOP BAR / HP")
    if collapsed:
        band(canvas, COLLAPSED_TAB_Y - 40, GAME_H, 205, "TAB BAR (접힘)")
    else:
        band(canvas, PANEL_Y - 26, GAME_H, 205, "성장 패널")
    return canvas


def process(slug: str) -> dict[str, str]:
    d = os.path.join(OUT, slug)
    raw = os.path.join(d, "raw")
    files = {}
    bg = crop_resize(Image.open(os.path.join(raw, "bg.png")), GAME_W, GAME_H)
    bg.save(os.path.join(d, "bg.png"))
    files["bg"] = "bg.png"

    monster = fit_bottom(Image.open(os.path.join(raw, "monster.png")), 200, 170)
    boss = fit_bottom(Image.open(os.path.join(raw, "boss.png")), 280, 250)
    monster.save(os.path.join(d, "monster.png"))
    boss.save(os.path.join(d, "boss.png"))
    files["monster"], files["boss"] = "monster.png", "boss.png"

    hero_big = circle_crop(Image.open(os.path.join(raw, "hero.png")), 256, 256)
    hero_big.save(os.path.join(d, "hero.png"))
    # 실제 게임에서 쓰이는 42px 도 함께 — 축소 후에도 읽히는지 확인용
    circle_crop(Image.open(os.path.join(raw, "hero.png")), 42, 42).save(
        os.path.join(d, "hero42.png"))
    files["hero"], files["hero42"] = "hero.png", "hero42.png"

    for mode, sprite in (("normal", monster), ("boss", boss), ("collapsed", monster)):
        compose(bg, sprite, mode).convert("RGB").save(
            os.path.join(d, f"mock-{mode}.png"), quality=92)
        files[f"mock-{mode}"] = f"mock-{mode}.png"
    return files


def data_uri(path: str, width: int | None = None, fmt: str = "JPEG") -> str:
    img = Image.open(path)
    if width and img.width > width:
        img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.convert("RGB").save(buf, "JPEG", quality=82, optimize=True)
        mime = "image/jpeg"
    else:
        img.save(buf, "PNG", optimize=True)
        mime = "image/png"
    return f"data:{mime};base64," + base64.b64encode(buf.getvalue()).decode()


ROWS = [
    ("전투 화면 · 펼침", "mock-normal", "phone",
     "기본 상태. 몬스터는 지면 y=470, 상단 HP 바와 하단 성장 패널이 덮는 영역을 밴드로 표시했다."),
    ("보스전", "mock-boss", "phone",
     "보스는 280x250 — 같은 자리에 더 크게 선다. 좁은 화면에서 실루엣이 읽히는지 본다."),
    ("UI 접힘 · 지면 노출", "mock-collapsed", "phone",
     "패널을 접으면 몬스터가 y=696 으로 내려가고 배경 하단이 그대로 드러난다. 여기서 지면이 비면 그 배경은 탈락."),
    ("몬스터 200x170", "monster", "sprite",
     "생성 배경을 크로마키로 제거한 실제 게임 규격. 흰 테두리나 잔여 배경이 남는지 확인."),
    ("보스 280x250", "boss", "sprite", ""),
    ("영웅 초상", "hero", "hero",
     "왼쪽이 원본, 오른쪽이 실제 UI 크기(42px). 축소해도 얼굴이 읽혀야 영웅 목록에서 구분된다."),
]


def sheet(slugs: list[str]) -> str:
    names = dict((s, n) for s, n, _ in CONCEPTS)
    css = """
:root{
  --bg:#f4f1f7; --card:#fff; --fg:#1b1522; --mut:#6d6479; --line:#e5dfeb;
  --accent:#a8761b; --chk1:#00000010; --chk2:transparent; --frame:#d9d2e2;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#131019; --card:#1c1725; --fg:#ece7f3; --mut:#9c93aa; --line:#2b2436;
  --accent:#e6b957; --chk1:#ffffff12; --chk2:transparent; --frame:#332b42;
}}
:root[data-theme="dark"]{
  --bg:#131019; --card:#1c1725; --fg:#ece7f3; --mut:#9c93aa; --line:#2b2436;
  --accent:#e6b957; --chk1:#ffffff12; --chk2:transparent; --frame:#332b42;
}
*{box-sizing:border-box}
body{margin:0;padding:48px 24px 80px;background:var(--bg);color:var(--fg);
  font-family:"Gothic A1","Apple SD Gothic Neo",-apple-system,BlinkMacSystemFont,sans-serif;
  font-size:15px;line-height:1.65;-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto}
.eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);
  font-weight:700;margin:0 0 10px}
h1{font-family:"Gowun Batang",serif;font-weight:700;font-size:clamp(30px,5vw,44px);
  line-height:1.2;margin:0 0 14px;text-wrap:balance}
.lede{color:var(--mut);margin:0;max-width:62ch}
.legend{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 0;padding:0;list-style:none}
.legend li{font-size:12.5px;color:var(--mut);border:1px solid var(--line);border-radius:999px;
  padding:5px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
section{margin-top:56px}
.rowhead{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;
  border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:18px}
h2{font-family:"Gowun Batang",serif;font-size:21px;font-weight:700;margin:0}
.spec{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;
  color:var(--accent);letter-spacing:.02em}
.hint{color:var(--mut);font-size:13.5px;margin:0 0 18px;max-width:78ch}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px}
.card{display:flex;flex-direction:column;gap:10px}
.shot{border:1px solid var(--frame);border-radius:14px;overflow:hidden;background:#000;
  line-height:0}
.shot img{width:100%;height:auto;display:block}
.tile{border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--card);
  display:flex;align-items:flex-end;justify-content:center;gap:14px;min-height:120px;
  background-image:linear-gradient(45deg,var(--chk1) 25%,transparent 25%),
    linear-gradient(-45deg,var(--chk1) 25%,transparent 25%),
    linear-gradient(45deg,transparent 75%,var(--chk1) 75%),
    linear-gradient(-45deg,transparent 75%,var(--chk1) 75%);
  background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0}
.tile img{max-width:100%;height:auto}
.tile .small{align-self:flex-end}
.px img{image-rendering:pixelated}
.name{font-weight:700;font-size:14.5px}
.slug{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--mut)}
.meta{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.foot{margin-top:64px;padding-top:20px;border-top:1px solid var(--line);color:var(--mut);
  font-size:13px}
.foot code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;
  background:var(--card);border:1px solid var(--line);border-radius:5px;padding:1px 6px}
@media (prefers-reduced-motion:no-preference){.card{transition:none}}
"""
    p = ['<title>아트 컨셉 시안</title>',
         '<link rel="preconnect" href="https://fonts.googleapis.com">',
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=Gowun+Batang:wght@400;700&family=Gothic+A1:wght@400;600;700&display=swap">',
         f'<style>{css}</style>', '<div class="wrap">',
         '<p class="eyebrow">TapTap Titans · 아트 디렉션</p>',
         '<h1>네 갈래의 시안</h1>',
         '<p class="lede">피사체·구도·크기를 고정하고 스타일만 바꿔 생성했다. '
         '목업은 실제 게임 좌표(720×1280, 지면 y=588, 접힘 y=891)로 합성한 것이라 '
         '화면에서 보이는 그대로다.</p>',
         '<ul class="legend"><li>존 배경 720×1280</li><li>몬스터 200×170</li>'
         '<li>보스 280×250</li><li>영웅 초상 42px</li>'
         f'<li>{len(slugs)}개 컨셉 × 4종</li></ul>']

    for title, kind, mode, hint in ROWS:
        p.append('<section>')
        spec = {"mock-normal": "720×1280", "mock-boss": "720×1280",
                "mock-collapsed": "720×1280", "monster": "200×170 PNG",
                "boss": "280×250 PNG", "hero": "256px / 42px PNG"}[kind]
        p.append(f'<div class="rowhead"><h2>{html.escape(title)}</h2>'
                 f'<span class="spec">{spec}</span></div>')
        if hint:
            p.append(f'<p class="hint">{html.escape(hint)}</p>')
        p.append('<div class="grid">')
        for slug in slugs:
            path = os.path.join(OUT, slug, f"{kind}.png")
            if not os.path.exists(path):
                continue
            px = " px" if slug == "pixel" else ""
            if mode == "phone":
                body = (f'<div class="shot{px}">'
                        f'<img src="{data_uri(path, 340, "JPEG")}" alt="{slug}"></div>')
            elif mode == "hero":
                small = os.path.join(OUT, slug, "hero42.png")
                extra = (f'<img class="small" src="{data_uri(small, None, "PNG")}" '
                         f'alt="{slug} 42px">' if os.path.exists(small) else "")
                body = (f'<div class="tile{px}">'
                        f'<img src="{data_uri(path, 160, "PNG")}" alt="{slug}">{extra}</div>')
            else:
                w = 200 if kind == "monster" else 280
                body = (f'<div class="tile{px}">'
                        f'<img src="{data_uri(path, w, "PNG")}" alt="{slug}"></div>')
            p.append(f'<div class="card">{body}<div class="meta">'
                     f'<span class="name">{html.escape(names.get(slug, slug))}</span>'
                     f'<span class="slug">{slug}</span></div></div>')
        p.append('</div></section>')

    p.append('<p class="foot">원본 1024px 과 게임 규격 PNG 는 '
             '<code>tools/art/concepts/&lt;slug&gt;/</code> 에 있다. '
             '컨셉을 고르면 <code>generate.py</code> 의 STYLE 을 그 문구로 바꿔 전체 77종을 '
             '생성한다.</p></div>')
    return "\n".join(p)


def main() -> None:
    if not KEY or not BASE:
        sys.exit("ELICE_API_KEY / ELICE_BASE_URL 환경변수를 설정하세요.")
    filters = sys.argv[1:]
    picked = [c for c in CONCEPTS if not filters or c[0] in filters]
    jobs = [(slug, style, subj) for slug, _, style in picked for subj in SUBJECTS]
    print(f"{len(jobs)} jobs ({len(picked)} concepts)")
    done = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = [ex.submit(gen_one, *j) for j in jobs]
        for fut in as_completed(futs):
            tag, status = fut.result()
            done += 1
            print(f"[{done}/{len(jobs)}] {tag}: {status}", flush=True)

    slugs = []
    for slug, _, _ in picked:
        raw = os.path.join(OUT, slug, "raw")
        missing = [s[0] for s in SUBJECTS
                   if not os.path.exists(os.path.join(raw, s[0] + ".png"))]
        if missing:
            print(f"! {slug}: 원본 누락 {missing} — 시트에서 제외")
            continue
        process(slug)
        slugs.append(slug)
        print(f"processed: {slug}")

    if slugs:
        with open(os.path.join(OUT, "index.html"), "w") as f:
            f.write(sheet(slugs))
        print(f"sheet: {os.path.join(OUT, 'index.html')}")


if __name__ == "__main__":
    main()
