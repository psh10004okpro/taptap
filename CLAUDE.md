# TapTap Titans — 개발 규칙

## 스택 (고정)
- **Phaser 4.2.x** (`latest`). v3 전용 API 사용 금지: `Point`, `Mesh`, `BitmapMask`, 구 Shader/Tint/FX API.
- TypeScript strict + Vite. `npm run build` 가 타입체크를 겸한다 — 커밋 전 필수.
- 테스트: `npm run build && npx playwright test`. Chromium 은 `/opt/pw-browsers/chromium` (playwright.config.ts 의 executablePath).

## 아키텍처 불변식
- `src/core/` 와 `src/config.ts` 는 **Phaser import 금지** (순수 로직 계층).
- 상태 변경은 반드시 `GameState` 메서드 경유 + 이벤트 발행. Scene 이 상태를 직접 쓰지 않는다.
- Scene 간 통신은 `game.events` 버스 (`engage-boss`, `boss-timer`).
- 논리 해상도 720x1280 고정, `Scale.FIT`. 좌표 하드코딩은 `config.ts` 레이아웃 상수 사용.
- 신규 이펙트는 오브젝트 풀 재사용 (`floatPool`/`coinPool` 패턴). 매 프레임 `new` 금지.
- 텍스처는 BootScene 에서만 생성. 씬 중간 generateTexture 금지.

## 테스트 훅
- `window.__taptap = { game, state }` — E2E 는 이 훅으로 상태를 검증한다. 제거 금지.
- 새 기능엔 tests/game.spec.ts 에 시나리오 추가.

## 밸런스 수정
- 곡선은 전부 `src/config.ts` 의 함수(`monsterHp`, `tapCost`, `heroDps`...). UI/Scene 에 숫자 하드코딩 금지.

## 신규 시스템 규칙 (스킬/유물/랭킹)
- 스킬 쿨다운은 epoch ms (`Date.now()`) 기준 — 오프라인에도 흐른다. Phaser 시계(`time.now`) 와 혼용 금지.
- 유물은 소비 화폐: `relicsEarned` 가 누적 획득 기준. 환생 보상 = `relicsFor(maxStage) - relicsEarned`.
- 랭킹 쓰기는 Edge Function 경유만. 클라이언트에서 leaderboard 테이블 직접 insert/update 금지.
- `relicsFor` 곡선 변경 시 `supabase/functions/submit-score/index.ts` 의 사본도 함께 갱신할 것.
- 세이브 스키마 변경 시 v 를 올리고 load() 에 하위호환 마이그레이션을 추가한다.

## 밸런스/콘텐츠 규칙 (2차 확장)
- **곡선 변경 시 `npm run sim` 필수** — 벽 위치/환생 페이싱 확인 (docs/BALANCE.md).
  GOLD_GROWTH < HP_GROWTH 격차가 벽을 만든다. 골드를 HP 비례로 만들지 말 것.
- 분석 이벤트는 `Analytics.track` 경유, 이벤트 추가 시 docs/ANALYTICS.md 갱신.
- 광고 보상은 `AdRewards.offer` 경유만 (ad_offer/ad_reward 퍼널 자동 계측).
  실제 SDK 연동은 `AdProvider` 구현체 교체로만 한다.
- 장비 statPct 상한 300% (인플레 캡). 일일 퀘스트 골드 보상은 goldMult 미적용 (부스트 악용 방지).

## 테스트 툴킷 (docs/TESTING.md)
- QA 치트는 `core/DevTools.ts` 에만 추가 — 패널(?dev=1)과 E2E 가 같은 코드를 쓴다.
- 상태 불변식은 `DevTools.validate()` 에 누적한다. 몽키(`npm run test:monkey`)가 검사.
- `window.__taptap` 훅 시그니처 변경 시 tests/game.spec.ts 의 선언도 갱신.
