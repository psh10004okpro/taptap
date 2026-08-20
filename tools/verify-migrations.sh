#!/usr/bin/env bash
# migrations 를 실제 Postgres 에 적용해 보고 보안 불변식을 확인한다.
# `supabase db push` 로 운영 DB 를 건드리기 전에 여기서 먼저 깨져야 한다.
#
#   bash tools/verify-migrations.sh
#
# 필요: Docker. 임시 컨테이너(taptap-pgtest)를 띄웠다 지운다 — 기존에 돌고 있는
# Supabase 로컬 스택과는 별개이며 포트 55432 만 잠깐 쓴다.
set -euo pipefail

IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.113}"
NAME=taptap-pgtest
PORT=55432
HERE="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ 임시 Postgres 기동 ($IMAGE)"
cleanup
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 2; done

echo "▶ migrations 적용"
for f in "$HERE"/supabase/migrations/*.sql; do
  printf '  %s ... ' "$(basename "$f")"
  docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q < "$f" >/dev/null
  echo "ok"
done

echo "▶ 불변식 확인"
fail=0
check() { # 이름, 기대값, SQL
  local got
  got="$(docker exec -i "$NAME" psql -U postgres -X -tAc "$3" | tr -d '[:space:]')"
  if [ "$got" = "$2" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1 (기대 '$2', 실제 '$got')"
    fail=1
  fi
}

check "RLS 활성화 4개 테이블" "4" \
  "select count(*) from pg_class where relrowsecurity
     and relname in ('leaderboard','clans','clan_members','gem_ledger')"
check "leaderboard 정책은 select 하나뿐" "r" \
  "select string_agg(polcmd::text,',') from pg_policy
     where polrelid='public.leaderboard'::regclass"
check "구매 토큰 유니크(중복 지급 방지)" "1" \
  "select count(*) from pg_constraint
     where conrelid='public.gem_ledger'::regclass and contype='u'"
check "clan_rankings 뷰" "1" \
  "select count(*) from information_schema.views where table_name='clan_rankings'"
check "이름 길이 제약" "1" \
  "select count(*) from pg_constraint where conrelid='public.leaderboard'::regclass
     and contype='c' and pg_get_constraintdef(oid) like '%char_length(name)%'"

# 클라이언트 역할에 일부러 권한을 주고도 RLS 가 막는지 — 이 게임의 핵심 보안 주장
docker exec -i "$NAME" psql -U postgres -X -q >/dev/null <<'SQL'
grant insert, update, delete, select on public.leaderboard to anon, authenticated;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','t@e.st', now(), now())
on conflict do nothing;
SQL

for role in anon authenticated; do
  if docker exec -i "$NAME" psql -U postgres -X -q -c \
      "set role $role; insert into public.leaderboard (user_id,name,max_stage,relics)
       values ('11111111-1111-1111-1111-111111111111','hacker',4999,0);" >/dev/null 2>&1; then
    echo "  FAIL $role 직접 insert 가 통과했다 (RLS 구멍)"
    fail=1
  else
    echo "  ok   $role 직접 insert 거부"
  fi
done

if docker exec -i "$NAME" psql -U postgres -X -q -c \
    "set role service_role; insert into public.leaderboard (user_id,name,max_stage,relics,season)
     values ('11111111-1111-1111-1111-111111111111','검증',50,0,'S1');" >/dev/null 2>&1; then
  echo "  ok   service_role(Edge Function) 쓰기 허용"
else
  echo "  FAIL service_role 쓰기가 막혔다 — 함수가 기록할 수 없다"
  fail=1
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "전부 통과 — supabase db push 로 올려도 된다."
else
  echo "실패 항목이 있다 — 올리기 전에 고칠 것."
  exit 1
fi
