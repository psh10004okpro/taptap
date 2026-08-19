// clan-ops: 클랜 생성/가입/탈퇴 (Deno / Supabase Edge Function)
// 쓰기는 전부 이 함수(service_role) 경유 — 클라이언트 직접 쓰기는 RLS 로 차단.
// 규칙: 1인 1클랜, 이름 2~16자, 클랜당 최대 30명.
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_MEMBERS = 30;

function code6(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const fail = (status: number, msg: string) =>
    new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    });
  const ok = (data: unknown) =>
    new Response(JSON.stringify(data), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return fail(401, "unauthorized");

    const body = await req.json().catch(() => null) as
      | { action?: string; name?: string; code?: string } | null;
    if (!body?.action) return fail(400, "bad request");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await admin
      .from("clan_members").select("clan_id").eq("user_id", user.id).maybeSingle();

    if (body.action === "create") {
      if (existing) return fail(400, "already in clan");
      const name = String(body.name ?? "").trim();
      if (name.length < 2 || name.length > 16) return fail(400, "bad name");
      const { data: clan, error } = await admin.from("clans")
        .insert({ name, join_code: code6(), created_by: user.id })
        .select().single();
      if (error) return fail(400, "name taken");
      await admin.from("clan_members").insert({ user_id: user.id, clan_id: clan.id });
      return ok({ clan });
    }

    if (body.action === "join") {
      if (existing) return fail(400, "already in clan");
      const code = String(body.code ?? "").trim().toUpperCase();
      const { data: clan } = await admin.from("clans")
        .select("id, name").eq("join_code", code).maybeSingle();
      if (!clan) return fail(404, "clan not found");
      const { count } = await admin.from("clan_members")
        .select("user_id", { count: "exact", head: true }).eq("clan_id", clan.id);
      if ((count ?? 0) >= MAX_MEMBERS) return fail(400, "clan full");
      await admin.from("clan_members").insert({ user_id: user.id, clan_id: clan.id });
      return ok({ clan });
    }

    if (body.action === "leave") {
      if (!existing) return fail(400, "not in clan");
      await admin.from("clan_members").delete().eq("user_id", user.id);
      return ok({ left: true });
    }

    return fail(400, "unknown action");
  } catch {
    return fail(500, "internal");
  }
});
