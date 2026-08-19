# 테스트 툴킷

## 1. E2E 스위트 (기본)
```bash
npm run build && npm test      # 30개 시나리오 — 커밋 전 필수
```
- `window.__taptap` 훅으로 상태 검증: `{ game, state, tourney, season, clanBoss, dev }`
- 셋업은 `uiReady` 레지스트리 신호를 기능적으로 대기 (고정 sleep 금지)
- 좌표 탭은 `tapGame(page, x, y)` — 논리 좌표(720x1280)를 FIT 변환

## 2. 인게임 QA 패널
```
http://localhost:5173/?dev=1   (dev)   ·   /?dev=1 (preview)
```
- 좌상단 **QA** 버튼 → 슬라이드 패널 (DOM 오버레이, 캔버스 비침투)
- 기능: 자원 지급 / 스테이지 점프 / 환생·쿨다운·일일퀘 리셋 /
  **상태 프리셋 5종**(신규·초반·중반·환생직전·후반) / 오프라인 1h·8h 시뮬 /
  세이브 내보내기·가져오기·전체 초기화 / 실시간 상태 요약 / Analytics 이벤트 로그 /
  불변식 검사
- 치트 로직은 전부 `src/core/DevTools.ts` — **E2E 와 같은 코드를 공유**하므로
  패널에서 재현한 시나리오는 그대로 테스트로 옮길 수 있다
- `?dev=1` 없으면 코드 자체가 로드되지 않음 (동적 import). 스토어 빌드에서
  완전 제거하려면 vite define 플래그로 분기 추가

## 3. 몽키 테스트 (내구성)
```bash
npm run test:monkey                     # 60초 랜덤 입력
MONKEY_MS=300000 npm run test:monkey    # 5분
MONKEY_SEED=12345 npm run test:monkey   # 실패 재현용 시드 변경
```
- 시드 고정 LCG → **실패가 재현 가능**. 실패 시 시드를 이슈에 기록할 것
- 종료 조건: 콘솔/페이지 에러 0건 + `DevTools.validate()` 불변식 0건
  (NaN 전파, 음수 골드, kills 범위, SP 음수, 크리 상한 등)
- 기본 스위트에서 자동 제외 (`grepInvert @monkey`)

## 4. 밸런스 시뮬 리포트
```bash
npm run sim          # 콘솔 리포트 (3일, 프로필 3종)
npm run sim:report   # sim 실행 + sim/out/report.html 생성
```
- 도달 곡선(3프로필) + 체류시간 벽 히트맵(주황 = 하드 벽) + 요약 테이블
- 곡선 변경 PR 에는 리포트 스크린샷 or 요약 테이블을 첨부할 것

## 새 기능을 붙일 때
1. `GameState` 에 로직 → `tests/game.spec.ts` 에 상태 시나리오 추가
2. UI 좌표를 만들면 `config.ts` 레이아웃 상수로 (테스트와 공유)
3. 치트가 필요하면 `DevTools` 에 추가 (패널 버튼은 `devpanel.ts`)
4. 몬스터/드롭 확률처럼 랜덤이 끼면 몽키 불변식(`validate`)에 사후 조건 추가
