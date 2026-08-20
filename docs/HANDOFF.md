# 로컬 Claude Code 인수인계 프롬프트

로컬 터미널에서 `claude` 를 실행한 뒤 아래 블록 전체를 한 번에 붙여넣는다.
(`CLAUDE.md` 는 Claude Code 가 자동으로 읽으므로 규칙을 따로 설명할 필요 없다.)

---

```
# 프로젝트
https://github.com/psh10004okpro/taptap
브랜치: claude/2d-game-engine-research-ig32yw  ← main 아님, 반드시 이 브랜치
아직 클론 전이면:
  git clone -b claude/2d-game-engine-research-ig32yw https://github.com/psh10004okpro/taptap.git

Phaser 4 + TypeScript + Vite 로 만든 모바일 세로형(720x1280) 방치 탭 RPG.
탭타이탄2 문법을 따른다. 원격 세션에서 여기까지 개발됐고 지금부터 로컬에서 이어간다.

# 최종 목표
구글 플레이에 출시 가능한 완성도의 방치형 탭 RPG.
지금 남은 건 (1) 실제 아트 (2) 서버 실배포 (3) 스토어 SDK 연동 세 가지다.
게임 시스템·UI·테스트·CI 는 이미 완성돼 있으니 갈아엎지 말고 그 위에 붙여라.

# 현재 상태 (2026-08-20)
완료: 전투/성장/환생/스킬트리(18노드)/영웅24/유물40/펫12/장비/일일퀘스트/업적20/
      주말토너먼트/시즌/클랜보스/보석BM, 탭타이탄2식 UI, 절차합성 사운드+BGM, 온보딩,
      **다크 판타지 아트 90종**(+앱 아이콘·스플래시·스토어 자산, 절차 생성 폴백 유지),
      **다국어 한/영**(오버레이 방식, 한국어가 폴백 — docs/I18N.md),
      안전영역·백그라운드 복귀 정산·오디오 자동재생, E2E 54종 + 몽키 + 시뮬 + CI(그린)

막힌 것 — 전부 외부 계정/툴체인이 있어야 진행된다:
  - Supabase 실배포: 코드·스키마 완료. migrations 와 RLS 는 실 Postgres 로 검증됨
    (`npm run verify:migrations`). 프로젝트만 있으면 배포 후
    `npm run verify:supabase -- --slow` 로 서버 검증까지 한 번에 확인된다.
  - 광고/결제: AdMobProvider 와 서버검증 IapProvider 구현 완료.
    AdMob 앱/광고단위 ID, 결제 플러그인 선택만 남았다.
  - 안드로이드 실기기: JDK 17 + Android SDK 필요.
  - 레이드+카드: 카드 30종 데이터와 경제 시뮬은 완료(`npm run sim:raid`).
    나머지는 서버 원장이 전제라 Supabase 확보 후.

출시까지 남은 항목의 단일 출처는 `docs/PLAY_RELEASE.md` 다.

# 진행 순서 (0~2 는 완료 — 다시 하지 말 것)
3) Supabase 실배포. project ref / URL / anon key / access token 을 받고
   Authentication > Providers > Anonymous Sign-ins 를 켠 뒤 supabase/README.md 절차.
   배포 후 `npm run verify:supabase -- --slow` 가 전 항목 통과해야 한다.
4) 안드로이드 실기기 빌드 (docs/ANDROID.md). 안전영역·오디오·백그라운드 복귀는
   E2E 로 고정돼 있으니, 실기기에서는 진동·실제 노치 수치·저사양 프레임을 본다.
5) 광고/결제 실 SDK. AdMob 은 매니페스트 앱 ID 와 VITE_ADMOB_REWARDED_ID 교체.
   결제는 플러그인을 고른 뒤 StorePurchase 어댑터 한 함수만 맞추면 된다.
6) (서버 확보 후) 레이드+카드 — docs/RAIDS.md 의 조정된 수치 그대로.

# 작업 방식
- CLAUDE.md 규칙 준수 (Phaser v3 API 금지, core/ 와 config.ts 는 Phaser import 금지,
  좌표는 config.ts 상수, 곡선 변경 시 npm run sim 필수, 텍스처는 BootScene 에서만,
  보석은 grantGems + 서버검증 후, 광고는 AdRewards.offer 경유).
- 각 단계마다 `npm run build && npm test` 그린 확인 후 커밋. 테스트를 지우지 말고
  새 기능엔 tests/game.spec.ts 에 시나리오를 추가해라.
- UI 를 건드리면 스크린샷으로 실제 화면을 확인해라 (좌표가 조용히 어긋난다).
- 큰 결정이 필요하면 진행 전에 나에게 선택지를 물어봐.
```

---

## 남은 작업 요약 (2026-08 기준)

| 항목 | 상태 | 비고 |
|---|---|---|
| 게임 시스템 | 완료 | 전투·성장·환생·스킬트리·펫·장비·퀘스트·업적·토너먼트·시즌·클랜보스·BM |
| UI (탭타이탄2 문법) | 완료 | 성장 5탭 + 플로팅 오버레이 + 요정 광고 + UI 접기 |
| 사운드/연출/온보딩 | 완료 | 절차 합성 SFX 13종 + BGM, 파티클, 5단계 튜토리얼 |
| 테스트/CI | 완료 | E2E 50 + 몽키 + 밸런스 시뮬 + GitHub Actions |
| 아트 | 완료 | 다크 판타지 90종 + 절차 생성 폴백. 앱 아이콘·스플래시·스토어 이미지 |
| 다국어 | 완료 | 한국어/영어 오버레이 (`docs/I18N.md`) |
| Supabase 배포 | **자격증명 대기** | migrations·RLS 는 실 Postgres 로 검증 완료(`npm run verify:migrations`). 원격 배포 후 `npm run verify:supabase -- --slow` |
| 광고 SDK | **계정 대기** | AdMobProvider 구현 완료. AdMob 앱/단위 ID 만 교체하면 동작 |
| 결제 SDK | **플러그인 미선택** | 서버 검증(ServerVerifiedIapProvider)은 구현. StorePurchase 어댑터만 필요 |
| 안드로이드 실기기 | **툴체인 대기** | 이 맥에 JDK 17·Android SDK 없음. cap sync·프레임 측정은 완료 |
| 레이드/카드 | 설계만 | 서버 선행 |

## 로컬 환경 요구사항

- Node 22 이상 (밸런스 시뮬이 네이티브 TS 실행 사용)
- `npm install` 후 `npx playwright install chromium` (E2E 최초 1회)
- 아트 재생성 시 `pip install requests pillow`
- migrations 검증에 Docker (`npm run verify:migrations`)
- 안드로이드 빌드에 JDK 17 + Android SDK 34+

출시까지 남은 것은 `docs/PLAY_RELEASE.md` 체크리스트가 단일 출처다.
