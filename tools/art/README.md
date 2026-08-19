# 아트 생성 파이프라인 (GPT-Image-2)

절차적 플레이스홀더 아트를 생성형 이미지로 교체하는 파이프라인.
API 키는 절대 커밋하지 않는다 — 환경변수로만 전달.

## 사용법

```bash
pip install requests pillow          # Python 3.9 이상

export ELICE_API_KEY=<Serverless API Key>
export ELICE_BASE_URL=https://mlapi.run/<endpoint-id>/v1

# 1) 생성 (90종, 원본은 tools/art/raw/ — 이미 있으면 건너뜀, 재개 가능)
python3 tools/art/generate.py            # 전체
python3 tools/art/generate.py bg- boss   # 키 프리픽스 필터
ART_WORKERS=6 python3 tools/art/generate.py   # 동시 요청 수 (기본 4)

# 2) 후처리 → public/assets/ + manifest.json 갱신
python3 tools/art/process.py

# 3) 검수: 90종을 실제 게임 크기로 한 장에 모아 본다
python3 tools/art/contact.py             # tools/art/contact.png
```

## 앱 아이콘 · 스플래시 · 스토어 이미지

```bash
python3 tools/art/icons.py
```
`tools/art/raw/appicon.png` 를 원본으로 (없으면 같은 STYLE 로 생성)

- `android/.../mipmap-*/` 런처 3종 x 5밀도 — 레거시 정사각, 원형, 어댑티브 전경
  (어댑티브는 바깥 25% 가 잘리므로 66/108 안전영역 안에 넣는다)
- `android/.../values/ic_launcher_background.xml` 어댑티브 배경색 `#0D0A1A`
- `android/.../drawable*/splash.png` 기존 버킷 크기 그대로 재생성
- `store/icon-512.png`, `store/feature-1024x500.png` Play 등록용
- `public/icon-{192,512}.png` 웹 파비콘

원형 마스크를 그대로 씌우면 뿔이 잘려서, 원형/어댑티브는 엠블럼을 84% 로 줄여
원판 위에 올린다.

## 컨셉 시안 (선택 단계)

```bash
python3 tools/art/concepts.py            # 컨셉 4종 x [배경/몬스터/보스/영웅]
python3 tools/art/concepts.py dark pixel # 일부만
```
`tools/art/concepts/<slug>/` 에 게임 규격 PNG 와 **실제 좌표로 합성한 목업**
(펼침/보스/접힘)을, `concepts/index.html` 에 비교 시트를 만든다.
**확정 컨셉: 다크 판타지(`dark`)** — `generate.py` 의 STYLE 이 이 문구다.

## 에셋 규격 (BootScene 절차 텍스처와 1:1)

| 키 | 수량 | 규격 | 처리 |
|---|---|---|---|
| `bg-zone0..9` | 10 | 720×1280 | 중앙 크롭 (세로 9:16 — 접기 시 아래 지면이 드러난다) |
| `monster0..11` | 12 | 200×170 | 트림 + 바닥 정렬 (투명) |
| `boss` | 1 | 280×250 | 트림 + 바닥 정렬 (투명) |
| `hero0..23` | 24 | 42×42 | 원형 마스크 |
| `skill0..5` | 6 | 76×76 | 원형 마스크 |
| `artifact0..19` | 20 | 44×44 | 트림 + 중앙 (투명) |
| `equip0..2` | 3 | 44×44 | 트림 + 중앙 (투명) |
| `pet0..11` | 12 | 52×52 | 원형 마스크 |
| `fairy` | 1 | 48×48 | 트림 + 중앙 (투명) |
| `coin` | 1 | 28×28 | 트림 + 중앙 (투명) |

## 동작 방식

- `public/assets/manifest.json` 이 로드할 키의 단일 출처.
  BootScene 이 manifest 에 있는 키만 로드하고 (404 없음),
  로드되지 않은 키는 기존 Graphics 절차 생성으로 폴백한다.
- 존별 배경(`bg-zone{id}`)이 있으면 GameScene 이 스폰 시 교체하고
  존 틴트 오버레이를 옅게(0.08) 낮춘다. 없으면 공용 `bg` + 0.22 틴트.
- `background: transparent` 미지원 API 폴백: process.py 가 가장자리
  연결 배경색만 투명화하는 chroma key 를 자동 적용한다.

## 주의

- 프롬프트의 STYLE 상수가 전체 룩을 고정한다 — 부분 재생성 시 스타일이
  섞이지 않도록 한 번 정한 STYLE 은 유지할 것.
- **프롬프트에 "transparent background" 를 쓰지 말 것.** 이 API 는
  `background=transparent` 를 거부하고(400), 프롬프트로 요구하면 체커보드 무늬를
  그려 넣는다. 평평한 회색 배경으로 뽑고 process.py 의 chroma key 로 잘라낸다.
- 배경은 몬스터가 서는 **y=470/1280(37%) 위로 지평선**이 와야 발이 땅에 닿는다
  (BG_SUFFIX 가 "upper third" 를 요구하는 이유).
- 배경만 **jpg** 로 저장한다 (알파 불필요). png 로 두면 10 장에 20MB 라 첫 로딩이 막힌다.
  manifest 의 `files` 가 png 가 아닌 키의 실제 파일명을 담고 BootScene 이 그걸 읽는다.
- 최종 표시 크기가 작은 것(영웅 42px, 펫 52px)은 **얼굴/실루엣이 밝고 색이 뚜렷해야**
  목록에서 서로 구분된다 — 어두운 초상은 42px 에서 전부 같은 검은 원이 된다.
- UI 텍스처(패널/버튼/탭/바)는 의도적으로 절차 생성 유지 (일관성/용량).
