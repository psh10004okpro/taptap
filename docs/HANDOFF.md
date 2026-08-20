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

# 현재 상태
완료: 전투/성장/환생/스킬트리(18노드)/영웅24/유물40/펫12/장비/일일퀘스트/업적20/
      주말토너먼트/시즌/클랜보스/보석BM, 탭타이탄2식 UI(성장 5탭 + 플로팅 오버레이 +
      우상단 보스 + 요정 광고 + UI 접기), 절차합성 사운드+BGM, 5단계 온보딩,
      E2E 46종 + 몽키 + 밸런스 시뮬 + GitHub Actions CI
미완: 아트(절차 생성 플레이스홀더), Supabase 원격 경로 미검증, 광고/결제 Mock,
      레이드+카드(설계만), 다국어(한국어 하드코딩)

# 진행 순서
0) 먼저 CLAUDE.md / README.md / docs/CONTENT_GAP.md 를 읽고
   `npm run build && npm test` 로 그린인지 확인한 뒤 현재 상태를 요약해줘.
   여기까지는 코드를 수정하지 마.

1) 디자인 컨셉 시안 — 내가 고를 수 있게 3~4개.
   이미지 생성은 tools/art/generate.py 와 같은 API(gpt-image-2, OpenAI 호환):
     export ELICE_API_KEY=<내 키>
     export ELICE_BASE_URL=https://mlapi.run/eb5722f3-111c-4fb5-a65c-3a9d44f82fc1/v1
   컨셉마다 같은 조건으로 [존 배경 720x1280(하단 55%가 지면) / 몬스터 1 / 보스 1 /
   영웅 초상 1] 을 뽑고, 컨셉별 폴더 + 비교용 HTML 시트로 정리해줘.
   방향은 서로 확실히 구분되게 (예: 밝은 카툰치비 / 다크 판타지 / 픽셀아트 / 수채화동화).

2) 내가 컨셉을 고르면 tools/art/README.md 절차로 전체 77종 생성 → 후처리 →
   public/assets/ 반영 → 모든 탭·접힘 상태·보스전 스크린샷 검증 → 커밋.
   절차 생성 폴백은 반드시 유지 (에셋 없이도 게임이 돌아가야 함).

3) Supabase 실배포 (내가 프로젝트를 만들면). supabase/README.md 절차로
   migrations + Edge Functions 배포하고, 점수 등록/조회와 서버 검증(진행속도 상한)이
   실제로 동작하는지 확인. 이 경로는 지금까지 로컬 폴백으로만 테스트됐다.

4) 안드로이드 실기기 빌드 (docs/ANDROID.md) — 세로 고정, 노치/홈바 안전영역,
   저사양 프레임, 진동, 오디오 자동재생, 백그라운드 복귀 오프라인 보상 확인.

5) 광고/결제 실 SDK — AdMob 은 AdProvider, Play 빌링은 IapProvider 구현체만 교체.
   Mock 은 ?dev=1 용으로 남긴다.

6) (서버 확보 후) docs/RAIDS.md + supabase/migrations/draft/0004 대로 레이드+카드.

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
