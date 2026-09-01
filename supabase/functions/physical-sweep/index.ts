// physical-sweep — the daily read of captured pages.
//
// Doctrine:
//   - a background job reports a diff, never a status. "Nothing new to read"
//     is a valid result; "synchronized" is not.
//   - bounded per run, single-flight, idempotent. A page already read is never
//     read twice, and a re-run picks up only what is still pending.
//   - it reads. It does not route, approve, or execute anything. Every page it
//     reads lands in the Inbox needing a human.
//   - a credit or policy block (402 / 403) pauses the whole job and says so.
//     Every entry point checks the pause first and only lets one probe page
//     through per run until the block clears.
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { GatewayError, isPageFile, readPageFile } from "../_shared/pageRead.ts";

const JOB = "physical-sweep";
const PAUSE_JOB = "physical-sweep:paused";
const LEASE_MINUTES = 10;
const MAX_PAGES_PER_RUN = 25;
const PAUSE_DAYS = 30;

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

async function readPause(admin: any): Promise<{ reason: string } | null> {
  const { data } = await admin.from("job_leases")
    .select("locked_by, expires_at").eq("job_name", PAUSE_JOB).maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return { reason: String(data.locked_by ?? "blocked") };
}

async function setPause(admin: any, reason: string) {
  await admin.from("job_leases").upsert({
    job_name: PAUSE_JOB,
    locked_by: reason.slice(0, 200),
    locked_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + PAUSE_DAYS * 86_400_000).toISOString(),
  }, { onConflict: "job_name" });
}

async function clearPause(admin: any) {
  await admin.from("job_leases").delete().eq("job_name", PAUSE_JOB);
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
    /* A signed-in caller ("Read now") only ever sweeps their own pages. The
       cron caller has no session and sweeps everybody's pending pages. */
    let onlyUserId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader && !authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "\u0000")) {
      const asUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const user = await resolveUser(req, asUser as any);
      if (user) onlyUserId = user.id;
    }

    const paused = await readPause(admin);
    const runId = crypto.randomUUID();
    if (!(await acquireLease(admin, runId))) {
      return json({ ok: true, skipped: "another sweep is running" });
    }

    /* While paused, exactly one page is allowed through as a probe. */
    const budget = paused ? 1 : MAX_PAGES_PER_RUN;

    let q = admin.from("ingested_files")
      .select("id, user_id, organization_id, filename, mime_type, storage_path, source, metadata")
      .in("status", ["pending", "error"])
      .is("note_id", null)
      .order("created_at", { ascending: true })
      .limit(budget * 2);
    if (onlyUserId) q = q.eq("user_id", onlyUserId);
    const { data: rows, error } = await q;
    if (error) {
      await releaseLease(admin, runId);
      return json({ error: error.message }, 500);
    }

    const pages = (rows ?? []).filter((r: any) => isPageFile(r)).slice(0, budget);

    let read = 0;
    let unreadable = 0;
    let blocked: string | null = null;
    const perUser = new Map<string, { read: number; unreadable: number; org: string | null }>();

    for (const rec of pages) {
      try {
        const result = await readPageFile(admin, rec as any);
        const tally = perUser.get(rec.user_id) ?? { read: 0, unreadable: 0, org: rec.organization_id ?? null };
        if (result.ok) {
          read++;
          tally.read++;
          if (paused) await clearPause(admin); // the block cleared on its own
        } else {
          unreadable++;
          tally.unreadable++;
        }
        perUser.set(rec.user_id, tally);
      } catch (e) {
        /* 402 / 403 — credits or policy. Stop the whole sweep, park it, say so. */
        const status = e instanceof GatewayError ? e.status : 0;
        blocked = status === 402
          ? "Reading is paused — the workspace is out of AI credits."
          : "Reading is paused — AI is switched off for this workspace.";
        await setPause(admin, blocked);
        break;
      }
    }

    /* One receipt per person, and it always names the diff. */
    for (const [userId, t] of perUser) {
      await admin.from("audit_log").insert({
        user_id: userId,
        organization_id: t.org,
        entity_type: "capture",
        event: "physical.sweep",
        payload: {
          read: t.read,
          unreadable: t.unreadable,
          scanned: pages.filter((p: any) => p.user_id === userId).length,
          probe: !!paused,
          run_id: runId,
        },
      });
    }
    /* A hand-run that found nothing still deserves a stamp, so the panel can
       honestly say when Vanta last looked. */
    if (onlyUserId && !perUser.has(onlyUserId)) {
      await admin.from("audit_log").insert({
        user_id: onlyUserId,
        entity_type: "capture",
        event: "physical.sweep",
        payload: { read: 0, unreadable: 0, scanned: 0, probe: !!paused, run_id: runId },
      });
    }

    await releaseLease(admin, runId);
    return json({ ok: true, read, unreadable, scanned: pages.length, paused: blocked ?? paused?.reason ?? null });
  } catch (e) {
    console.error("physical-sweep", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
