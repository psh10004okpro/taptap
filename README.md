# TapTap Titans

탭 타이탄 2 스타일의 **모바일 세로형 방치 탭 RPG**.
Phaser 4 + TypeScript + Vite, 외부 아트 에셋 0개(전부 런타임 절차 생성).

## 실행

```bash
npm install
npm run dev      # 개발 서버 (HMR)
npm run build    # 타입체크 + 프로덕션 빌드 (dist/)
npm test         # 빌드 후 Playwright E2E (사전 npm run build 필요)
```

모바일 확인: `npm run dev -- --host` 후 폰 브라우저로 접속.

## 게임 구조

| 시스템 | 내용 |
|---|---|
| 전투 | 탭 데미지 + 영웅 DPS(10Hz 틱), 5% 확률 8배 크리티컬 |
| 스테이지 | 일반 9마리 → 보스(30초 제한). 실패 시 파밍 모드 + "보스 도전" 버튼 |
| 성장 | 탭 공격력 업그레이드, 영웅 8명 고용/레벨업(25레벨마다 DPS x2) |
| 환생 | 스테이지 25+에서 유물 획득, 유물당 영구 데미지 +10% |
| 저장 | localStorage 자동 저장(5초/백그라운드 전환 시), 오프라인 보상(DPS x 40%, 최대 4시간) |

## 코드 맵

```
src/config.ts          밸런스 곡선·영웅 정의 (순수 TS)
src/core/GameState.ts  중앙 상태 + 이벤트 (Phaser 비의존 → 단위 테스트 가능)
src/core/format.ts     큰 숫자 포맷 (1.2K, 3.4M ...)
src/scenes/BootScene   절차 텍스처 생성 (몬스터/보스/UI 전부)
src/scenes/GameScene   전투 필드: 스폰·데미지·보스 타이머·이펙트 풀
src/scenes/UIScene     HUD·업그레이드 패널·팝업
tests/game.spec.ts     Playwright E2E 6종 (window.__taptap 훅 사용)
```

## 설계 원칙

- **로직/렌더 분리**: `core/` 는 Phaser 를 모른다. 밸런스 수정은 `config.ts` 한 곳.
- **오브젝트 풀링**: 데미지 숫자·코인은 재사용 (GC 스파이크 방지).
- **드로우콜 절약**: 텍스처는 부팅 시 1회 생성 후 재사용.
- **치팅 주의**: 현재 점수/골드는 클라이언트 저장. 랭킹/멀티 도입 시 서버 검증 필수.

## 알려진 제약

- 헤드리스 CI 스크린샷에서 일부 한글 글리프가 대체 폰트로 렌더링될 수 있음(실기기는 정상).
- 사운드 미구현.
