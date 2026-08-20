# 개인정보처리방침 (초안)

> **검토 필요** — 이 문서는 코드가 실제로 처리하는 데이터만 근거로 작성한 초안이다.
> 게시 전에 아래 자리표시자를 채우고 법률 검토를 받을 것.
>
> | 자리표시자 | 채울 값 |
> |---|---|
> | `{{연락처}}` | 문의 이메일 (Play Console 개발자 이메일과 동일하게) |
> | `{{시행일}}` | 최초 게시일 |
> | `{{공개URL}}` | 이 문서를 게시할 공개 URL (Play Console 에 등록) |
>
> Google Play 는 **모든 앱**에 공개 URL 형태의 개인정보처리방침을 요구한다.
> 마크다운 그대로가 아니라 HTML 페이지(GitHub Pages 등)로 게시해야 한다.

**앱**: TapTap Titans (`com.taptap.titans`) · **시행일**: {{시행일}}

## 1. 요약

이 게임은 **계정 가입이 없다.** 이름·이메일·전화번호·주소·연락처·사진·위치를 수집하지 않는다.
게임 진행 데이터는 **기기 안(localStorage)에 저장**되며, 그 자체로는 어디에도 전송되지 않는다.

서버로 나가는 것은 **온라인 랭킹에 참여할 때의 랭킹 항목**과 **결제 시 영수증 검증**뿐이다.

## 2. 처리하는 정보

### 2-1. 기기에만 저장 (전송 없음)
게임 세이브 — 보유 골드·스테이지·영웅/유물/펫 레벨·장비·퀘스트 진행·업적·보석 잔액,
사운드/진동/UI 접힘 설정. 브라우저·앱의 저장소를 지우면 함께 사라진다.

### 2-2. 온라인 랭킹 이용 시 서버로 전송
| 항목 | 내용 | 목적 | 보관 |
|---|---|---|---|
| 익명 계정 식별자 | 이메일·비밀번호 없이 발급되는 임의의 ID | 같은 사람의 기록을 갱신하기 위해 | 삭제 요청 시까지 |
| 표시 이름 | 이용자가 랭킹용으로 직접 입력한 2~12자 문구 | 순위표 표시 | 삭제 요청 시까지 |
| 최고 스테이지, 유물 수 | 게임 진행 수치 | 순위 산정 | 삭제 요청 시까지 |
| 클랜명·가입 코드 | 이용자가 클랜을 만들거나 가입할 때 | 클랜 순위 | 삭제 요청 시까지 |

랭킹을 쓰지 않으면 이 전송은 일어나지 않으며, 게임은 기기 안의 로컬 순위표로 동작한다.

### 2-3. 결제 시
스토어가 발급한 **구매 토큰과 상품 ID**를 검증 서버로 보내 실제 결제인지 확인한 뒤
보석을 지급한다. **카드번호 등 결제수단 정보는 스토어가 처리하며 이 앱은 취급하지 않는다.**
중복 지급을 막기 위해 구매 토큰을 지급 원장에 보관한다.

### 2-4. 보상형 광고
게임 안에서 요정을 탭해 **광고 시청을 선택했을 때만** 광고가 요청된다.
광고는 Google AdMob 이 제공하며, AdMob SDK 는 광고 게재와 측정을 위해
**광고 ID 등 기기 식별자**를 수집·이용할 수 있다. 이 앱은 그 값을 직접 읽거나
보관하지 않는다. 광고를 보지 않으면 광고 요청 자체가 일어나지 않으며,
게임 진행에 필수인 광고는 없다.
자세한 내용은 Google 의 광고 관련 개인정보 처리 방침을 따른다.

### 2-5. 수집하지 않는 것
- 이름·이메일·전화번호·주소·생년월일·성별
- 정확/대략 위치, 연락처, 사진, 파일, 마이크, 카메라
- 앱 사용 통계의 외부 전송 — 분석 이벤트는 앱 안에서만 순환하며(최근 300건 링버퍼)
  전송 대상이 설정돼 있지 않다.

## 3. 제3자

| 제공자 | 역할 | 받는 정보 |
|---|---|---|
| Supabase | 랭킹·클랜·결제 검증 서버 호스팅 | 2-2, 2-3 항목 |
| Google Play | 앱 배포 및 인앱 결제 | 결제 처리는 Google 정책에 따름 |
| Google AdMob | 보상형 광고 게재 | 2-4 항목 (광고 시청 시) |

## 4. 아동

이 게임은 아동을 주 대상으로 하지 않는다. 아동에게서 의도적으로 개인정보를 수집하지 않는다.

## 5. 이용자의 권리

- **기기 데이터 삭제**: 앱 삭제 또는 기기 설정 > 앱 > 저장공간 > 데이터 삭제
  (앱 안에는 전체 삭제 버튼이 없다 — 넣는다면 이 문구도 함께 고칠 것)
- **랭킹 기록 삭제**: {{연락처}} 로 앱 내 표시 이름을 알려주면 해당 기록과 익명 계정을 지운다
- **문의**: {{연락처}}

## 6. 보안

- 랭킹 테이블은 **읽기만 공개**되고 클라이언트의 직접 쓰기는 데이터베이스 정책으로 차단된다.
  기록은 서버 함수만 남길 수 있고, 함수가 진행 속도·수치 상한을 검증한다.
- 결제 지급은 서버 검증을 통과한 뒤에만 이뤄지며, 구매 토큰은 고유 제약으로 재사용이 막힌다.

## 7. 변경

이 방침이 바뀌면 {{공개URL}} 에 개정본과 시행일을 게시한다.

---

# Privacy Policy (draft, English)

**App**: TapTap Titans (`com.taptap.titans`) · **Effective**: {{시행일}}

**No account is required.** We do not collect your name, email, phone number, address,
contacts, photos, or location. Game progress is stored **on your device** and is not
transmitted by itself.

Data leaves your device only in two cases:

1. **Online ranking (optional).** An anonymous identifier (issued without any email or
   password), the display name you type for the leaderboard (2–12 characters), your highest
   stage and relic count, and — if you create or join one — a clan name and join code.
   If you do not use online ranking, the game keeps a local leaderboard and sends nothing.
2. **Purchases.** The store-issued purchase token and product ID are sent to our verification
   server to confirm the purchase before gems are granted. **Payment instrument details are
   handled by the store and never by this app.**

**Rewarded ads.** Ads are requested only when you choose to watch one (by tapping the fairy).
Ads are served by Google AdMob, whose SDK may collect and use device identifiers such as the
advertising ID for ad delivery and measurement; this app does not read or store that value.
No ad is required to progress in the game.

We do not transmit usage analytics: analytics events stay in an in-app ring buffer (last 300)
with no delivery target configured.

**Processors**: Supabase (ranking, clan, purchase verification hosting), Google Play
(distribution and in-app billing), Google AdMob (rewarded ads).

**Your choices**: delete device data by uninstalling the app or clearing its storage in
system settings; to erase a leaderboard record and its anonymous account, contact {{연락처}}
with your display name.

**Security**: the leaderboard is publicly readable but not client-writable — a server function
is the only writer and it validates progression rate and value ceilings. Gems are granted only
after server-side verification, and purchase tokens are unique-constrained against replay.

**Contact**: {{연락처}}
