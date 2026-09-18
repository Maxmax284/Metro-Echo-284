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
import { acceptReadings, flattenHealthPayload, refusalWords } from "../_shared/bodyKinds.ts";
import { bodyNews } from "../_shared/bodyNotice.ts";
import { reachOnce } from "../_shared/delivery/reach.ts";
import { isInQuietHours } from "../_shared/drift.ts";

/**
 * A reading landing is not news; a move against this person's own usual is.
 * Today gets the note, then one other surface carries it — phone when a device
 * is registered, the linked chat when it is not. Never both, never a verdict,
 * and nothing here executes anything.
 */
async function speakIfMoved(admin: any, userId: string, kinds: string[]) {
  const { data: profile } = await admin
    .from("profiles")
    .select("timezone, preferences")
    .eq("id", userId)
    .maybeSingle();
  const prefs = ((profile?.preferences ?? {}) as Record<string, unknown>);
  const tz = (profile?.timezone as string) || "UTC";
  /* Body observations are never urgent enough to break quiet hours. */
  if (isInQuietHours(tz)) return;

  const since = new Date(Date.now() - 18 * 86_400_000).toISOString();
  const { data: rows } = await admin
    .from("wearable_readings")
    .select("kind, value, measured_at")
    .eq("user_id", userId)
    .gte("measured_at", since)
    .order("measured_at", { ascending: false })
    .limit(2000);

  const news = bodyNews((rows ?? []) as never, kinds);
  if (!news) return;

  const { data: nudgeRow } = await admin.from("nudges").insert({
    user_id: userId,
    kind: "body_moved",
    title: news.title,
    body: news.body,
    priority: 40,
    status: "pending",
    related_entity_type: "wearable",
    related_entity_id: null,
    dedupe_key: news.dedupeKey,
  } as never).select("id").maybeSingle();
  const nudgeId = (nudgeRow as { id?: string } | null)?.id;
  /* A duplicate dedupe key means today's note already exists. Silence. */
  if (!nudgeId) return;

  await reachOnce(admin, {
    userId,
    organizationId: null,
    nudgeId,
    title: news.title,
    detail: news.body,
    url: "/?room=today",
    changeKey: news.dedupeKey,
    urgency: "useful",
    entityType: "wearable",
    entityId: null,
    source: "wearable_ingest",
    situationKind: "nudge.body_moved",
    dedupeKey: `nudge:${news.dedupeKey}`,
    because: "a reading moved against their own recorded usual",
    openKind: "today",
    messagingAllowed: prefs.telegram_awareness_enabled === true,
  });
}

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
      | (Record<string, unknown> & { token?: string })
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

    /* Echo's own list, or the shape Health Auto Export / a Health Connect
       exporter already posts. Nobody should have to hand-write JSON. */
    const incoming = flattenHealthPayload(body).slice(0, 500);
    if (!incoming.length) {
      return json(
        { error: "No readings Echo could find in that request. Send its own list, or point Health Auto Export / your Health Connect exporter straight at this link." },
        400,
      );
    }

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

    /* Storing is the job; speaking is only allowed when something moved. A
       failure here must never lose the readings that already landed. */
    await speakIfMoved(admin, userId, [...new Set(rows.map((r) => r.kind))])
      .catch((e) => console.error("wearable-ingest speak", e));

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
