import { corsHeaders } from "../_shared/http.ts";
// sherlock-patterns — observe-mode scanner. Looks across the user's substrate
// for soft signals (stale commitments, snoozed reminders, near-duplicate notes,
// recurring entity activity) and writes them as `observe` findings into
// `sherlock_findings`. Never executes anything; the user reviews from the Hub.
//
// Doctrine: Recognition ≠ Execution. Patterns are surfaced as drafts only.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";


type FindingDraft = {
  source_object_type: string;
  source_object_id?: string | null;
  finding_type: string;
  summary: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  suggested_action?: string | null;
  target_object_type?: string | null;
  target_object_id?: string | null;
  extracted_data?: Record<string, unknown>;
};

/** Restrict a query to one room: personal (organization_id IS NULL) or one workspace. */
function scoped(q: any, orgId: string | null) {
  return orgId ? q.eq("organization_id", orgId) : q.is("organization_id", null);
}

/** Every room a user owns or belongs to: personal first, then each workspace. */
async function scopeTargets(admin: any, userId: string): Promise<(string | null)[]> {
  const { data } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active");
  return [null, ...((data ?? []) as any[]).map((m) => m.organization_id as string)];
}

/** Scan every room the user can see, one at a time. Findings never cross rooms. */
async function runForAllScopes(admin: any, userId: string) {
  const targets = await scopeTargets(admin, userId);
  let drafts = 0, written = 0, suppressed = 0;
  for (const orgId of targets) {
    const r = await runForUser(admin, userId, orgId);
    drafts += r.drafts; written += r.written; suppressed += r.suppressed;
  }
  return { drafts, written, suppressed, scopes: targets.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const cronHeader = req.headers.get("x-cron-scan");
    if (!auth) return json({ error: "no auth" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Cron path: pg_cron sends `x-cron-scan: sherlock-patterns`. We iterate
    // every user that has ambient recognition enabled.
    if (cronHeader === "sherlock-patterns") {
      const { data: optedIn } = await admin
        .from("sherlock_settings")
        .select("user_id")
        .eq("ambient_enabled", true);
      const ids = (optedIn ?? []).map((r: any) => r.user_id as string);
      let totalDrafts = 0, totalWritten = 0, totalSuppressed = 0;
      for (const uid of ids) {
        const r = await runForAllScopes(admin, uid);
        totalDrafts += r.drafts; totalWritten += r.written; totalSuppressed += r.suppressed;
      }
      return json({
        ok: true, mode: "cron",
        users: ids.length, drafts: totalDrafts,
        written: totalWritten, suppressed: totalSuppressed,
      });
    }

    // User-triggered: scope to the caller.
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "unauthorized" }, 401);
    const r = await runForAllScopes(admin, u.user.id);
    return json({ ok: true, mode: "manual", ...r });
  } catch (e) {
    console.error("[sherlock-patterns]", e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});

async function runForUser(admin: any, userId: string, orgId: string | null) {
  const drafts: FindingDraft[] = [];

  // ---- 1) Stale commitments: open, due in the past by >2d, no recent reminder
  const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: stale } = await scoped(admin
    .from("commitments")
    .select("id, summary, due_at, last_reminded_at, updated_at")
    .eq("user_id", userId), orgId)
    .eq("status", "open")
    .lt("due_at", twoDaysAgo)
    .limit(50);
  for (const c of stale ?? []) {
    const lastTouch = c.last_reminded_at ?? c.updated_at;
    if (lastTouch && new Date(lastTouch) > new Date(sevenDaysAgo)) continue;
    drafts.push({
      source_object_type: "commitment",
      source_object_id: c.id,
      finding_type: "stale_commitment",
      summary: `Still open past due: "${truncate(c.summary, 60)}"`,
      rationale: `Due ${human(c.due_at)} · no nudge since ${human(lastTouch)}.`,
      confidence: "medium",
      suggested_action: "renegotiate_or_close",
      extracted_data: { due_at: c.due_at, last_touch: lastTouch },
    });
  }

  // ---- 2) Near-duplicate notes: same lowercased title in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: notes } = await scoped(admin
    .from("notes")
    .select("id, title, body, created_at")
    .eq("user_id", userId), orgId)
    .gte("created_at", thirtyDaysAgo)
    .limit(300);
  const seen = new Map<string, { id: string; title: string }>();
  for (const n of notes ?? []) {
    const key = (n.title?.toLowerCase().trim() || n.body?.slice(0, 60).toLowerCase().trim() || "").trim();
    if (!key || key.length < 8) continue;
    const prev = seen.get(key);
    if (prev) {
      drafts.push({
        source_object_type: "note",
        source_object_id: n.id,
        finding_type: "near_duplicate_note",
        summary: `Looks like a duplicate of "${truncate(prev.title || key, 50)}"`,
        rationale: `Two recent notes share the same opening. Worth merging or linking.`,
        confidence: "low",
        suggested_action: "merge_or_link",
        target_object_type: "note",
        target_object_id: prev.id,
      });
    } else {
      seen.set(key, { id: n.id, title: n.title ?? "" });
    }
  }

  // ---- 3) Recurring entity activity: entity with ≥4 links in last 14d
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data: links } = await scoped(admin
    .from("entity_links")
    .select("entity_id, created_at")
    .eq("user_id", userId), orgId)
    .gte("created_at", fourteenDaysAgo)
    .limit(500);
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.entity_id, (counts.get(l.entity_id) ?? 0) + 1);
  const recurring = [...counts.entries()].filter(([, n]) => n >= 4).slice(0, 10);
  if (recurring.length > 0) {
    const ids = recurring.map(([id]) => id);
    const { data: ents } = await admin
      .from("entities")
      .select("id, display_name, kind")
      .in("id", ids);
    for (const [id, n] of recurring) {
      const e = ents?.find((x: any) => x.id === id);
      if (!e) continue;
      drafts.push({
        source_object_type: "entity",
        source_object_id: id,
        finding_type: "recurring_entity",
        summary: `"${e.display_name}" keeps showing up — ${n} mentions in 14 days`,
        rationale: `Recurring across your captures. Might be worth a dedicated thread or commitment.`,
        confidence: "medium",
        suggested_action: "promote_to_topic",
        extracted_data: { mention_count: n, kind: e.kind },
      });
    }
  }

  // ---- 4) Cross-analysis: contract obligation with nothing tracking it
  // Documents carry promises. If none of the open commitments mention the same
  // words, the promise is living only inside a PDF.
  const { data: reviewedDocs } = await scoped(admin
    .from("documents")
    .select("id, title, status")
    .eq("user_id", userId), orgId)
    .in("status", ["reviewed", "extracted", "approved"])
    .limit(50);
  const docIds = (reviewedDocs ?? []).map((d: any) => d.id);
  if (docIds.length > 0) {
    const { data: obligations } = await admin
      .from("document_obligations")
      .select("id, document_id, party, what, when_text")
      .eq("user_id", userId)
      .in("document_id", docIds)
      .limit(120);
    const { data: openCommitments } = await scoped(admin
      .from("commitments")
      .select("id, summary")
      .eq("user_id", userId), orgId)
      .eq("status", "open")
      .limit(200);
    const commitmentText = (openCommitments ?? []).map((c: any) => (c.summary ?? "").toLowerCase());
    const flaggedDocs = new Set<string>();
    for (const o of obligations ?? []) {
      if (!o.what || flaggedDocs.has(o.document_id)) continue;
      if (commitmentText.some((t) => overlaps(t, String(o.what)))) continue;
      flaggedDocs.add(o.document_id);
      const doc = (reviewedDocs ?? []).find((d: any) => d.id === o.document_id);
      drafts.push({
        source_object_type: "document",
        source_object_id: o.document_id,
        finding_type: "obligation_untracked",
        summary: `"${truncate(doc?.title ?? "A document", 40)}" promises something nothing is tracking`,
        rationale: `${o.party ? o.party + ": " : ""}${truncate(String(o.what), 90)}${o.when_text ? ` (${truncate(String(o.when_text), 30)})` : ""} — no open commitment looks like this.`,
        confidence: "medium",
        suggested_action: "create_commitment",
        target_object_type: "document_obligation",
        target_object_id: o.id,
        extracted_data: { what: o.what, when_text: o.when_text, party: o.party },
      });
    }

    // ---- 5) Cross-analysis: a high risk sitting on a document nobody signed off on
    const { data: risks } = await admin
      .from("document_risks")
      .select("id, document_id, severity, title, plain_english")
      .eq("user_id", userId)
      .eq("severity", "high")
      .in("document_id", docIds)
      .limit(60);
    const flaggedRiskDocs = new Set<string>();
    for (const r of risks ?? []) {
      const doc = (reviewedDocs ?? []).find((d: any) => d.id === r.document_id);
      if (!doc || doc.status === "approved" || flaggedRiskDocs.has(r.document_id)) continue;
      flaggedRiskDocs.add(r.document_id);
      drafts.push({
        source_object_type: "document",
        source_object_id: r.document_id,
        finding_type: "unapproved_high_risk",
        summary: `High risk still open on "${truncate(doc.title ?? "a document", 40)}"`,
        rationale: `${truncate(String(r.title ?? "Flagged clause"), 60)} — ${truncate(String(r.plain_english ?? "worth a second read"), 90)}. The document has not been approved.`,
        confidence: "high",
        suggested_action: "review_document",
        target_object_type: "document_risk",
        target_object_id: r.id,
        extracted_data: { severity: r.severity, clause: r.title },
      });
    }
  }

  // ---- 6) Cross-analysis: meeting soon with no context anywhere near it
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 3600_000).toISOString();
  const { data: upcoming } = await scoped(admin
    .from("calendar_events")
    .select("id, title, starts_at, project_id")
    .eq("user_id", userId), orgId)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", in48h)
    .order("starts_at", { ascending: true })
    .limit(20);
  if ((upcoming ?? []).length > 0) {
    const { data: recentNotes } = await scoped(admin
      .from("notes")
      .select("title, body")
      .eq("user_id", userId), orgId)
      .gte("created_at", fourteenDaysAgo)
      .limit(200);
    const noteText = (recentNotes ?? []).map((n: any) => `${n.title ?? ""} ${String(n.body ?? "").slice(0, 200)}`.toLowerCase());
    const commitmentAll = (await scoped(admin
      .from("commitments")
      .select("summary")
      .eq("user_id", userId), orgId)
      .eq("status", "open")
      .limit(200)).data ?? [];
    const commitmentText = (commitmentAll as any[]).map((c) => String(c.summary ?? "").toLowerCase());
    for (const ev of upcoming ?? []) {
      if (!ev.title || ev.project_id) continue;
      const hay = [...noteText, ...commitmentText];
      if (hay.some((t) => overlaps(t, String(ev.title)))) continue;
      drafts.push({
        source_object_type: "calendar_event",
        source_object_id: ev.id,
        finding_type: "meeting_without_context",
        summary: `"${truncate(ev.title, 45)}" is coming up with nothing behind it`,
        rationale: `Starts ${human(ev.starts_at)} · no note, commitment, or project points at it.`,
        confidence: "low",
        suggested_action: "prepare_context",
        extracted_data: { starts_at: ev.starts_at },
      });
    }
  }

  let written = 0, suppressed = 0;
  for (const d of drafts) {
    const r = await createFinding(admin, userId, orgId, d);
    if (r) written++; else suppressed++;
  }

  await admin.from("audit_log").insert({
    user_id: userId,
    entity_type: "sherlock_patterns",
    organization_id: orgId,
    event: "sherlock_patterns_scanned",
    payload: { drafts: drafts.length, written, suppressed },
  });

  return { drafts: drafts.length, written, suppressed };
}

async function createFinding(admin: any, userId: string, orgId: string | null, d: FindingDraft) {
  // Cooldown enforcement (mirror of client-side lifecycle helper)
  if (d.suggested_action || d.target_object_id) {
    let q = scoped(admin
      .from("sherlock_findings")
      .select("id, cooldown_until")
      .eq("user_id", userId), orgId)
      .eq("source_object_type", d.source_object_type)
      .eq("status", "dismissed");
    if (d.source_object_id) q = q.eq("source_object_id", d.source_object_id);
    if (d.suggested_action) q = q.eq("suggested_action", d.suggested_action);
    const { data: blocked } = await q.limit(1);
    if (blocked?.[0]?.cooldown_until && new Date(blocked[0].cooldown_until) > new Date()) {
      return null;
    }
  }
  // Skip if an identical pending finding already exists
  let dupQuery = scoped(admin
    .from("sherlock_findings")
    .select("id")
    .eq("user_id", userId), orgId)
    .eq("source_object_type", d.source_object_type)
    .eq("finding_type", d.finding_type)
    .eq("status", "pending");
  if (d.source_object_id) dupQuery = dupQuery.eq("source_object_id", d.source_object_id);
  const { data: dup } = await dupQuery.limit(1);
  if (dup?.[0]) return null;

  const { data, error } = await admin
    .from("sherlock_findings")
    .insert({
      user_id: userId,
      organization_id: orgId,
      source_object_type: d.source_object_type,
      source_object_id: d.source_object_id ?? null,
      mode: "observe",
      finding_type: d.finding_type,
      summary: d.summary,
      rationale: d.rationale,
      confidence: d.confidence,
      suggested_action: d.suggested_action ?? null,
      target_object_type: d.target_object_type ?? null,
      target_object_id: d.target_object_id ?? null,
      extracted_data: d.extracted_data ?? {},
      surface_origin: "patterns",
      status: "pending",
    })
    .select("id")
    .single();
  if (error) {
    console.warn("[sherlock-patterns] insert failed", error.message);
    return null;
  }
  await admin.from("audit_log").insert({
    user_id: userId,
    organization_id: orgId,
    entity_type: "sherlock_finding",
    entity_id: data.id,
    event: "sherlock_finding_created",
    payload: { mode: "observe", finding_type: d.finding_type, surface_origin: "patterns" },
  });
  return data;
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
function human(iso: string | null | undefined) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  const days = Math.round((Date.now() - d.getTime()) / 86400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 0) return `${days}d ago`;
  return `in ${-days}d`;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Cheap word-overlap check. Two strings "look like each other" when they share
 * at least two meaningful words. Deliberately conservative: a false negative
 * just means one more draft for the user to dismiss, never a wrong execution.
 */
function overlaps(haystack: string, needle: string): boolean {
  const words = String(needle)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  if (words.length === 0) return false;
  const hits = words.filter((w) => haystack.includes(w)).length;
  return hits >= Math.min(2, words.length);
}
