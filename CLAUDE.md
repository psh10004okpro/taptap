# TapTap Titans — 개발 규칙

## 스택 (고정)
- **Phaser 4.2.x** (`latest`). v3 전용 API 사용 금지: `Point`, `Mesh`, `BitmapMask`, 구 Shader/Tint/FX API.
- TypeScript strict + Vite. `npm run build` 가 타입체크를 겸한다 — 커밋 전 필수.
- 테스트: `npm run build && npx playwright test`. Chromium 은 `/opt/pw-browsers/chromium` (playwright.config.ts 의 executablePath).

## 아키텍처 불변식
- `src/core/` 와 `src/config.ts` 는 **Phaser import 금지** (순수 로직 계층).
- 상태 변경은 반드시 `GameState` 메서드 경유 + 이벤트 발행. Scene 이 상태를 직접 쓰지 않는다.
- Scene 간 통신은 `game.events` 버스 (`engage-boss`, `boss-timer`, `fairy-tap`,
  `fairy-force`, `ui-collapse`, `offline-return`).
- 논리 해상도 720x1280 고정, `Scale.FIT`. 좌표 하드코딩은 `config.ts` 레이아웃 상수 사용.
- **UIScene 모달은 GameScene 입력을 가리지 못한다** (씬이 다름). 오버레이/팝업 열고 닫을 때
  `syncBlocking()` 으로 `registry.uiBlocking` 을 갱신하고, GameScene 은 탭 처리 선두에서 이를 확인한다.
  신규 모달을 추가하면 `syncBlocking()` 의 판정 목록에도 넣을 것.
- 신규 이펙트는 오브젝트 풀 재사용 (`floatPool`/`coinPool` 패턴). 매 프레임 `new` 금지.
- 텍스처는 BootScene 에서만 생성. 씬 중간 generateTexture 금지.

## 테스트 훅
- `window.__taptap = { game, state }` — E2E 는 이 훅으로 상태를 검증한다. 제거 금지.
- 새 기능엔 tests/game.spec.ts 에 시나리오 추가.

## UI 구성 (탭타이탄2 문법)
- 하단 5탭은 **성장 축 전용**: `[소드마스터 | 영웅 | 장비 | 펫 | 유물]`.
  소드마스터 = 탭 공격력 + 환생 + 스킬트리. 부가 콘텐츠를 탭으로 늘리지 말 것.
- 퀘스트/랭킹 등 부가 콘텐츠는 전투 화면 좌측 **플로팅 아이콘**(`FLOAT_ICON`)이 여는 오버레이.
  오버레이 콘텐츠는 하단 패널 좌표계(`PANEL_Y + n`)로 배치하고 컨테이너만 `OVERLAY_DY` 로 끌어올린다.
- 보스 도전은 상단 우측(`BOSS_BTN`), 전투 화면 중앙은 비워 둔다.
- 보상형 광고는 요정(`FAIRY`)이 전달 — 상단 고정 광고 버튼 금지.
- 플로팅 아이콘을 늘리면 `FLOAT_ICON.count` 와 `GameScene.isReservedUi()` 를 함께 갱신
  (전투 탭 누수 방지).
- **UI 접기**: 하단 탭 바는 남기고 패널 본문만 접는다. 좌표는 `COLLAPSED` 상수 단일 출처.
  UIScene 이 `registry.uiCollapsed` + `game.events('ui-collapse')` 로 알리고,
  GameScene 이 몬스터/단상/탭 존을 아래로 내려 넓힌다.
- 배경 텍스처는 **화면 전체 높이(720x1280)** — 접으면 아래쪽 지면이 그대로 드러난다.
  발밑 그림자는 배경이 아니라 GameScene 이 그린다 (접기 시 함께 내려가야 하므로).
  y 는 고정 상수가 아니라 스프라이트 바닥선에서 계산한다 (`placeGroundShadow`) —
  몬스터(200x170)와 보스(280x250)의 발 위치가 다르기 때문. 원점은 `MONSTER_ORIGIN_Y`.

## 다국어 (ko 기본 / en)
- 화면 문구는 `t('key', '한국어 원문')` 경유. **원문이 곧 폴백**이라 카탈로그에 키가
  없어도 화면이 비지 않는다 (`src/core/i18n.ts`).
- config.ts 의 게임 데이터(영웅/유물/펫/존 이름)는 한국어를 단일 출처로 두고,
  `src/core/names.ts` 의 접근자가 오버레이한다. 씬에서 `def.name` 을 직접 쓰지 말 것.
- 새 문구를 추가하면 `src/core/locales/en.ts` 에 키를 넣는다. 빠뜨려도 빌드는 통과하고
  한국어로 표시되므로, 화면을 영어로 띄워 확인하는 것이 유일한 검증이다.
- **길이가 곧 레이아웃 사고다** — 720x1280 고정 캔버스이므로 탭/버튼 문구는 원문 폭을
  넘지 않는 표현을 고른다. UI 문구를 바꾸면 두 언어 모두 스크린샷으로 확인할 것.
- 언어 전환은 설정 > 언어. 문구가 생성 시점에 박히므로 두 씬을 restart 한다.

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
  실제 SDK 연동은 `AdProvider` 구현체 교체로만 한다 — 네이티브용 구현은 `src/ads.ts`
  (`AdMobProvider`, 플러그인은 동적 import 라 웹 번들에 섞이지 않는다).
- 결제는 `IapProvider` 교체. `ServerVerifiedIapProvider`(core/Iap.ts)가 스토어 토큰을
  `verify-purchase` 에 보내고 **서버 ok 이후에만** 성공을 반환한다 —
  결제 플러그인은 `StorePurchase` 어댑터 한 함수만 맞추면 된다.
- 장비 statPct 상한 300% (인플레 캡). 일일 퀘스트 골드 보상은 goldMult 미적용 (부스트 악용 방지).

## 테스트 툴킷 (docs/TESTING.md)
- QA 치트는 `core/DevTools.ts` 에만 추가 — 패널(?dev=1)과 E2E 가 같은 코드를 쓴다.
- 상태 불변식은 `DevTools.validate()` 에 누적한다. 몽키(`npm run test:monkey`)가 검사.
- `window.__taptap` 훅 시그니처 변경 시 tests/game.spec.ts 의 선언도 갱신.

## BM 규칙 (docs/MONETIZATION.md)
- 보석 지급은 `grantGems` 경유만. 구매 경로는 반드시 서버 검증(ok) 후 `purchased=true`.
- 보석은 시간 단축만 판다 — 무과금 도달 불가 파워 판매 금지. 시뮬은 IAP 미반영이 기준선.
- 확률형 상품 확률은 config(`EQUIP_BOX_RATES`)가 단일 출처 — UI 공시가 자동 동기화된다.
- `GEM_PACKS` 변경 시 `supabase/functions/verify-purchase` 의 PRODUCTS 사본도 갱신.
