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
- [x] E2E 53종 + 몽키 + 밸런스 시뮬 + CI
- [x] 안전영역(노치/홈바) 인셋 대응 · 오디오 자동재생 해제 · 백그라운드 복귀 정산
- [x] 다국어 한/영 (`docs/I18N.md`)

## 사람이 해야 하는 것

### 1. 서버 (랭킹·결제검증)
- [x] migrations 가 실제 Postgres 에 적용되고 RLS 불변식이 지켜지는지 검증
      (`bash tools/verify-migrations.sh` — anon/authenticated 에 INSERT 권한을 줘도 거부되는지까지)
- [ ] Supabase 프로젝트 생성 + **익명 로그인 활성화**
- [ ] `npx supabase db push` / `functions deploy submit-score clan-ops verify-purchase`
- [ ] `npm run verify:supabase -- --slow` 전 항목 통과
- [ ] `.env.local` 에 URL/anon key (커밋 금지)

### 2. 결제
- [x] 서버 검증 프로바이더 구현 (`ServerVerifiedIapProvider`, `src/core/Iap.ts`)
      — 스토어 결제로 받은 purchaseToken 을 `verify-purchase` 에 보내고
      **서버가 ok 를 준 뒤에만** 성공을 반환한다 (지급은 grantGems 경유)
- [ ] Capacitor 결제 플러그인 선택·설치 후 `StorePurchase` 어댑터 10줄 작성:
      `(productId) => Promise<{ purchaseToken } | null>` 모양만 맞추면 된다.
      그 뒤 `this.iap.setProvider(new ServerVerifiedIapProvider(buy))` 로 교체
      (현재 검토한 `@capgo/capacitor-purchases` 는 Capacitor 5 전용이라 부적합)
- [ ] Play Console 에서 인앱 상품 등록 — 상품 ID 는 `src/config.ts` 의 `GEM_PACKS` 와
      `supabase/functions/verify-purchase` 의 PRODUCTS 사본이 **모두 일치**해야 한다
- [ ] 서비스 계정 발급 후 `supabase secrets set GOOGLE_SA_EMAIL=... GOOGLE_SA_PRIVATE_KEY=...
      ANDROID_PACKAGE=com.taptap.titans`
- [ ] 라이선스 테스터로 실결제 1건 → 보석 지급까지 확인

### 3. 광고
- [x] `@capacitor-community/admob` 설치 + `AdMobProvider` 구현 (`src/ads.ts`)
      네이티브에서만 동적 로드되고, 실패하면 조용히 비활성(게임은 그대로 진행)
- [x] `AndroidManifest.xml` 에 AdMob 앱 ID 메타데이터 (현재 **구글 테스트 앱 ID**)
- [ ] AdMob 콘솔에서 앱/보상형 광고 단위 생성
- [ ] `AndroidManifest.xml` 의 `com.google.android.gms.ads.APPLICATION_ID` 를 실제 앱 ID 로
- [ ] `.env.local` 또는 빌드 환경에 `VITE_ADMOB_REWARDED_ID=<실제 광고 단위>`
      (미설정 시 테스트 광고로 요청한다 — 실광고를 자기 계정에 태우지 않게 하는 안전장치)
- [ ] 실기기에서 요정 → 광고 → 보상 지급까지 확인
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
- [ ] 실기기 확인: 진동, 실제 노치/홈바 수치, 저사양 기기 프레임
      (안전영역·오디오 자동재생·백그라운드 복귀는 E2E 로 고정 — docs/ANDROID.md)

## 데이터 보안(Data safety) 신고 — 현재 코드 기준 답안

**보상형 광고(AdMob)가 포함된 상태**의 답이다. 결제 플러그인을 넣으면 다시 확인할 것.

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
| 기기 또는 기타 ID | 광고 ID (AdMob SDK) | 예 | 예 (Google) | 선택 (광고 시청 시) | 광고 |
| 금융 정보 | 구매 내역(구매 토큰·상품 ID) | 예 | 아니오 | 필수 (구매 시) | 앱 기능·부정 방지 |

광고 ID 는 **AdMob SDK 가 수집**한다 — 앱 코드가 직접 읽지는 않는다. 보상형 광고를
보지 않으면 광고 요청 자체가 일어나지 않는다. 정확한 수집 범위는 Google 의
AdMob 데이터 공개 안내를 따라 신고할 것.

수집하지 않음: 위치, 연락처, 사진/동영상, 파일, 메시지, 건강, 통화 기록, 캘린더,
기기 내 검색 기록, 사용 통계(분석 이벤트는 앱 내부 링버퍼에만 남고 전송 대상이
설정돼 있지 않다).

## 출시 후 갱신이 필요한 지점

- `GEM_PACKS` 를 바꾸면 `verify-purchase` 의 PRODUCTS 사본도 함께
- `relicsFor` 곡선을 바꾸면 `submit-score` 의 사본도 함께
- 광고/결제 SDK 추가 시 `docs/PRIVACY.md` + 데이터 보안 신고
