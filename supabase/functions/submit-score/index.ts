// submit-score: 서버 검증을 거친 점수 제출 (Deno / Supabase Edge Function)
//
// 검증 규칙 (탭 게임은 클라이언트 신뢰 불가):
//   1. 익명 로그인 포함, 유효한 JWT 필수 → user_id 는 토큰에서만 취득
//   2. 이름 2~12자
//   3. 스테이지: 1..5000 정수, 이전 기록보다 낮아질 수 없음
//   4. 제출 간격 최소 30초 (레이트 리밋)
//   5. 진행 속도 상한: 증가분 <= max(60, 경과초) — 초당 1스테이지면
//      정상 플레이로는 도달 불가한 수준의 널널한 상한이지만 1->5000 점프는 차단
//   6. 유물 수치는 스테이지 곡선(relicsFor)의 이론 상한을 넘을 수 없음
import { createClient } from "jsr:@supabase/supabase-js@2";

// src/config.ts 의 relicsFor 와 동일한 곡선 (양쪽 동기화 유지)
function relicsFor(maxStage: number): number {
  if (maxStage < 25) return 0;
  return Math.floor(Math.pow(maxStage / 8, 1.6));
}

const MIN_INTERVAL_MS = 30_000;

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const fail = (status: number, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    // 1. 호출자 신원: JWT 검증 (anon key 클라이언트 + 사용자 토큰)
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return fail(401, "unauthorized");

    // 2. 입력 검증
    const body = await req.json().catch(() => null) as
      | { name?: unknown; stage?: unknown; relics?: unknown }
      | null;
    if (!body) return fail(400, "bad json");
    const name = String(body.name ?? "").trim();
    const stage = Number(body.stage);
    const relics = Number(body.relics ?? 0);
    if (name.length < 2 || name.length > 12) return fail(400, "bad name");
    if (!Number.isInteger(stage) || stage < 1 || stage > 5000) return fail(400, "bad stage");
    if (!Number.isInteger(relics) || relics < 0) return fail(400, "bad relics");
    // 6. 유물은 스테이지 곡선상 이론 최대치를 넘을 수 없다
    if (relics > relicsFor(stage)) return fail(400, "implausible relics");

    // 3~5. 이전 기록 대비 검증 (service_role 로 조회/기록)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: prev } = await admin
      .from("leaderboard")
      .select("max_stage, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (prev) {
      const elapsedMs = Date.now() - new Date(prev.updated_at).getTime();
      if (elapsedMs < MIN_INTERVAL_MS) return fail(429, "too fast");
      if (stage < prev.max_stage) return fail(400, "stage regression");
      const gained = stage - prev.max_stage;
      const allowance = Math.max(60, Math.floor(elapsedMs / 1000)); // 초당 1스테이지
      if (gained > allowance) return fail(400, "implausible progress");
    }

    const { error: upsertErr } = await admin.from("leaderboard").upsert({
      user_id: user.id,
      name,
      max_stage: stage,
      relics,
      updated_at: new Date().toISOString(),
    });
    if (upsertErr) return fail(500, "db error");

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch {
    return fail(500, "internal");
  }
});
