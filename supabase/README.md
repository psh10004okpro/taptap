# Supabase 랭킹 설정

게임은 Supabase 없이도 동작한다(로컬 모드). 온라인 랭킹을 켜려면:

## 1. 프로젝트 준비
1. https://supabase.com 에서 프로젝트 생성
2. **Authentication → Providers → Anonymous Sign-ins 활성화** (익명 로그인 필수)

## 1-1. 올리기 전 검증 (자격증명 불필요)
```bash
bash tools/verify-migrations.sh     # Docker 필요
```
임시 Postgres(supabase/postgres 이미지)에 migrations 를 순서대로 적용하고,
RLS 불변식을 확인한다 — **anon/authenticated 에 INSERT 권한을 일부러 부여해도
정책이 거부하는지**, service_role 은 쓸 수 있는지, 구매 토큰 유니크가 걸렸는지.
운영 DB 를 건드리기 전에 여기서 먼저 깨지게 하는 것이 목적이다.

`supabase/config.toml` 은 `supabase init` 산출물이다. 로컬 스택을 띄울 때
다른 프로젝트와 충돌하지 않도록 포트를 55320~55329 로 옮겨 뒀고,
`enable_anonymous_sign_ins = true` 로 원격과 같은 조건을 맞춰 뒀다.

CLI 는 전역 설치 없이 `npx supabase` 로 쓴다 (검증본: 2.115.0).

## 2. 스키마 적용
```bash
export SUPABASE_ACCESS_TOKEN=<Account > Access Tokens 에서 발급>
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push          # migrations/000{1,2,3} 순서대로 적용
```

## 3. Edge Function 배포
```bash
npx supabase functions deploy submit-score clan-ops verify-purchase
```
(SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 기본 제공 시크릿)

## 3-1. 배포 검증 (필수)
```bash
npm run verify:supabase              # 익명로그인·공개조회·RLS·입력검증·정상제출
npm run verify:supabase -- --slow    # + 레이트리밋 30초·하향·진행속도 상한
```
`.env.local` 의 URL/anon key 를 읽는다. 하나라도 실패하면 배포가 덜 된 것이다 —
익명 로그인 비활성화, db push 누락, 함수 미배포가 흔한 원인.
검사용 익명 계정이 남으므로 Authentication > Users 에서 정리할 것.

## 4. 클라이언트 환경변수
`.env.local` (커밋 금지):
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

## 시즌 / 클랜 (0002 마이그레이션)
- `leaderboard.season`: submit-score 가 서버에서 계산(4주 키, `src/core/Season.ts` 와 동일 공식). 랭킹 조회는 시즌 필터.
- 클랜: `clans`/`clan_members` + `clan_rankings` 뷰(멤버 최고 스테이지 합산). 쓰기는 `clan-ops` 함수만.
- 배포: `supabase db push && supabase functions deploy submit-score clan-ops verify-purchase`
- IAP 검증(verify-purchase) 추가 시크릿:
  `supabase secrets set GOOGLE_SA_EMAIL=... GOOGLE_SA_PRIVATE_KEY=... ANDROID_PACKAGE=com.taptap.titans`
  (Play Console → API 액세스 → 서비스 계정, androidpublisher 권한)
- 미연동 확장(TODO): 토너먼트 온라인 순위, 클랜 공동 보스 HP 서버 관리, 시즌 보상 서버 정산.

## 보안 모델
- `leaderboard` 테이블은 **select 만 공개**. insert/update RLS 정책이 없어 클라이언트 직접 쓰기는 전부 거부된다.
- 쓰기는 `submit-score` Edge Function(service_role) 하나뿐이며 다음을 강제한다:
  - JWT 필수(익명 포함) → user_id 위조 불가
  - 스테이지 1..5000, 하향 불가, 제출 간격 30초 이상
  - 진행 속도 상한(초당 1스테이지) → 순간 점프 차단
  - **첫 제출도 계정 생성 시각 기준 같은 상한 적용** → 신규 익명 계정의 즉시 주입 차단
  - 유물 수치는 스테이지 곡선의 이론 상한 이내
- 한계:
  - 클라이언트 메모리 조작으로 "그럴듯한 속도"의 치팅까지는 막지 못한다.
    차단 대상은 대량/즉시 조작이다. 더 강한 검증은 전투 이벤트 로그 서버 재현이 필요.
  - 익명 계정을 만들어 오래 묵힌 뒤 제출하는 우회가 이론상 가능하다.
    필요 시 Edge Function 에 절대 상한(예: 주간 최고기록 캡)이나 캡차를 추가할 것.
