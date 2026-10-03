// Stage 8 — Confidence decay cron.
// Marks field_notes and corrections as 'expired' when their expires_at has passed.
// Safe to invoke on a schedule (e.g. hourly). Idempotent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { writeAuditEvent } from "../_shared/auditEvent.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const nowIso = new Date().toISOString();
  const result: Record<string, unknown> = { ran_at: nowIso };

  try {
    const { data: fnRows, error: fnErr } = await sb
      .from("field_notes")
      .update({ status: "expired" })
      .lt("expires_at", nowIso)
      .eq("status", "active")
      .select("id, user_id, organization_id");
    if (fnErr) throw fnErr;
    result.field_notes_expired = fnRows?.length ?? 0;

    /* Expiry is a state change — each one leaves a receipt, never silent. */
    for (const row of fnRows ?? []) {
      await writeAuditEvent(sb as never, {
        actor: row.user_id,
        organizationId: row.organization_id ?? null,
        entityType: "field_note",
        entityId: row.id,
        event: "field_note.expired",
        source: "awareness-decay",
        previousState: "active",
        nextState: "expired",
        success: true,
      });
    }

    const { data: cRows, error: cErr } = await sb
      .from("corrections")
      .update({ status: "expired" })
      .lt("expires_at", nowIso)
      .eq("status", "active")
      .select("id, user_id, organization_id");
    if (cErr) throw cErr;
    result.corrections_expired = cRows?.length ?? 0;

    for (const row of cRows ?? []) {
      await writeAuditEvent(sb as never, {
        actor: row.user_id,
        organizationId: row.organization_id ?? null,
        entityType: "correction",
        entityId: row.id,
        event: "correction.expired",
        source: "awareness-decay",
        previousState: "active",
        nextState: "expired",
        success: true,
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
