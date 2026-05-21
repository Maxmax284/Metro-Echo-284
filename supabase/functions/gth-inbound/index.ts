// gth-inbound — Ground Truth Hub webhook receiver.
// Doctrine: messaging feeds the system, it never executes.
// - HMAC-verified (header: x-gth-signature: sha256=<hex over raw body>)
// - Maps GTH events into the Vanta Capture Inbox via `messages` + `capture_routes` + `audit_log`
// - Owner-only / single-user. The body MUST include user_id (Vanta owner uuid).
// - Honors system_controls.gth_enabled kill switch.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ALLOWED_EVENTS = new Set([
  "booking",
  "guest_request",
  "room_note",
  "payment",
  "checkin",
  "checkout",
]);

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return hex(sig);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function summarize(event: string, payload: any): string {
  const p = payload ?? {};
  switch (event) {
    case "booking": return `GTH booking: ${p.guest_name ?? "guest"}${p.room ? ` · room ${p.room}` : ""}${p.dates ? ` · ${p.dates}` : ""}`;
    case "guest_request": return `GTH guest request${p.room ? ` (room ${p.room})` : ""}: ${p.message ?? p.summary ?? "(no detail)"}`;
    case "room_note": return `GTH room note${p.room ? ` (room ${p.room})` : ""}: ${p.note ?? p.summary ?? "(no detail)"}`;
    case "payment": return `GTH payment: ${p.amount ?? "?"} ${p.currency ?? ""}${p.guest_name ? ` · ${p.guest_name}` : ""}`;
    case "checkin": return `GTH check-in: ${p.guest_name ?? "guest"}${p.room ? ` · room ${p.room}` : ""}`;
    case "checkout": return `GTH check-out: ${p.guest_name ?? "guest"}${p.room ? ` · room ${p.room}` : ""}`;
    default: return `GTH event: ${event}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const secret = Deno.env.get("GTH_WEBHOOK_SECRET");
  if (!secret) {
    return new Response(JSON.stringify({ error: "webhook secret not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const raw = await req.text();
  const sigHeader = req.headers.get("x-gth-signature") ?? "";
  const provided = sigHeader.startsWith("sha256=") ? sigHeader.slice(7) : sigHeader;
  const expected = await hmacSha256Hex(secret, raw);
  if (!safeEqual(provided.toLowerCase(), expected.toLowerCase())) {
    return new Response(JSON.stringify({ error: "invalid signature" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = JSON.parse(raw); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId: string | undefined = body?.user_id;
  const event: string | undefined = body?.event;
  const payload = body?.payload ?? {};
  const externalId: string | undefined = body?.external_id;

  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return new Response(JSON.stringify({ error: "user_id required (uuid)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!event || !ALLOWED_EVENTS.has(event)) {
    return new Response(JSON.stringify({ error: `event must be one of ${[...ALLOWED_EVENTS].join(",")}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Owner check + kill-switch
  const { data: roleRow } = await admin
    .from("user_roles").select("user_id").eq("user_id", userId).eq("role", "owner").maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: "user not authorized as owner" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: controls } = await admin
    .from("system_controls").select("gth_enabled").eq("owner_id", userId).maybeSingle();
  if (!controls?.gth_enabled) {
    return new Response(JSON.stringify({ error: "gth source disabled in Control Room", skipped: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Land into the user's most recent conversation (capture inbox reads from messages).
  let convId: string | null = null;
  const { data: conv } = await admin
    .from("conversations").select("id").eq("user_id", userId)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  convId = conv?.id ?? null;
  if (!convId) {
    const { data: newConv } = await admin
      .from("conversations").insert({ user_id: userId, title: "Captures" }).select("id").maybeSingle();
    convId = newConv?.id ?? null;
  }
  if (!convId) {
    return new Response(JSON.stringify({ error: "could not establish conversation" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const content = summarize(event, payload);
  const meta = {
    source: "gth",
    gth_event: event,
    gth_payload: payload,
    gth_external_id: externalId ?? null,
    needs_review: true,
    confidence: "low",
  };

  const { data: ins, error: insErr } = await admin
    .from("messages")
    .insert({ user_id: userId, conversation_id: convId, role: "user", content, metadata: meta })
    .select("id").maybeSingle();
  if (insErr || !ins?.id) {
    return new Response(JSON.stringify({ error: "capture write failed", detail: insErr?.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Triage receipt
  await admin.from("capture_routes").insert({
    user_id: userId,
    capture_kind: "message",
    capture_id: ins.id,
    source: "gth",
    user_action: "routed",
    new_status: "inbox",
    payload: { event, external_id: externalId ?? null },
  });

  // Audit
  await admin.from("audit_log").insert({
    user_id: userId,
    entity_type: "capture",
    entity_id: ins.id,
    event: "ecosystem.gth.captured",
    payload: { event, external_id: externalId ?? null, summary: content.slice(0, 200) },
  });

  return new Response(JSON.stringify({ ok: true, capture_id: ins.id }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
