// wearable-ingest — the phone hand-off for watch numbers.
//
// Doctrine:
//   - a token identifies the person; there is no session here. Apple Shortcuts
//     and Health Auto Export cannot carry one.
//   - it stores readings. It never routes, approves, or executes anything.
//   - idempotent: the same reading posted twice is the same row.
//   - consent first, per group. A group switched off means those readings are
//     not stored, and the caller is told plainly which ones and why.
//   - the accepted list lives in one place (_shared/bodyKinds.ts), so a reading
//     the phone can send is a reading the desk can show.
import { corsHeaders } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { acceptReadings, refusalWords, type IncomingReading } from "../_shared/bodyKinds.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const url = new URL(req.url);
    const body = (await req.json().catch(() => null)) as
      | { token?: string; readings?: IncomingReading[] }
      | null;
    const token = String(body?.token ?? url.searchParams.get("token") ?? "").trim();
    if (token.length < 20) return json({ error: "A valid token is required." }, 401);

    const { data: secret } = await admin
      .from("integration_webhook_secrets")
      .select("owner_id")
      .eq("integration_key", "wearable")
      .eq("secret_value", token)
      .maybeSingle();
    if (!secret?.owner_id) return json({ error: "That token is not recognised." }, 401);
    const userId = secret.owner_id as string;

    const incoming = Array.isArray(body?.readings) ? body!.readings!.slice(0, 500) : [];
    if (!incoming.length) return json({ error: "No readings in the request." }, 400);

    /* Consent first, per group. Off means those readings are not stored. */
    const { data: profile } = await admin
      .from("profiles")
      .select("preferences")
      .eq("id", userId)
      .maybeSingle();
    const consent = ((profile?.preferences ?? {}) as any).sensor_consent ?? {};

    const { accepted, refused } = acceptReadings(incoming, consent);
    const rows = accepted.map((r) => ({
      user_id: userId,
      kind: r.kind,
      value: r.value,
      unit: r.unit,
      measured_at: r.measured_at,
      source: "ingest",
      raw: r as unknown as Record<string, unknown>,
    }));

    if (!rows.length) {
      const why = refusalWords(refused);
      const off = refused.some((r) => r.why === "switched_off");
      return json(
        { error: why ?? "None of those readings were usable.", refused },
        off ? 403 : 400,
      );
    }

    const { error } = await admin
      .from("wearable_readings")
      .upsert(rows, { onConflict: "user_id,kind,measured_at,source", ignoreDuplicates: true });
    if (error) return json({ error: error.message }, 500);

    await admin.from("audit_log").insert({
      user_id: userId,
      entity_type: "wearable",
      event: "wearable.ingest",
      payload: { stored: rows.length, kinds: [...new Set(rows.map((r) => r.kind))] },
    });

    return json({
      ok: true,
      stored: rows.length,
      kinds: [...new Set(rows.map((r) => r.kind))],
      ...(refused.length ? { refused, note: refusalWords(refused) } : {}),
    });
  } catch (e) {
    console.error("wearable-ingest", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
