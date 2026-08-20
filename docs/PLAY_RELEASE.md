# Google Play 출시 체크리스트

코드 기준으로 확인 가능한 것과, 사람이 해야 하는 것을 분리한다.
(2026-08 현재 상태 기준 — 완료 표시는 이 저장소에서 확인된 것만)

## 코드/에셋 — 완료

- [x] 세로 고정 (`AndroidManifest.xml` `screenOrientation="portrait"`)
- [x] 앱 ID `com.taptap.titans`, 앱 이름 TapTap Titans
- [x] 런처 아이콘 5밀도 x 3종 + 어댑티브 배경색 (`tools/art/icons.py`)
- [x] 스플래시 11버킷
- [x] 게임 아트 90종 + 절차 생성 폴백 (에셋 0개로도 구동 — E2E 로 고정)
- [x] 웹 에셋 2.7MB / 빌드 산출물 4.7MB
- [x] 프레임: CPU 6배 감속에도 43fps (`npm run perf`)
- [x] E2E 49종 + 몽키 + 밸런스 시뮬 + CI

## 사람이 해야 하는 것

### 1. 서버 (랭킹·결제검증)
- [ ] Supabase 프로젝트 생성 + **익명 로그인 활성화**
- [ ] `npx supabase db push` / `functions deploy submit-score clan-ops verify-purchase`
- [ ] `npm run verify:supabase -- --slow` 전 항목 통과
- [ ] `.env.local` 에 URL/anon key (커밋 금지)

### 2. 결제
- [ ] Play Console 에서 인앱 상품 등록 — 상품 ID 는 `src/config.ts` 의 `GEM_PACKS` 와
      `supabase/functions/verify-purchase` 의 PRODUCTS 사본이 **모두 일치**해야 한다
- [ ] 서비스 계정 발급 후 `supabase secrets set GOOGLE_SA_EMAIL=... GOOGLE_SA_PRIVATE_KEY=...
      ANDROID_PACKAGE=com.taptap.titans`
- [ ] Capacitor 결제 플러그인 설치 후 `IapProvider` 구현체 교체 (`src/core/Iap.ts`)
- [ ] 라이선스 테스터로 실결제 1건 → 보석 지급까지 확인

### 3. 광고
- [ ] AdMob 앱/광고 단위 생성
- [ ] Capacitor 광고 플러그인 설치 후 `AdProvider` 구현체 교체 (`src/core/AdRewards.ts`)
- [ ] `AndroidManifest.xml` 에 AdMob 앱 ID 메타데이터 추가
- [ ] 광고 SDK 를 넣는 순간 **광고 ID 수집**이 생긴다 —
      `docs/PRIVACY.md` 와 아래 데이터 보안 신고를 함께 갱신할 것

### 4. 스토어 등록
- [ ] 개인정보처리방침을 공개 URL 로 게시 (`docs/PRIVACY.md` 자리표시자 3개 채우기)
- [ ] 아이콘 512x512 (`store/icon-512.png`), 피처 그래픽 1024x500 (`store/feature-1024x500.png`)
- [ ] 스크린샷 최소 2장 (세로) — `screenshots/` 의 E2E 산출물 사용 가능
- [ ] 앱 제목/짧은 설명/전체 설명
- [ ] 콘텐츠 등급 설문 (전투 묘사 있음, 인앱 구매 있음)
- [ ] 타겟 API 레벨 등 Play 정책 요건 확인

### 5. 서명·빌드
- [ ] JDK 17 + Android SDK 34+ 설치 (이 저장소를 클론한 기기에는 아직 없음)
- [ ] 업로드 키스토어 생성 및 안전 보관
- [ ] `npm run android:sync` 후 Android Studio 에서 서명된 AAB 생성
- [ ] 실기기 확인: 노치/홈바 안전영역, 진동, 오디오 자동재생 정책,
      백그라운드 복귀 시 오프라인 보상

## 데이터 보안(Data safety) 신고 — 현재 코드 기준 답안

광고/결제 SDK 를 붙이기 **전** 상태의 답이다. SDK 를 넣으면 반드시 다시 채울 것.

| 질문 | 답 |
|---|---|
| 데이터를 수집하거나 공유하는가 | 예 (온라인 랭킹 이용 시) |
| 전송 중 암호화 | 예 (HTTPS) |
| 삭제 요청 경로 제공 | 예 (문의 이메일) |

수집 항목:

| 유형 | 항목 | 수집 | 공유 | 필수 여부 | 목적 |
|---|---|---|---|---|---|
| 앱 활동 | 게임 내 진행도(최고 스테이지·유물 수) | 예 | 아니오 | 선택 (랭킹 참여 시) | 앱 기능 |
| 앱 정보 및 성능 | — | 아니오 | — | — | — |
| 개인정보 | 이용자가 입력한 표시 이름 | 예 | 아니오 | 선택 | 앱 기능 |
| 기기 또는 기타 ID | 익명 계정 식별자 | 예 | 아니오 | 선택 | 앱 기능 |
| 금융 정보 | 구매 내역(구매 토큰·상품 ID) | 예 | 아니오 | 필수 (구매 시) | 앱 기능·부정 방지 |

수집하지 않음: 위치, 연락처, 사진/동영상, 파일, 메시지, 건강, 통화 기록, 캘린더,
기기 내 검색 기록, 광고 ID(현재), 사용 통계(분석 이벤트는 앱 내부 링버퍼에만 남고
전송 대상이 설정돼 있지 않다).

## 출시 후 갱신이 필요한 지점

- `GEM_PACKS` 를 바꾸면 `verify-purchase` 의 PRODUCTS 사본도 함께
- `relicsFor` 곡선을 바꾸면 `submit-score` 의 사본도 함께
- 광고/결제 SDK 추가 시 `docs/PRIVACY.md` + 데이터 보안 신고
