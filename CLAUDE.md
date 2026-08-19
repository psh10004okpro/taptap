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
