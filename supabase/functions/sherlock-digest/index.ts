import { corsHeaders } from "../_shared/http.ts";
import { sendTelegram } from "../_shared/telegramApi.ts";
// sherlock-digest — the weekly read.
//
// Doctrine:
//   - a background job reports a diff, never a status: "nothing repeated this
//     week" is a valid digest, "synchronized" is not
//   - composed from records only. No model call, so it cannot invent a finding
//     and cannot spend credits
//   - one digest per user, per room, per week. A re-run never writes a second
//   - messaging is a notification surface: the line says what changed and where
//     to look, and carries no approve/execute control
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isInQuietHours } from "../_shared/drift.ts";


/** Bounds per run, so one invocation always ends. */
const MAX_USERS_PER_RUN = 200;
const MAX_ROWS = 400;
const LEASE_MINUTES = 10;

const KIND_LABEL: Record<string, string> = {
  stale_commitment: "promises past due",
  near_duplicate_note: "possible duplicates",
  recurring_entity: "subjects that keep coming up",
  obligation_untracked: "document promises nothing tracks",
  unapproved_high_risk: "open risks",
  meeting_without_context: "meetings with nothing behind them",
  promise_collides_with_meeting: "promises clashing with meetings",
  entity_gone_quiet: "things that went quiet",
  notes_disagree: "notes that disagree",
};

function scoped(q: any, orgId: string | null) {
  return orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null);
}

/** Monday 00:00 UTC of the week that is ending. */
function weekStart(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/* Quiet hours live in one place (_shared/drift.ts) so every sender agrees. */

/** Single-flight: one runner at a time, and the lease expires on its own. */
async function acquireLease(admin: any, jobName: string, runId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const expires = new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString();
  const { data: existing } = await admin
    .from("job_leases")
    .select("job_name, expires_at")
    .eq("job_name", jobName)
    .maybeSingle();
  if (!existing) {
    const { error } = await admin
      .from("job_leases")
      .insert({ job_name: jobName, locked_by: runId, locked_at: nowIso, expires_at: expires });
    return !error;
  }
  if (new Date(existing.expires_at) > new Date()) return false; // someone else holds it
  const { data: taken } = await admin
    .from("job_leases")
    .update({ locked_by: runId, locked_at: nowIso, expires_at: expires })
    .eq("job_name", jobName)
    .lt("expires_at", nowIso)
    .select("job_name");
  return Boolean(taken?.length);
}

async function releaseLease(admin: any, jobName: string, runId: string) {
  await admin.from("job_leases").update({ expires_at: new Date().toISOString() })
    .eq("job_name", jobName).eq("locked_by", runId);
}

type DigestBody = {
  week_start: string;
  headline: string;
  new_by_kind: Array<{ kind: string; label: string; count: number; example: string }>;
  settled: { accepted: number; dismissed: number; marked_wrong: number };
  look_again: Array<{ id: string; summary: string; confidence: string; kind: string }>;
  quiet: boolean;
};

async function composeForScope(
  admin: any,
  userId: string,
  orgId: string | null,
  now: Date,
): Promise<{ written: boolean; digest?: DigestBody; id?: string }> {
  const week = weekStart(now);
  const since = new Date(now.getTime() - 7 * 86400_000).toISOString();

  // Idempotency: a digest for this room and week already exists, so stop.
  const { data: already } = await scoped(
    admin.from("sherlock_digests").select("id").eq("user_id", userId).eq("week_start", week),
    orgId,
  ).limit(1);
  if (already?.length) return { written: false };

  const { data: fresh } = await scoped(
    admin
      .from("sherlock_findings")
      .select("id, finding_type, summary, confidence, status, created_at")
      .eq("user_id", userId)
      .gte("created_at", since),
    orgId,
  ).limit(MAX_ROWS);

  const { data: pending } = await scoped(
    admin
      .from("sherlock_findings")
      .select("id, finding_type, summary, confidence, updated_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .in("confidence", ["medium", "high"])
      .is("cooldown_until", null),
    orgId,
  ).order("updated_at", { ascending: false }).limit(MAX_ROWS);

  const { data: events } = await scoped(
    admin
      .from("audit_log")
      .select("event")
      .eq("user_id", userId)
      .gte("created_at", since)
      .in("event", ["sherlock_suggestion_accepted", "sherlock_suggestion_dismissed"]),
    orgId,
  ).limit(MAX_ROWS);

  const { data: wrong } = await scoped(
    admin
      .from("corrections")
      .select("id")
      .eq("user_id", userId)
      .eq("surface", "sherlock")
      .eq("feedback_type", "wrong")
      .gte("created_at", since),
    orgId,
  ).limit(MAX_ROWS);

  const byKind = new Map<string, { count: number; example: string }>();
  for (const f of (fresh ?? []) as any[]) {
    const prev = byKind.get(f.finding_type);
    if (prev) prev.count += 1;
    else byKind.set(f.finding_type, { count: 1, example: f.summary ?? "" });
  }
  const newByKind = [...byKind.entries()]
    .map(([kind, v]) => ({ kind, label: KIND_LABEL[kind] ?? "noticed", count: v.count, example: v.example }))
    .sort((a, b) => b.count - a.count);

  const accepted = ((events ?? []) as any[]).filter((e) => e.event === "sherlock_suggestion_accepted").length;
  const dismissed = ((events ?? []) as any[]).filter((e) => e.event === "sherlock_suggestion_dismissed").length;
  const markedWrong = (wrong ?? []).length;

  const CONF_RANK: Record<string, number> = { high: 2, medium: 1 };
  const lookAgain = ((pending ?? []) as any[])
    .sort((a, b) => (CONF_RANK[b.confidence] ?? 0) - (CONF_RANK[a.confidence] ?? 0))
    .slice(0, 3)
    .map((f) => ({ id: f.id, summary: f.summary ?? "", confidence: f.confidence, kind: f.finding_type }));

  const totalNew = (fresh ?? []).length;
  const quiet = totalNew === 0 && accepted === 0 && dismissed === 0 && lookAgain.length === 0;

  const headline = quiet
    ? "Nothing repeated this week. Sherlock looked and found no new pattern."
    : totalNew === 0
      ? `No new patterns this week. ${lookAgain.length} still waiting on your read.`
      : `${totalNew} new thing${totalNew === 1 ? "" : "s"} noticed this week. ${
          accepted + dismissed > 0
            ? `You settled ${accepted + dismissed}.`
            : "None settled yet."
        }`;

  const digest: DigestBody = {
    week_start: week,
    headline,
    new_by_kind: newByKind,
    settled: { accepted, dismissed, marked_wrong: markedWrong },
    look_again: lookAgain,
    quiet,
  };

  const { data: inserted, error } = await admin
    .from("sherlock_digests")
    .insert({
      user_id: userId,
      organization_id: orgId,
      week_start: week,
      digest,
      new_count: totalNew,
      look_again_count: lookAgain.length,
    })
    .select("id")
    .single();
  if (error) {
    // A unique-index collision means a parallel run already wrote it. Not an error.
    console.warn("[sherlock-digest] insert skipped", error.message);
    return { written: false };
  }

  await admin.from("audit_log").insert({
    user_id: userId,
    organization_id: orgId,
    entity_type: "sherlock_digest",
    entity_id: inserted.id,
    event: "sherlock_digest_composed",
    payload: { week_start: week, new_count: totalNew, look_again: lookAgain.length, quiet },
  });

  return { written: true, digest, id: inserted.id };
}

function digestLine(d: DigestBody): string {
  const lines = [`Sherlock, week of ${d.week_start}`, d.headline];
  for (const k of d.new_by_kind.slice(0, 3)) lines.push(`· ${k.count} ${k.label}`);
  if (d.look_again.length) lines.push(`Worth a look: ${d.look_again[0].summary}`);
  lines.push("Open Metro Echo to act on any of it. Nothing has been filed.");
  return lines.join("\n");
}

async function reachTelegram(admin: any, userId: string, text: string, orgId: string | null) {
  if (!Deno.env.get("TELEGRAM_API_KEY")) return;
  const { data: link } = await admin
    .from("telegram_chat_links")
    .select("chat_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const chatId = (link as { chat_id?: number } | null)?.chat_id;
  if (!chatId) return;

  const res = await sendTelegram({
    admin,
    userId,
    chatId,
    text,
    organizationId: orgId,
    kind: "digest",
    entityType: "sherlock_digest",
    auditEvent: "sherlock_digest_reached_messaging",
    auditFailedEvent: "sherlock_digest_reach_failed",
  });
  if (!res.ok) console.error("sherlock digest telegram reach failed", res.reason);
}

async function runForUser(admin: any, userId: string, settings: Record<string, unknown>, now: Date) {
  const { data: memberships } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active");
  const rooms: (string | null)[] = [null, ...((memberships ?? []) as any[]).map((m) => m.organization_id)];

  let written = 0;
  const delivered: string[] = [];
  for (const orgId of rooms) {
    const res = await composeForScope(admin, userId, orgId, now);
    if (!res.written || !res.digest) continue;
    written++;

    if (settings.weekly_digest_telegram === true) {
      const { data: profile } = await admin
        .from("profiles")
        .select("preferences, timezone")
        .eq("id", userId)
        .maybeSingle();
      const prefs = ((profile as any)?.preferences ?? {}) as Record<string, unknown>;
      const tz = ((profile as any)?.timezone as string) || "UTC";
      const quiet = isInQuietHours(
        tz,
        (prefs.quiet_hours_start as string) ?? "22:00",
        (prefs.quiet_hours_end as string) ?? "07:00",
        now,
      );
      if (!quiet) {
        await reachTelegram(admin, userId, digestLine(res.digest), orgId);
        delivered.push("telegram");
        await admin
          .from("sherlock_digests")
          .update({ delivered_channels: ["telegram"] })
          .eq("id", res.id);
      }
    }
  }
  return { written, delivered };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const now = new Date();

  try {
    const cronHeader = req.headers.get("x-cron-scan");

    if (cronHeader === "sherlock-digest") {
      const runId = crypto.randomUUID();
      const got = await acquireLease(admin, "sherlock-digest", runId);
      if (!got) return json({ ok: true, skipped: "another run holds the lease" });
      try {
        const { data: optedIn } = await admin
          .from("sherlock_settings")
          .select("user_id, weekly_digest_enabled, weekly_digest_telegram")
          .eq("weekly_digest_enabled", true)
          .limit(MAX_USERS_PER_RUN);
        let users = 0, written = 0;
        for (const row of (optedIn ?? []) as any[]) {
          const r = await runForUser(admin, row.user_id, row, now);
          users++;
          written += r.written;
        }
        return json({ ok: true, mode: "cron", users, written });
      } finally {
        await releaseLease(admin, "sherlock-digest", runId);
      }
    }

    // Manual: compose this week's digest for the caller only.
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json({ error: "no auth" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "unauthorized" }, 401);

    const { data: settings } = await admin
      .from("sherlock_settings")
      .select("weekly_digest_enabled, weekly_digest_telegram")
      .eq("user_id", u.user.id)
      .maybeSingle();
    const r = await runForUser(admin, u.user.id, (settings ?? {}) as Record<string, unknown>, now);
    return json({ ok: true, mode: "manual", ...r });
  } catch (e) {
    console.error("[sherlock-digest]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
