// verify-purchase: IAP 영수증 서버 검증 + 보석 원장 기록 (Deno / Edge Function)
//
// 흐름: 클라이언트(Capacitor 결제 플러그인)가 구매 완료 → purchaseToken 을
// 이 함수로 전송 → Google Play Developer API 로 검증 → 원장에 기록(멱등) →
// 클라이언트는 ok 응답 후에만 grantGems 를 호출한다.
//
// 필요 시크릿:
//   GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY : Play Developer API 서비스 계정
//   ANDROID_PACKAGE : com.taptap.titans
// 서비스 계정 발급/권한은 supabase/README.md 참고. 미설정 시 501 을 반환해
// 클라이언트가 "상점 준비 중" 상태를 유지한다.
import { createClient } from "jsr:@supabase/supabase-js@2";

// src/config.ts GEM_PACKS 와 동기화 유지 (상품 id → 보석 수)
const PRODUCTS: Record<string, number> = {
  gems_s: 80, gems_m: 450, gems_l: 1200, starter: 120,
};

async function googleAccessToken(saEmail: string, saKey: string): Promise<string> {
  // 서비스 계정 JWT → OAuth 토큰 (androidpublisher 스코프)
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = btoa(JSON.stringify({
    iss: saEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const input = `${header}.${claims}`;
  const keyData = saKey.replace(/-----[A-Z ]+-----|\n/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8", Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  const jwt = `${input}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  return json.access_token as string;
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

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return fail(401, "unauthorized");

    const body = await req.json().catch(() => null) as
      | { productId?: string; purchaseToken?: string } | null;
    const productId = String(body?.productId ?? "");
    const token = String(body?.purchaseToken ?? "");
    const gems = PRODUCTS[productId];
    if (!gems || token.length < 10) return fail(400, "bad request");

    const saEmail = Deno.env.get("GOOGLE_SA_EMAIL");
    const saKey = Deno.env.get("GOOGLE_SA_PRIVATE_KEY");
    const pkg = Deno.env.get("ANDROID_PACKAGE");
    if (!saEmail || !saKey || !pkg) return fail(501, "store not configured");

    // Google Play 영수증 검증
    const access = await googleAccessToken(saEmail, saKey);
    const verifyRes = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`
      + `/purchases/products/${productId}/tokens/${encodeURIComponent(token)}`,
      { headers: { Authorization: `Bearer ${access}` } },
    );
    if (!verifyRes.ok) return fail(402, "verification failed");
    const purchase = await verifyRes.json();
    // purchaseState 0 = 구매 완료
    if (purchase.purchaseState !== 0) return fail(402, "purchase not completed");

    // 원장 기록 (unique 토큰 → 중복 지급 차단)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error: insErr } = await admin.from("gem_ledger").insert({
      user_id: user.id, product_id: productId, gems, platform: "google", purchase_token: token,
    });
    if (insErr) return fail(409, "already granted"); // unique 위반 = 재전송

    return new Response(JSON.stringify({ ok: true, gems }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch {
    return fail(500, "internal");
  }
});
