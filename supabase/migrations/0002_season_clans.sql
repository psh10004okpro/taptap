-- 시즌 컬럼: submit-score 가 서버에서 계산해 기록. 랭킹 조회는 시즌별.
alter table public.leaderboard
  add column if not exists season text not null default '';

create index if not exists leaderboard_season_stage_idx
  on public.leaderboard (season, max_stage desc);

-- 클랜: 생성/가입은 Edge Function(clan-ops) 만 가능 (RLS 쓰기 정책 없음)
create table if not exists public.clans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 16),
  join_code   text not null unique check (char_length(join_code) = 6),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table if not exists public.clan_members (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  clan_id  uuid not null references public.clans (id) on delete cascade,
  joined_at timestamptz not null default now()
);

create index if not exists clan_members_clan_idx on public.clan_members (clan_id);

alter table public.clans enable row level security;
alter table public.clan_members enable row level security;

drop policy if exists "clans read" on public.clans;
create policy "clans read" on public.clans for select using (true);
drop policy if exists "clan members read" on public.clan_members;
create policy "clan members read" on public.clan_members for select using (true);

-- 클랜 랭킹: 멤버들의 리더보드 최고 스테이지 합산
create or replace view public.clan_rankings as
select c.id, c.name, count(m.user_id) as members,
       coalesce(sum(l.max_stage), 0) as total_stage
from public.clans c
left join public.clan_members m on m.clan_id = c.id
left join public.leaderboard l on l.user_id = m.user_id
group by c.id, c.name;
