# 로컬 Claude Code 인수인계 프롬프트

로컬에서 `claude` 를 실행한 뒤 아래 프롬프트를 복사해 붙여넣으면 된다.
`CLAUDE.md` 는 Claude Code 가 자동으로 읽으므로 규칙을 다시 설명할 필요는 없다.

---

## 0. 첫 메시지 (프로젝트 파악용 — 한 번만)

```
이 저장소는 Phaser 4 + TypeScript 로 만든 모바일 세로형 방치 탭 RPG(탭타이탄2 스타일)다.
원격 세션에서 여기까지 개발됐고, 지금부터 로컬에서 이어서 작업한다.

먼저 아래를 읽고 현재 상태를 파악해줘:
- CLAUDE.md (개발 규칙 — 반드시 준수)
- README.md (구조 개요)
- docs/CONTENT_GAP.md (탭타이탄2 대비 남은 격차)
- docs/HANDOFF.md (이 문서 — 남은 작업 목록)

그 다음 `npm run build && npm test` 로 현재 상태가 그린인지 확인하고,
무엇이 되어 있고 무엇이 남았는지 요약해줘. 아직 코드는 수정하지 마.
```

---

## 1. 디자인 컨셉 시안 (가장 먼저 하고 싶은 작업)

```
게임 아트 디자인 컨셉을 3~4개 만들어서 고를 수 있게 해줘.

이미지 생성은 tools/art/generate.py 와 같은 API 를 쓴다:
  export ELICE_API_KEY=<내 키>
  export ELICE_BASE_URL=https://mlapi.run/eb5722f3-111c-4fb5-a65c-3a9d44f82fc1/v1
  (gpt-image-2, OpenAI 호환 /v1/images/generations)

각 컨셉마다 다음을 같은 프롬프트 스타일로 생성해서 비교할 수 있게 해줘:
- 존 배경 1장 (720x1280 세로, 하단 55% 가 지면)
- 몬스터 1종 (투명 배경)
- 보스 1종 (투명 배경)
- 영웅 초상 1종

컨셉 방향은 서로 확실히 구분되게 잡아줘. 예를 들면:
① 밝은 카툰/치비  ② 다크 판타지  ③ 픽셀아트  ④ 수채화/동화풍

결과는 컨셉별로 폴더를 나눠 저장하고, 한눈에 비교할 수 있는 HTML 시트를 만들어줘.
내가 고르면 그 컨셉으로 전체 77종을 생성한다.
```

## 2. 선택한 컨셉으로 전체 아트 생성·적용

```
[컨셉 N] 으로 확정. tools/art/README.md 절차대로 전체 아트를 생성하고 게임에 반영해줘.

1. tools/art/generate.py 의 STYLE 상수를 확정 컨셉으로 교체
2. 전체 생성 → process.py 후처리 → public/assets/
3. 게임 실행해서 스크린샷으로 확인 (모든 탭 + 접힘 상태 + 보스전)
4. 잘린 곳/투명 처리 실패/색 충돌 있으면 수정
5. npm run build && npm test 그린 확인 후 커밋

절차 생성 폴백은 유지해야 한다 (에셋 없이도 게임이 돌아가야 함).
```

## 3. Supabase 실서버 연동 (랭킹/클랜/결제검증)

```
Supabase 프로젝트를 만들었다. supabase/README.md 절차대로 실제로 배포하고
원격 랭킹 경로를 검증해줘.

- migrations 적용 (0001~0003)
- Edge Functions 배포 (submit-score, clan-ops, verify-purchase)
- .env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 설정
- 실제로 점수 등록 → 조회가 되는지, 서버 검증(진행 속도 상한)이 실제로 거부하는지 확인

이 경로는 지금까지 로컬 폴백으로만 테스트됐고 원격은 한 번도 실행된 적이 없다.
동작 안 하는 부분이 있으면 고쳐줘.
```

## 4. 실기기 안드로이드 빌드

```
docs/ANDROID.md 절차로 안드로이드 실기기에서 돌려보고 싶다.
빌드해서 APK 를 만들고, 실기기에서 확인할 체크리스트를 만들어줘.

특히 확인할 것:
- 세로 고정 / 노치·홈바 안전영역
- 저사양 기기 프레임 (전투 이펙트 + 분신술 동시)
- 진동(Haptics), 오디오 자동재생 정책
- 백그라운드 전환 후 복귀 시 오프라인 보상
```

## 5. 광고·결제 SDK 실연동

```
Mock 프로바이더를 실제 SDK 로 교체해줘.
- 광고: AdMob (Capacitor 플러그인) → src/core/AdRewards.ts 의 AdProvider 구현체 교체
- 결제: Google Play Billing → src/core/Iap.ts 의 IapProvider 구현체 교체

CLAUDE.md 규칙 준수: 보석 지급은 grantGems 경유, 서버 검증(verify-purchase) 성공 후에만
purchased=true. 광고는 AdRewards.offer 경유 (퍼널 계측 유지).
Mock 은 ?dev=1 경로용으로 남겨둘 것.
```

## 6. 레이드 + 카드 시스템 (서버 확보 후)

```
docs/RAIDS.md 설계와 supabase/migrations/draft/0004_raids_cards.sql 초안대로
클랜 레이드 + 카드 시스템을 구현해줘.
서버 크론이 필요하므로 Supabase 실배포가 선행돼야 한다.
```

---

## 남은 작업 요약 (2026-08 기준)

| 항목 | 상태 | 비고 |
|---|---|---|
| 게임 시스템 | 완료 | 전투·성장·환생·스킬트리·펫·장비·퀘스트·업적·토너먼트·시즌·클랜보스·BM |
| UI (탭타이탄2 문법) | 완료 | 성장 5탭 + 플로팅 오버레이 + 요정 광고 + UI 접기 |
| 사운드/연출/온보딩 | 완료 | 절차 합성 SFX 13종 + BGM, 파티클, 5단계 튜토리얼 |
| 테스트/CI | 완료 | E2E 46 + 몽키 + 밸런스 시뮬 + GitHub Actions |
| **아트** | **미착수** | 파이프라인만 완성 (API 가 원격 세션에서 차단됨) — 위 1·2번 |
| **Supabase 실배포** | **미검증** | 코드는 있으나 원격 경로 실행 이력 없음 — 위 3번 |
| **실 SDK (광고/결제)** | **미착수** | Mock 프로바이더만 — 위 5번 |
| **레이드/카드** | **설계만** | 서버 선행 — 위 6번 |
| 다국어 | 미착수 | 문구가 한국어 하드코딩 |

## 로컬 환경 요구사항

- Node 22 이상 (밸런스 시뮬이 네이티브 TS 실행 사용)
- `npx playwright install chromium` (E2E 최초 1회)
- 아트 생성 시 `pip install requests pillow`
