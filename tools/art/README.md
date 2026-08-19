# 아트 생성 파이프라인 (GPT-Image-2)

절차적 플레이스홀더 아트를 생성형 이미지로 교체하는 파이프라인.
API 키는 절대 커밋하지 않는다 — 환경변수로만 전달.

## 사용법

```bash
pip install requests pillow

export ELICE_API_KEY=<Serverless API Key>
export ELICE_BASE_URL=https://mlapi.run/<endpoint-id>/v1

# 1) 생성 (77종, 원본은 tools/art/raw/ — 이미 있으면 건너뜀, 재개 가능)
python3 tools/art/generate.py            # 전체
python3 tools/art/generate.py bg- boss   # 키 프리픽스 필터

# 2) 후처리 → public/assets/ + manifest.json 갱신
python3 tools/art/process.py
```

## 에셋 규격 (BootScene 절차 텍스처와 1:1)

| 키 | 수량 | 규격 | 처리 |
|---|---|---|---|
| `bg-zone0..9` | 10 | 720×748 | 중앙 크롭 |
| `monster0..11` | 12 | 200×170 | 트림 + 바닥 정렬 (투명) |
| `boss` | 1 | 280×250 | 트림 + 바닥 정렬 (투명) |
| `hero0..23` | 24 | 42×42 | 원형 마스크 |
| `skill0..5` | 6 | 76×76 | 원형 마스크 |
| `artifact0..19` | 20 | 44×44 | 트림 + 중앙 (투명) |
| `equip0..2` | 3 | 44×44 | 트림 + 중앙 (투명) |
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
- UI 텍스처(패널/버튼/탭/바)는 의도적으로 절차 생성 유지 (일관성/용량).
