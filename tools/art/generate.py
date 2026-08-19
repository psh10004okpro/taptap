#!/usr/bin/env python3
"""GPT-Image-2 (OpenAI 호환 API) 게임 아트 일괄 생성.

사용법:
  export ELICE_API_KEY=...            # Serverless API 키 (절대 커밋 금지)
  export ELICE_BASE_URL=https://mlapi.run/<endpoint-id>/v1
  python3 tools/art/generate.py [키 필터...]   # 예: bg- monster boss

원본 PNG 는 tools/art/raw/ 에 저장된다 (이미 있으면 건너뜀 — 재개 가능).
후처리(트림/리사이즈/마스크)는 process.py 가 raw/ → public/assets/ 로 수행한다.
"""
import base64
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
KEY = os.environ.get("ELICE_API_KEY", "")
BASE = os.environ.get("ELICE_BASE_URL", "").rstrip("/")

# ---------------------------------------------------------------------------
# 스타일 상수 — 전 에셋 공통 룩 (변경 시 전체 재생성 필요)
# ---------------------------------------------------------------------------
# 확정 컨셉: 다크 판타지 (tools/art/concepts/dark). 부분 재생성 시에도 이 문구를 유지한다.
STYLE = ("dark fantasy digital painting for a mobile idle tap RPG, gothic grim "
         "atmosphere, desaturated moody palette of deep blues and blacks with fiery "
         "orange rim light, dramatic chiaroscuro lighting, painterly detailed "
         "brushwork, no text, no watermark, no logo")
# API 가 background=transparent 를 지원하지 않는다 — 평평한 회색 배경으로 뽑고
# process.py 의 edge chroma key 로 잘라낸다. 프롬프트에 "transparent" 를 쓰면
# 체커보드 무늬가 그려지므로 금지.
SPRITE = ("single isolated character centered, full body, facing the viewer, "
          "flat solid neutral gray background, no ground shadow, " + STYLE)
ICON = ("game icon, single centered object, flat solid neutral gray background, "
        "slight glow, " + STYLE)

ZONES = [
    ("bg-zone0", "windswept green grassland meadow with rolling hills, scattered flowers, distant trees"),
    ("bg-zone1", "dark mysterious forest with giant twisted trees, glowing mushrooms, dim teal light"),
    ("bg-zone2", "underground cave with glowing purple crystals, stalactites, rocky floor"),
    ("bg-zone3", "golden desert with sand dunes, half-buried ancient ruins, burnt ochre sky"),
    ("bg-zone4", "murky swamp with dead trees, green fog, lily pads on dark water"),
    ("bg-zone5", "snowy tundra with ice cliffs, falling snow, pale blue sky, frozen pines"),
    ("bg-zone6", "volcanic wasteland with lava rivers, black rock, ember particles, red glow"),
    ("bg-zone7", "ancient stone ruins with broken pillars and statues, overgrown vines, purple dusk"),
    ("bg-zone8", "floating sky islands above clouds, waterfalls falling into the void, pale storm-lit sky"),
    ("bg-zone9", "cosmic abyss with dark void, swirling nebula, floating obsidian rocks, deep indigo"),
]
# 몬스터는 화면 y=470/1280 (37%) 에 선다 — 지평선이 그보다 위에 있어야 발이 땅에 닿는다.
BG_SUFFIX = ("; tall vertical composition: horizon line high up in the upper third of "
             "the frame, wide open flat ground filling the entire lower two thirds as "
             "a stage for a monster, seen from a low ground-level camera, "
             "no creatures, no characters, vertical mobile game battle background "
             "(9:16, the lower half stays visible when the UI is collapsed), " + STYLE)

MONSTERS = [
    ("monster0", "cute round green slime with big glossy eyes and a happy grin"),
    ("monster1", "small blue imp with two tiny horns and a mischievous smile"),
    ("monster2", "pink-magenta walking mushroom creature with dot eyes"),
    ("monster3", "orange plump beetle bug with tiny wings and stubby legs"),
    ("monster4", "violet floating ghost wisp with a wavy tail and glowing eyes"),
    ("monster5", "reddish-pink fat toad monster with spikes on its back"),
    ("monster6", "teal jelly crab creature with big pincers and bubble eyes"),
    ("monster7", "golden-yellow baby rock golem with mossy shoulders"),
    ("monster8", "brown chubby boar piglet monster with small tusks"),
    ("monster9", "gray stone bat creature with folded rocky wings"),
    ("monster10", "rose-pink horned lizard critter with a curled tail"),
    ("monster11", "lime green thorny plant creature with leafy arms and fangs"),
]
MONSTER_SUFFIX = (", stocky readable silhouette, menacing battle-ready stance, "
                  "keep the described creature type and color clearly recognizable, "
                  + SPRITE)

HEROES = [
    "young apprentice swordsman with a simple short sword, brown hair, determined eyes",
    "elven forest archer woman with green hood and a wooden bow",
    "fire mage man with red robes and a flaming staff",
    "moonlight rogue woman with purple hood and twin daggers",
    "stout rock guardian dwarf with a massive stone shield",
    "priestess of light with white and gold robes and a glowing halo staff",
    "lightning samurai with blue armor and an electric katana",
    "abyssal dark knight in black spiky armor with glowing red visor",
    "sky lancer knight with white-silver armor and a long spear, wind swirls",
    "raven shaman witch with black feather cloak and a crow on her shoulder",
    "golden alchemist man with monocle, holding a flask of liquid gold",
    "frost dancer woman with ice-blue veils and frozen fans",
    "ancient dragon tamer with scale armor and a small dragon companion",
    "starlight sage old man with cosmic robes and a constellation orb",
    "thunder god descendant, muscular warrior with a lightning hammer",
    "shadowless swordmaster with gray cloak, face hidden, katana on back",
    "lava giant warrior with molten cracks in rocky skin",
    "earth goddess priestess with vine crown and blooming staff",
    "greedy king Midas in golden royal armor with a gold sceptre",
    "red wolf king berserker with crimson fur cloak and claw gauntlets",
    "colossal titan war machine, bronze mech knight with glowing core",
    "aurora witch with iridescent hair and polar-light magic",
    "doom knight of ragnarok with black-red armor and a greatsword of embers",
    "time watcher with hourglass staff, clockwork wings, ethereal robes",
]
# 최종 표시 크기가 42px 원형이다 — 얼굴이 밝고 실루엣이 배경과 분리돼야 구분된다.
HERO_SUFFIX = (", fantasy hero bust portrait from chest up, face large in frame, "
               "facing slightly left, strong bright key light on the face, "
               "vivid saturated costume color, clearly readable as a tiny circular "
               "avatar, plain uncluttered mid-tone backdrop, " + STYLE)

SKILLS = [
    ("skill0", "flaming sword engulfed in red-orange fire"),
    ("skill1", "war horn with a red battle-cry shockwave"),
    ("skill2", "golden open hand with coins raining around it"),
    ("skill3", "three translucent purple shadow clones of a ninja"),
    ("skill4", "divine golden light beam striking down from heaven"),
    ("skill5", "crosshair target with a critical red slash mark"),
]

ARTIFACTS = [
    ("artifact0", "crimson longsword of destruction"),
    ("artifact1", "blue war banner flag of valor"),
    ("artifact2", "golden chalice overflowing with light"),
    ("artifact3", "emerald hawk eye amulet"),
    ("artifact4", "orange giant's heart gem"),
    ("artifact5", "purple hourglass with flowing violet sand"),
    ("artifact6", "teal ancient scholar's scroll"),
    ("artifact7", "cyan wind charm talisman with feathers"),
    ("artifact8", "gold merchant's wax seal stamp"),
    ("artifact9", "white glowing primordial rune stone"),
    ("artifact10", "red beast claw trophy"),
    ("artifact11", "blue legion war trumpet"),
    ("artifact12", "golden golem heart core"),
    ("artifact13", "light-blue frozen teardrop crystal"),
    ("artifact14", "green venomous needle stinger"),
    ("artifact15", "bronze colossus fist gauntlet"),
    ("artifact16", "violet constellation star map"),
    ("artifact17", "warm amber dawn lantern"),
    ("artifact18", "storm core orb with lightning inside"),
    ("artifact19", "brown-gold pulsing earth heart stone"),
]

PETS = [
    ("pet0", "small red fire salamander lizard with ember-lit scales"),
    ("pet1", "sleek blue wind falcon with sharp spread wings"),
    ("pet2", "plump golden mole holding a gold nugget"),
    ("pet3", "violet shadow lynx with glowing eyes and smoky fur"),
    ("pet4", "green mossy turtle with a stone shell and vines"),
    ("pet5", "small coral-red fairy sprite with tiny glowing wings"),
    ("pet6", "steel-blue thunder foal with crackling lightning mane"),
    ("pet7", "orange swift marten mid-dash with a streak of motion"),
    ("pet8", "purple crystal beetle with faceted gem carapace"),
    ("pet9", "dark red lava toad with molten cracks in its skin"),
    ("pet10", "gray silent owl with wide moonlit eyes"),
    ("pet11", "pale pink rainbow butterfly with iridescent wings"),
]
# 펫은 52px 원형 아이콘으로 표시된다 — 한 마리가 정면으로 크게 잡혀야 구분된다.
PET_SUFFIX = (", single cute-menacing creature companion, centered close-up, "
              "facing the viewer, vivid saturated color, readable as a tiny "
              "circular icon, plain uncluttered dark backdrop, " + STYLE)

EQUIPS = [
    ("equip0", "steel sword with golden hilt"),
    ("equip1", "sturdy kite shield with gold emblem"),
    ("equip2", "golden ring with a purple gem"),
]


def manifest() -> list[dict]:
    jobs: list[dict] = []
    for key, desc in ZONES:
        jobs.append({"key": key, "prompt": desc + BG_SUFFIX,
                     "size": "1024x1536", "quality": "medium", "background": None})
    for key, desc in MONSTERS:
        jobs.append({"key": key, "prompt": desc + MONSTER_SUFFIX,
                     "size": "1024x1024", "quality": "medium", "background": "transparent"})
    jobs.append({"key": "boss", "prompt":
                 "huge crimson demon ogre monster with ivory horns, glowing yellow eyes, "
                 "sharp teeth grin, towering dark fantasy boss" + ", " + SPRITE,
                 "size": "1024x1024", "quality": "medium", "background": "transparent"})
    for i, desc in enumerate(HEROES):
        jobs.append({"key": f"hero{i}", "prompt": desc + HERO_SUFFIX,
                     "size": "1024x1024", "quality": "medium", "background": None})
    for key, desc in SKILLS:
        # 스킬 텍스처는 스킬 버튼의 면 자체다 — 6종 배경 톤이 어긋나면 바로 보인다
        jobs.append({"key": key, "prompt": desc + ", glowing magic spell emblem "
                     "centered on a round dark stone amulet, uniform dark background, "
                     + STYLE, "size": "1024x1024", "quality": "medium"})
    for key, desc in ARTIFACTS:
        jobs.append({"key": key, "prompt": desc + ", legendary relic " + ICON,
                     "size": "1024x1024", "quality": "low", "background": "transparent"})
    for key, desc in PETS:
        jobs.append({"key": key, "prompt": desc + PET_SUFFIX,
                     "size": "1024x1024", "quality": "medium", "background": None})
    for key, desc in EQUIPS:
        jobs.append({"key": key, "prompt": desc + ", equipment " + ICON,
                     "size": "1024x1024", "quality": "low", "background": "transparent"})
    # 요정: 전투 화면을 가로지르는 보상형 광고 캐리어 (48px)
    jobs.append({"key": "fairy", "prompt":
                 "tiny glowing fairy sprite with luminous translucent wings, "
                 "trailing sparkles, seen from the side in flight, " + ICON,
                 "size": "1024x1024", "quality": "medium", "background": None})
    jobs.append({"key": "coin", "prompt": "shiny gold coin " + ICON,
                 "size": "1024x1024", "quality": "low", "background": "transparent"})
    return jobs


def gen_one(job: dict) -> tuple[str, str]:
    out = os.path.join(RAW, job["key"] + ".png")
    if os.path.exists(out):
        return job["key"], "skip"
    payload = {"model": "gpt-image-2", "prompt": job["prompt"],
               "size": job["size"], "n": 1}
    if job.get("quality"):
        payload["quality"] = job["quality"]
    if job.get("background"):
        payload["background"] = job["background"]
    for attempt in range(4):
        try:
            r = requests.post(f"{BASE}/images/generations",
                              headers={"Authorization": f"Bearer {KEY}"},
                              json=payload, timeout=300)
        except requests.RequestException as e:
            if attempt == 3:
                return job["key"], f"error: {e}"
            time.sleep(2 ** (attempt + 1))
            continue
        if r.status_code == 200:
            img = base64.b64decode(r.json()["data"][0]["b64_json"])
            with open(out, "wb") as f:
                f.write(img)
            return job["key"], f"ok ({len(img) // 1024}KB)"
        # background/quality 미지원이면 해당 파라미터를 빼고 즉시 재시도
        if r.status_code == 400 and ("background" in r.text or "quality" in r.text):
            payload.pop("background", None) if "background" in r.text else payload.pop("quality", None)
            continue
        if 400 <= r.status_code < 500 and r.status_code != 429:
            return job["key"], f"http {r.status_code}: {r.text[:200]}"
        time.sleep(2 ** (attempt + 1))
    return job["key"], f"failed: http {r.status_code}"


def main() -> None:
    if not KEY or not BASE:
        sys.exit("ELICE_API_KEY / ELICE_BASE_URL 환경변수를 설정하세요.")
    os.makedirs(RAW, exist_ok=True)
    filters = sys.argv[1:]
    jobs = [j for j in manifest()
            if not filters or any(j["key"].startswith(f) for f in filters)]
    print(f"{len(jobs)} jobs")
    done = 0
    workers = int(os.environ.get("ART_WORKERS", "4"))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(gen_one, j): j for j in jobs}
        for fut in as_completed(futs):
            key, status = fut.result()
            done += 1
            print(f"[{done}/{len(jobs)}] {key}: {status}", flush=True)
    print(json.dumps({"raw_dir": RAW}))


if __name__ == "__main__":
    main()
