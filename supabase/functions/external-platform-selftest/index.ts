// external-platform-selftest
// Owner-triggered end-to-end test: signs a sample event with the stored secret,
// posts to the platform's own inbound endpoint, then verifies the draft review row landed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { EXTERNAL_PLATFORMS, fingerprintSecret } from "../_shared/externalPlatform.ts";

const FUNCTION_FOR_SOURCE: Record<string, string> = {
  ground_truth_hub: "gth-inbound",
  campcore: "campcore-inbound",
  fenrir_lock: "fenrir-inbound",
  website_forms: "website-forms-inbound",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);
  const ownerId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", ownerId)
    .eq("role", "owner")
    .maybeSingle();
  if (!roleRow) return json({ ok: false, error: "owner role required" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const sourcePlatform = String(body?.source_platform ?? "ground_truth_hub");
  const config = EXTERNAL_PLATFORMS.find((p) => p.sourcePlatform === sourcePlatform);
  if (!config) return json({ ok: false, error: `unknown source_platform: ${sourcePlatform}` }, 400);
  const fnName = FUNCTION_FOR_SOURCE[sourcePlatform];
  if (!fnName) return json({ ok: false, error: "no inbound function registered for source" }, 400);

  // Load secret stored for this owner+platform
  const { data: secretRow } = await admin
    .from("integration_webhook_secrets")
    .select("secret_value")
    .eq("owner_id", ownerId)
    .eq("integration_key", sourcePlatform)
    .eq("secret_name", config.secretName)
    .maybeSingle();
  const secret = secretRow?.secret_value ?? Deno.env.get(config.secretName);
  if (!secret) return json({ ok: false, error: "webhook_secret_missing", detail: `no secret stored for ${config.secretName}` }, 400);

  const eventId = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const envelope = {
    source_platform: sourcePlatform,
    event_type: "integration.test",
    event_id: eventId,
    user_id: ownerId,
    identity_strategy: "vanta_owner",
    timestamp,
    payload: {
      test: true,
      sent_from: "vanta_selftest",
      note: "Self-test signal — should land as draft review.",
    },
  };
  const rawBody = JSON.stringify(envelope);
  const signature = await hmac(secret, `${timestamp}.${rawBody}`);

  const targetUrl = `${supabaseUrl}/functions/v1/${fnName}`;
  let inboundResp: Response;
  try {
    inboundResp = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vanta-Owner": ownerId,
        "X-Vanta-Timestamp": String(timestamp),
        "X-Vanta-Signature": `sha256=${signature}`,
      },
      body: rawBody,
    });
  } catch (e) {
    return json({ ok: false, stage: "post", error: `fetch failed: ${(e as Error).message}` }, 500);
  }

  const inboundBodyText = await inboundResp.text();
  let inboundBody: unknown = inboundBodyText;
  try { inboundBody = JSON.parse(inboundBodyText); } catch { /* leave as text */ }

  if (!inboundResp.ok) {
    return json({
      ok: false,
      stage: "inbound",
      status: inboundResp.status,
      response: inboundBody,
      sent: {
        url: targetUrl,
        secret_fingerprint: await fingerprintSecret(secret),
        owner_id: ownerId,
        event_id: eventId,
      },
    }, 200);
  }

  // Verify the draft review row landed.
  // Poll briefly because inserts are async-ish.
  let message: any = null;
  let route: any = null;
  for (let i = 0; i < 6; i++) {
    const { data: msgRows } = await admin
      .from("messages")
      .select("id, content, metadata, created_at")
      .eq("user_id", ownerId)
      .contains("metadata", { idempotency_key: eventId })
      .order("created_at", { ascending: false })
      .limit(1);
    message = msgRows?.[0] ?? null;
    const { data: routeRows } = await admin
      .from("capture_routes")
      .select("id, source, new_status, payload, created_at")
      .eq("user_id", ownerId)
      .contains("payload", { idempotency_key: eventId })
      .order("created_at", { ascending: false })
      .limit(1);
    route = routeRows?.[0] ?? null;
    if (message && route) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  const { data: diag } = await admin
    .from("external_platform_webhook_diagnostics")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("source_platform", sourcePlatform)
    .maybeSingle();

  return json({
    ok: !!(message && route),
    stage: message && route ? "verified" : "received_no_row",
    inbound_status: inboundResp.status,
    inbound_response: inboundBody,
    event_id: eventId,
    owner_id: ownerId,
    source_platform: sourcePlatform,
    secret_fingerprint: await fingerprintSecret(secret),
    message_row: message,
    capture_route_row: route,
    diagnostic: diag,
  });
});
