# TapTap Titans

탭 타이탄 2 스타일의 **모바일 세로형 방치 탭 RPG**.
Phaser 4 + TypeScript + Vite, 외부 아트 에셋 0개(전부 런타임 절차 생성).

## 실행

```bash
npm install
npm run dev            # 개발 서버 (HMR). 폰에서 보려면 -- --host
npm run build          # 타입체크 + 프로덕션 빌드 (dist/)
npm test               # Playwright E2E 11종 (사전 npm run build 필요)
npm run android:sync   # 안드로이드 빌드 동기화 (docs/ANDROID.md)
```

## 게임 구조

| 시스템 | 내용 |
|---|---|
| 전투 | 탭 데미지 + 영웅 DPS(10Hz 틱), 크리티컬(기본 5% x8, 유물/펫/영웅으로 강화) |
| 스테이지 | 일반 9마리 → 보스(기본 30초 제한). 실패 시 파밍 모드 + "보스 도전" |
| 스킬 6종 | 화염검·전투 함성·황금손·분신술·천상의 일격(즉발 40배)·필살 강타(크리+25%p) |
| 성장 | 탭 공격력, 영웅 24명(25레벨 DPS x2 + 20레벨 패시브 해금, 3페이지) |
| 환생 | 스테이지 25+에서 유물 획득(화폐). 골드·영웅·스테이지 초기화, 유물 강화는 유지 |
| 유물 상점 | 유물 소비 영구 강화 20종 (효과 타입 기반, 데이터 주도 집계) |
| 스킬트리 | 3계열(기사/군주/연금술사) 12노드, SP=스테이지 마일스톤+환생, 유물로 리스펙 |
| 펫 | 6종 — 보스 알 드롭(6%)으로 획득/성장, 영구 보너스 |
| 장비 | 보스 처치 18% 드롭, 3슬롯(무기/갑옷/장신구) x 4등급, 상위 자동 장착 |
| 일일 퀘스트 | 처치/보스/스킬 3종, 매일 리셋, 골드·유물 보상 |
| 업적 | 평생 통계 기반 8종, 유물 보상 |
| 주말 토너먼트 | 어비셜 방식 제로베이스 경쟁(토~일), 스테이지 10당 유물 1 |
| 클랜 보스 | 주간 보스, 공격권 3회, 처치 시 유물 15 (온라인 클랜은 Supabase 연동 시) |
| 시즌 | 4주 단위 랭킹 리셋 + 시즌 종료 보상 |
| 광고 보상 슬롯 | 골드 x2(30분)·스킬 쿨다운 리셋·오프라인 2배 — Mock 광고, SDK 는 Provider 교체만 |
| 랭킹 | Supabase 온라인 랭킹(서버 검증) 또는 로컬 모드 자동 폴백 |
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
tests/game.spec.ts        Playwright E2E 16종 (window.__taptap 훅)
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
- 사운드 미구현. 디자인/컨셉 아트는 추후 교체 예정(절차 생성 그래픽은 플레이스홀더).
