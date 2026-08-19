-- 보석 지급 원장 — 결제의 진실은 서버에 있다.
-- purchase_token unique 로 중복 지급(재전송/리플레이)을 원천 차단한다.
create table if not exists public.gem_ledger (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  product_id     text not null,
  gems           integer not null check (gems > 0),
  platform       text not null check (platform in ('google', 'apple', 'dev')),
  purchase_token text not null unique,
  created_at     timestamptz not null default now()
);

create index if not exists gem_ledger_user_idx on public.gem_ledger (user_id);

alter table public.gem_ledger enable row level security;

-- 본인 조회만 허용 (지급 내역 확인용). 쓰기는 verify-purchase 함수만.
drop policy if exists "own ledger read" on public.gem_ledger;
create policy "own ledger read" on public.gem_ledger
  for select using (auth.uid() = user_id);
