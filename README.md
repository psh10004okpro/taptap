# TapTap Titans

탭 타이탄 2 스타일의 **모바일 세로형 방치 탭 RPG**.
Phaser 4 + TypeScript + Vite. 아트는 생성형(다크 판타지) 90종 + 절차 생성 폴백 —
`public/assets/` 가 비어 있어도 게임은 그대로 돌아간다.

## 로컬에서 이어서 작업하기

```bash
# 1) 클론 (작업 브랜치 그대로)
git clone -b claude/2d-game-engine-research-ig32yw \
  https://github.com/psh10004okpro/taptap.git
cd taptap

# 2) 의존성 (Node 22 이상 필요 — sim 이 네이티브 TS 실행을 쓴다)
npm install
npx playwright install chromium      # E2E 브라우저 (최초 1회)

# 3) 개발 서버
npm run dev                          # http://localhost:5173
npm run dev -- --host                # 같은 와이파이의 폰에서 접속
```

`main` 이 아니라 **`claude/2d-game-engine-research-ig32yw`** 브랜치가 최신입니다.

### 자주 쓰는 명령

```bash
npm run build          # 타입체크 + 프로덕션 빌드 (dist/) — 커밋 전 필수
npm test               # Playwright E2E 48종 (사전 npm run build 필요)
npm run test:monkey    # 랜덤 입력 내구성 테스트 (시드 재현 가능)
npm run sim            # 밸런스 시뮬 (곡선 수정 시 필수)
npm run sim:report     # 시뮬 + HTML 리포트 (sim/out/report.html)
npm run preview        # 프로덕션 빌드 미리보기 (localhost:4173)
npm run android:sync   # 안드로이드 빌드 동기화 (docs/ANDROID.md)
# QA 패널: 실행 후 URL 에 ?dev=1 붙이기 (docs/TESTING.md)
```

### 선택 설정

**온라인 랭킹** — 없으면 로컬 랭킹으로 자동 폴백하므로 필수는 아니다.
`.env.local` (gitignore 됨) 에:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
서버 배포 절차는 `supabase/README.md`.

**아트 재생성** — 스타일을 바꾸거나 일부를 다시 뽑을 때 (기본 에셋은 이미 커밋돼 있다).
```bash
pip install requests pillow
export ELICE_API_KEY=<키>
export ELICE_BASE_URL=https://mlapi.run/<endpoint-id>/v1
python3 tools/art/generate.py     # 원본 생성 (재개 가능)
python3 tools/art/process.py      # 후처리 → public/assets/ + manifest.json
```
자세한 규격은 `tools/art/README.md`. 에셋이 없으면 BootScene 이 절차 생성으로 폴백한다.

### 개발 규칙

`CLAUDE.md` 에 아키텍처 불변식·UI 문법·밸런스/BM 규칙이 정리돼 있다.
수정 전에 한 번 읽을 것 (Phaser v3 API 금지, core/ 는 Phaser import 금지,
좌표는 config.ts 상수, 곡선 변경 시 sim 필수 등).

| 문서 | 내용 |
|---|---|
| `docs/HANDOFF.md` | **로컬 Claude Code 인수인계 프롬프트 + 남은 작업 목록** |
| `docs/TESTING.md` | E2E·QA 패널·몽키·시뮬 사용법, 주요 UI 좌표표 |
| `docs/BALANCE.md` | 곡선 설계 근거, 벽 위치, 마나 미도입 사유 |
| `docs/CONTENT_GAP.md` | 탭타이탄2 대비 콘텐츠 격차 |
| `docs/MONETIZATION.md` | BM 원칙, 요정 광고, 확률 공시 |
| `docs/ANALYTICS.md` | 분석 이벤트 스키마 |
| `docs/ANDROID.md` | Capacitor 안드로이드 빌드 |
| `docs/RAIDS.md` | 레이드/카드 설계 (미구현 — 서버 확보 후) |
| `docs/PLAY_RELEASE.md` | **출시 체크리스트 + 데이터 보안 신고 답안** |
| `docs/PRIVACY.md` | 개인정보처리방침 초안 (게시 전 자리표시자 3개) |
| `docs/I18N.md` | 다국어 구조와 문구 추가 절차 |

## 게임 구조

| 시스템 | 내용 |
|---|---|
| 전투 | 탭 데미지 + 영웅 DPS(10Hz 틱), 크리티컬(기본 5% x8, 유물/펫/영웅으로 강화) |
| 스테이지 | 일반 9마리 → 보스(기본 30초 제한). 실패 시 파밍 모드 + "보스 도전" |
| 스킬 6종 | 화염검·전투 함성·황금손·분신술·천상의 일격(즉발 40배)·필살 강타(크리+25%p) |
| 성장 | 탭 공격력, 영웅 24명(25레벨 DPS x2 + 20/100/200레벨 패시브 3중, 3페이지) |
| 환생 | 스테이지 25+에서 유물 획득(화폐). 골드·영웅·스테이지 초기화, 유물 강화는 유지 |
| 유물 상점 | 유물 소비 영구 강화 40종 (효과 타입 기반, 데이터 주도 집계) |
| 스킬트리 | 3계열(기사/군주/연금술사) 18노드, SP=스테이지 마일스톤+환생, 유물로 리스펙 |
| 펫 | 12종 — 보스 알 드롭(6%)으로 획득/성장, 영구 보너스 |
| 장비 | 보스 처치 18% 드롭, 3슬롯(무기/갑옷/장신구) x 4등급, 상위 자동 장착 |
| 일일 퀘스트 | 6종 풀에서 매일 3종 로테이션(날짜 시드), 골드·유물 보상 |
| 업적 | 평생 통계 기반 20종, 유물 보상 |
| 주말 토너먼트 | 어비셜 방식 제로베이스 경쟁(토~일), 스테이지 10당 유물 1 |
| 클랜 보스 | 주간 보스, 공격권 3회, 처치 시 유물 15 (온라인 클랜은 Supabase 연동 시) |
| 시즌 | 4주 단위 랭킹 리셋 + 시즌 종료 보상 |
| 광고 보상 | 요정이 전투 화면을 가로지르고 탭하면 제안 — 골드 x2(30분)/쿨다운 리셋/오프라인 2배 |
| 랭킹 | Supabase 온라인 랭킹(서버 검증) 또는 로컬 모드 자동 폴백 |
| 상점/BM | 보석 재화, 팩 4종(Mock/실결제 Provider 교체), 소비 싱크 4종, VIP 티어, 확률 공시 |
| 저장 | localStorage 자동 저장(5초/백그라운드 전환), 오프라인 보상(DPS x 40%, 최대 4시간) |

## 코드 맵

```
src/config.ts             밸런스 곡선·영웅/스킬/유물 정의 (순수 TS)
src/core/GameState.ts     중앙 상태 + 이벤트 (Phaser 비의존)
src/core/Leaderboard.ts   랭킹 클라이언트 (Supabase / 로컬 폴백)
src/core/AdRewards.ts     보상형 광고 훅 (AdProvider 인터페이스 + Mock)
src/core/Analytics.ts     분석 이벤트 (docs/ANALYTICS.md)
sim/                      밸런스 시뮬레이터 (docs/BALANCE.md) — npm run sim
src/core/format.ts        큰 숫자 포맷 (1.2K, 3.4M ...)
src/scenes/BootScene      절차 텍스처 생성 (몬스터/보스/스킬/유물/UI)
src/scenes/GameScene      전투: 스폰·데미지·보스 타이머·분신술·이펙트 풀
src/scenes/UIScene        HUD·스킬바·탭 패널(영웅/유물/랭킹)·팝업
supabase/                 랭킹 서버: RLS 스키마 + 점수 검증 Edge Function
android/                  Capacitor 안드로이드 프로젝트 (세로 고정)
tests/game.spec.ts        Playwright E2E 48종 (window.__taptap 훅)
```

## 온라인 랭킹 켜기

`supabase/README.md` 참고. 요약: Supabase 프로젝트 생성 → 익명 로그인 활성화 →
`supabase db push` → `supabase functions deploy submit-score` →
`.env.local` 에 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
미설정 시 랭킹 탭은 로컬 모드로 동작한다.

## 설계 원칙

- **로직/렌더 분리**: `core/` 는 Phaser 를 모른다. 밸런스 수정은 `config.ts` 한 곳.
- **오브젝트 풀링**: 데미지 숫자·코인 재사용 (GC 스파이크 방지).
- **드로우콜 절약**: 텍스처는 부팅 시 1회 생성 후 재사용.
- **서버 불신뢰 원칙**: 랭킹 쓰기는 Edge Function 만 가능(RLS), 진행 속도·수치 상한 검증.

## 알려진 제약

- 헤드리스 CI 스크린샷에서 일부 한글 글리프가 대체 폰트로 렌더링될 수 있음(실기기는 정상).
- QA 패널(`?dev=1`)과 `core/DevTools.ts` 문구는 한국어만 있다 (개발자용).
- 아트는 다크 판타지 컨셉(`tools/art/concepts/`)으로 확정. UI 텍스처(패널/버튼/바)는
  일관성·용량 때문에 의도적으로 절차 생성을 유지한다.
