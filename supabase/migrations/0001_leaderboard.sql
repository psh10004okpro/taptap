-- TapTap Titans 리더보드 스키마
-- 원칙: 클라이언트는 leaderboard 를 직접 쓸 수 없다.
--       쓰기는 Edge Function(submit-score, service_role) 만 수행한다.

create table if not exists public.leaderboard (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 12),
  max_stage   integer not null check (max_stage between 1 and 5000),
  relics      integer not null default 0 check (relics >= 0),
  updated_at  timestamptz not null default now()
);

create index if not exists leaderboard_stage_idx
  on public.leaderboard (max_stage desc);

alter table public.leaderboard enable row level security;

-- 읽기: 누구나 (랭킹 조회)
drop policy if exists "leaderboard read" on public.leaderboard;
create policy "leaderboard read"
  on public.leaderboard for select
  using (true);

-- 쓰기 정책 없음 → anon/authenticated 의 insert/update/delete 전부 거부.
-- Edge Function 은 service_role 키로 RLS 를 우회해 검증된 값만 기록한다.
