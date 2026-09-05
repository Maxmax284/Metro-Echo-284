// wearable-sweep — the daily read of what a watch sent over.
//
// Doctrine:
//   - it reports a diff, never a status. "nothing new from your watch" is a
//     real result; "synchronized" is not.
//   - it summarises records that already exist. It fetches nothing from any
//     vendor and it never routes, approves, or executes anything.
//   - single-flight and idempotent: one receipt per person per day.
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const JOB = "wearable-sweep";
const LEASE_MINUTES = 5;

async function acquireLease(admin: any, runId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const expires = new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString();
  const { data: existing } = await admin.from("job_leases")
    .select("job_name, expires_at").eq("job_name", JOB).maybeSingle();
  if (!existing) {
    const { error } = await admin.from("job_leases")
      .insert({ job_name: JOB, locked_by: runId, locked_at: nowIso, expires_at: expires });
    return !error;
  }
  if (new Date(existing.expires_at) > new Date()) return false;
  const { data: taken } = await admin.from("job_leases")
    .update({ locked_by: runId, locked_at: nowIso, expires_at: expires })
    .eq("job_name", JOB).eq("expires_at", existing.expires_at).select("job_name").maybeSingle();
  return !!taken;
}

async function releaseLease(admin: any, runId: string) {
  await admin.from("job_leases")
    .update({ expires_at: new Date().toISOString() })
    .eq("job_name", JOB).eq("locked_by", runId);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    /* A signed-in caller ("Read now") only ever sweeps their own readings. */
    let onlyUserId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader) {
      const asUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const user = await resolveUser(req, asUser as any).catch(() => null);
      if (user) onlyUserId = user.id;
    }

    const runId = crypto.randomUUID();
    if (!(await acquireLease(admin, runId))) {
      return json({ ok: true, skipped: "another sweep is running" });
    }

    const since = new Date(Date.now() - 86_400_000).toISOString();
    let q = admin.from("wearable_readings")
      .select("user_id, organization_id, kind")
      .gte("measured_at", since)
      .limit(5000);
    if (onlyUserId) q = q.eq("user_id", onlyUserId);
    const { data: rows, error } = await q;
    if (error) {
      await releaseLease(admin, runId);
      return json({ error: error.message }, 500);
    }

    const perUser = new Map<
      string,
      { org: string | null; heart_rate: number; steps: number; sleep: number; workout: number; stand: number }
    >();
    for (const r of rows ?? []) {
      const t = perUser.get(r.user_id) ??
        { org: r.organization_id ?? null, heart_rate: 0, steps: 0, sleep: 0, workout: 0, stand: 0 };
      (t as any)[r.kind] = ((t as any)[r.kind] ?? 0) + 1;
      perUser.set(r.user_id, t);
    }

    /* A hand-run that found nothing still gets a stamp, so the panel can say
       honestly when Echo last looked. */
    if (onlyUserId && !perUser.has(onlyUserId)) {
      perUser.set(onlyUserId, { org: null, heart_rate: 0, steps: 0, sleep: 0, workout: 0, stand: 0 });
    }

    for (const [userId, t] of perUser) {
      await admin.from("audit_log").insert({
        user_id: userId,
        organization_id: t.org,
        entity_type: "wearable",
        event: "wearable.sweep",
        payload: {
          heart_rate: t.heart_rate,
          steps: t.steps,
          sleep: t.sleep,
          workout: t.workout,
          stand: t.stand,
          run_id: runId,
        },
      });
    }

    await releaseLease(admin, runId);
    return json({ ok: true, people: perUser.size });
  } catch (e) {
    console.error("wearable-sweep", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
