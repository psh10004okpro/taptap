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
| 전투 | 탭 데미지 + 영웅 DPS(10Hz 틱), 크리티컬(기본 5% x8, 유물로 강화) |
| 스테이지 | 일반 9마리 → 보스(기본 30초 제한). 실패 시 파밍 모드 + "보스 도전" |
| 스킬 4종 | 화염검(탭x3)·전투 함성(DPSx3)·황금손(골드x2)·분신술(자동탭 5/s). 30초 지속, 쿨다운 2~4분, 스테이지 해금 |
| 성장 | 탭 공격력, 영웅 8명(25레벨마다 DPS x2) |
| 환생 | 스테이지 25+에서 유물 획득(화폐). 골드·영웅·스테이지 초기화, 유물 강화는 유지 |
| 유물 상점 | 유물 소비 영구 강화 6종: 탭뎀/DPS/골드/크리확률/크리배율/보스시간 |
| 랭킹 | Supabase 온라인 랭킹(서버 검증) 또는 로컬 모드 자동 폴백 |
| 저장 | localStorage 자동 저장(5초/백그라운드 전환), 오프라인 보상(DPS x 40%, 최대 4시간) |

## 코드 맵

```
src/config.ts             밸런스 곡선·영웅/스킬/유물 정의 (순수 TS)
src/core/GameState.ts     중앙 상태 + 이벤트 (Phaser 비의존)
src/core/Leaderboard.ts   랭킹 클라이언트 (Supabase / 로컬 폴백)
src/core/format.ts        큰 숫자 포맷 (1.2K, 3.4M ...)
src/scenes/BootScene      절차 텍스처 생성 (몬스터/보스/스킬/유물/UI)
src/scenes/GameScene      전투: 스폰·데미지·보스 타이머·분신술·이펙트 풀
src/scenes/UIScene        HUD·스킬바·탭 패널(영웅/유물/랭킹)·팝업
supabase/                 랭킹 서버: RLS 스키마 + 점수 검증 Edge Function
android/                  Capacitor 안드로이드 프로젝트 (세로 고정)
tests/game.spec.ts        Playwright E2E 11종 (window.__taptap 훅)
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
