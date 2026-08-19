#!/usr/bin/env node
// Supabase 배포 검증 — migrations + Edge Function 이 실제로 붙었는지 한 번에 확인한다.
//
//   node tools/verify-supabase.mjs            # .env.local 자동 로드
//   node tools/verify-supabase.mjs --slow     # 30초 대기가 필요한 검사까지 (레이트리밋/속도상한)
//
// 확인 항목
//   - 익명 로그인 (Authentication > Providers > Anonymous 활성화 필요)
//   - leaderboard 공개 조회
//   - 클라이언트 직접 쓰기 거부 (RLS: 쓰기 정책 없음)
//   - submit-score: 인증 없음 401 / 이름·유물·첫제출 속도 상한 400 / 정상 제출 ok
//   - (--slow) 30초 레이트리밋 429, 하향 제출 400, 진행 속도 상한 400
//
// 익명 계정이 검사마다 새로 생성된다 — 검증 후 Authentication > Users 에서 정리할 것.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const SLOW = process.argv.includes('--slow');

function env() {
  let url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  let key = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    try {
      for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        if (!url && /SUPABASE_URL$/.test(m[1])) url = m[2];
        if (!key && /SUPABASE_ANON_KEY$/.test(m[1])) key = m[2];
      }
    } catch { /* .env.local 없음 */ }
  }
  if (!url || !key) {
    console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 .env.local 또는 환경변수로 주세요.');
    process.exit(2);
  }
  return { url: url.replace(/\/+$/, ''), key };
}

const { url, key } = env();
const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** 새 익명 세션 (검사마다 독립된 계정) */
async function anonClient() {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw new Error(`익명 로그인 실패: ${error.message}`);
  return { c, token: data.session.access_token, userId: data.user.id };
}

/** submit-score 호출 → { status, body } */
async function submit(token, payload) {
  const r = await fetch(`${url}/functions/v1/submit-score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try { body = await r.json(); } catch { /* 비 JSON 응답 */ }
  return { status: r.status, body };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`대상: ${url}${SLOW ? ' (--slow)' : ''}\n`);

  // 1. 익명 로그인 + 공개 조회
  let session;
  try {
    session = await anonClient();
    record('익명 로그인', true, session.userId.slice(0, 8) + '…');
  } catch (e) {
    record('익명 로그인', false, String(e.message));
    console.error('\n익명 로그인이 꺼져 있으면 나머지 검사를 할 수 없습니다.');
    process.exit(1);
  }
  const { error: readErr } = await session.c
    .from('leaderboard').select('user_id, name, max_stage, season').limit(5);
  record('leaderboard 공개 조회', !readErr, readErr?.message ?? '');

  // 2. 클라이언트 직접 쓰기는 RLS 로 막혀야 한다 (이 게임의 핵심 보안 불변식)
  const { error: writeErr } = await session.c.from('leaderboard')
    .insert({ user_id: session.userId, name: 'hacker', max_stage: 4999, relics: 0 });
  record('클라이언트 직접 insert 거부', !!writeErr, writeErr ? writeErr.code ?? '' : '뚫림!');

  // 3. 인증 없는 호출 거부
  const noAuth = await submit(null, { name: '무명', stage: 10, relics: 0 });
  record('인증 없는 submit-score 401', noAuth.status === 401, `status ${noAuth.status}`);

  // 4. 입력 검증
  const badName = await submit(session.token, { name: 'x', stage: 10, relics: 0 });
  record('이름 1자 거부 400', badName.status === 400, badName.body?.error ?? '');

  const badRelics = await submit(session.token, { name: '검사', stage: 50, relics: 999_999 });
  record('과다 유물 거부 400', badRelics.status === 400,
    badRelics.body?.error ?? `status ${badRelics.status}`);

  // 5. 첫 제출 속도 상한 — 갓 만든 계정은 stage <= max(60, 계정나이초)
  const fresh = await anonClient();
  const jump = await submit(fresh.token, { name: '점프', stage: 4000, relics: 0 });
  record('신규 계정 스테이지 주입 거부 400', jump.status === 400,
    jump.body?.error ?? `status ${jump.status}`);

  // 6. 정상 제출 (상한 안쪽)
  const okRes = await submit(session.token, { name: '검사', stage: 50, relics: 0 });
  record('정상 제출 ok', okRes.status === 200 && okRes.body?.ok === true,
    okRes.body?.error ?? `status ${okRes.status}`);

  // 7. 기록이 실제로 조회되는지 (서버가 쓴 값 + 시즌 자동 계산)
  const { data: row } = await session.c.from('leaderboard')
    .select('name, max_stage, season').eq('user_id', session.userId).maybeSingle();
  record('제출 기록 조회', !!row && row.max_stage === 50,
    row ? `${row.name} / ${row.max_stage} / season=${row.season}` : '행 없음');

  if (SLOW) {
    // 8. 레이트리밋 (30초 미만 재제출)
    const fast = await submit(session.token, { name: '검사', stage: 51, relics: 0 });
    record('30초 내 재제출 429', fast.status === 429, fast.body?.error ?? `status ${fast.status}`);

    console.log('  ... 31초 대기 (레이트리밋 해제)');
    await sleep(31_000);

    // 9. 하향 제출 거부
    const down = await submit(session.token, { name: '검사', stage: 10, relics: 0 });
    record('하향 제출 거부 400', down.status === 400, down.body?.error ?? `status ${down.status}`);

    // 10. 진행 속도 상한 (경과 31초 → 허용 증가분 60)
    const tooFar = await submit(session.token, { name: '검사', stage: 50 + 500, relics: 0 });
    record('진행 속도 상한 400', tooFar.status === 400,
      tooFar.body?.error ?? `status ${tooFar.status}`);

    // 11. 상한 안쪽 증가는 통과
    const okStep = await submit(session.token, { name: '검사', stage: 90, relics: 0 });
    record('상한 안쪽 증가 ok', okStep.status === 200 && okStep.body?.ok === true,
      okStep.body?.error ?? `status ${okStep.status}`);
  } else {
    console.log('\n(--slow 를 붙이면 레이트리밋·하향·속도상한 검사까지 수행합니다)');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  if (failed.length) {
    console.log('실패: ' + failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
  console.log('익명 테스트 계정은 Authentication > Users 에서 정리하세요.');
}

main().catch((e) => { console.error(e); process.exit(1); });
