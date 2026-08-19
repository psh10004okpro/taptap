-- [초안 — 적용 금지] 레이드 + 카드 스키마. docs/RAIDS.md 구현 착수 시
-- migrations/ 로 승격하고 번호를 재부여할 것.

create table if not exists public.raids (
  id          bigint generated always as identity primary key,
  clan_id     uuid not null references public.clans (id) on delete cascade,
  week        date not null,                 -- 주 시작(월요일)
  tier        integer not null default 1 check (tier between 1 and 10),
  part_hp     integer[] not null,            -- 부위 3개 잔여 HP
  killed_at   timestamptz,
  unique (clan_id, week)
);

create table if not exists public.raid_attacks (
  id         bigint generated always as identity primary key,
  raid_id    bigint not null references public.raids (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  day        date not null,                  -- 공격권: 유저당 일 1회
  damage     bigint not null check (damage > 0),
  part       smallint not null check (part between 0 and 2),
  created_at timestamptz not null default now(),
  unique (raid_id, user_id, day)
);

create table if not exists public.card_ledger (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  card_id    smallint not null,
  qty        integer not null,               -- 음수 = 강화 소비
  source     text not null check (source in ('raid_reward', 'dust_shop', 'upgrade_consume')),
  created_at timestamptz not null default now()
);

create index if not exists raid_attacks_raid_idx on public.raid_attacks (raid_id);
create index if not exists card_ledger_user_idx on public.card_ledger (user_id);

alter table public.raids enable row level security;
alter table public.raid_attacks enable row level security;
alter table public.card_ledger enable row level security;

-- 읽기: 클랜원/본인. 쓰기: raid-ops Edge Function(service_role) 전용.
drop policy if exists "raids read" on public.raids;
create policy "raids read" on public.raids for select using (true);
drop policy if exists "raid attacks read" on public.raid_attacks;
create policy "raid attacks read" on public.raid_attacks for select using (true);
drop policy if exists "own cards read" on public.card_ledger;
create policy "own cards read" on public.card_ledger
  for select using (auth.uid() = user_id);
