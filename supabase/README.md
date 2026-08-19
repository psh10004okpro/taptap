# Supabase 랭킹 설정

게임은 Supabase 없이도 동작한다(로컬 모드). 온라인 랭킹을 켜려면:

## 1. 프로젝트 준비
1. https://supabase.com 에서 프로젝트 생성
2. **Authentication → Providers → Anonymous Sign-ins 활성화** (익명 로그인 필수)

## 2. 스키마 적용
```bash
supabase link --project-ref <PROJECT_REF>
supabase db push          # migrations/0001_leaderboard.sql 적용
```

## 3. Edge Function 배포
```bash
supabase functions deploy submit-score
```
(SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 는 기본 제공 시크릿)

## 4. 클라이언트 환경변수
`.env.local` (커밋 금지):
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

## 보안 모델
- `leaderboard` 테이블은 **select 만 공개**. insert/update RLS 정책이 없어 클라이언트 직접 쓰기는 전부 거부된다.
- 쓰기는 `submit-score` Edge Function(service_role) 하나뿐이며 다음을 강제한다:
  - JWT 필수(익명 포함) → user_id 위조 불가
  - 스테이지 1..5000, 하향 불가, 제출 간격 30초 이상
  - 진행 속도 상한(초당 1스테이지) → 순간 점프 차단
  - 유물 수치는 스테이지 곡선의 이론 상한 이내
- 한계: 클라이언트 메모리 조작으로 "그럴듯한 속도"의 치팅까지는 막지 못한다.
  차단 대상은 대량/즉시 조작이다. 더 강한 검증은 전투 이벤트 로그 서버 재현이 필요.
