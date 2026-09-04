// workReads — read-only answers about the Work desks, shared by every channel
// that has to answer "what's waiting", "what's due", "how's this project going"
// and "what changed". Telegram and the in-app companion call the same code so
// the two never drift.
//
// Doctrine: reads only. Nothing here approves, executes, or mutates anything.
// The one exception is `attachToProject`, which is a reversible filing link.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type ScopeArgs = { userId: string; orgId: string | null };

/** Scope every query the same way the app does: personal rows are org-null. */
function scoped(q: any, { userId, orgId }: ScopeArgs) {
  const withUser = q.eq("user_id", userId);
  return orgId ? withUser.eq("organization_id", orgId) : withUser.is("organization_id", null);
}

/* ------------------------------ formatting ------------------------------- */

export type WaitingCounts = {
  stagedActions: number;
  filesNeedingReview: number;
  overdueCommitments: number;
  overdueTop: string | null;
};

/** Plain-English "what's waiting on me", three lines max. */
export function formatWaiting(c: WaitingCounts): string {
  const bits: string[] = [];
  if (c.stagedActions > 0) {
    bits.push(`${c.stagedActions} draft${c.stagedActions === 1 ? "" : "s"} waiting for your approval`);
  }
  if (c.overdueCommitments > 0) {
    const tail = c.overdueTop ? ` (${c.overdueTop})` : "";
    bits.push(`${c.overdueCommitments} promise${c.overdueCommitments === 1 ? "" : "s"} overdue${tail}`);
  }
  if (c.filesNeedingReview > 0) {
    bits.push(`${c.filesNeedingReview} item${c.filesNeedingReview === 1 ? "" : "s"} in the Inbox still need a lane`);
  }
  if (!bits.length) return "Nothing's waiting on you. Inbox is clear and no promise is overdue.";
  return `${bits.join(". ")}.`;
}

export type DueItem = { summary: string; due_at: string | null; overdue: boolean; direction?: string | null };

export function formatDue(items: DueItem[], days: number, tz: string): string {
  if (!items.length) return `Nothing due in the next ${days} day${days === 1 ? "" : "s"}, and nothing overdue.`;
  const lines = items.slice(0, 5).map((i) => {
    const when = i.due_at
      ? new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" })
          .format(new Date(i.due_at))
      : "no date";
    return `- ${i.summary} — ${i.overdue ? `overdue, was ${when}` : when}`;
  });
  const more = items.length > 5 ? `\n(+${items.length - 5} more)` : "";
  return `${lines.join("\n")}${more}`;
}

export function formatChanged(counts: { captures: number; commitmentsClosed: number; drafts: number; findings: number }, days: number): string {
  const bits: string[] = [];
  if (counts.captures) bits.push(`${counts.captures} thing${counts.captures === 1 ? "" : "s"} came in`);
  if (counts.commitmentsClosed) bits.push(`${counts.commitmentsClosed} promise${counts.commitmentsClosed === 1 ? "" : "s"} closed`);
  if (counts.drafts) bits.push(`${counts.drafts} draft${counts.drafts === 1 ? "" : "s"} prepared`);
  if (counts.findings) bits.push(`${counts.findings} thing${counts.findings === 1 ? "" : "s"} Vanta flagged`);
  if (!bits.length) return `Quiet — nothing moved in the last ${days} day${days === 1 ? "" : "s"}.`;
  return `Last ${days} day${days === 1 ? "" : "s"}: ${bits.join(", ")}.`;
}

/* -------------------------------- reads ---------------------------------- */

export async function whatsWaiting(sb: SupabaseClient, scope: ScopeArgs): Promise<{ counts: WaitingCounts; text: string }> {
  const nowIso = new Date().toISOString();
  const [actions, files, overdue] = await Promise.all([
    scoped(sb.from("actions").select("id", { count: "exact", head: true }), scope).eq("status", "staged"),
    scoped(sb.from("ingested_files").select("id", { count: "exact", head: true }), scope)
      .in("review_status", ["new", "needs_review", "suggested"]),
    scoped(sb.from("commitments").select("summary, due_at").order("due_at", { ascending: true }).limit(20), scope)
      .eq("status", "open").lt("due_at", nowIso),
  ]);
  const overdueRows = (overdue as any).data ?? [];
  const counts: WaitingCounts = {
    stagedActions: (actions as any).count ?? 0,
    filesNeedingReview: (files as any).count ?? 0,
    overdueCommitments: overdueRows.length,
    overdueTop: overdueRows[0]?.summary ?? null,
  };
  return { counts, text: formatWaiting(counts) };
}

export async function whatsDue(
  sb: SupabaseClient,
  scope: ScopeArgs,
  opts: { days?: number; tz?: string } = {},
): Promise<{ items: DueItem[]; text: string }> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 60);
  const tz = opts.tz || "UTC";
  const now = Date.now();
  const horizon = new Date(now + days * 86400_000).toISOString();
  const { data } = await scoped(
    sb.from("commitments").select("summary, due_at, direction").order("due_at", { ascending: true }).limit(40),
    scope,
  ).eq("status", "open").lte("due_at", horizon);
  const items: DueItem[] = (data ?? []).map((r: any) => ({
    summary: r.summary,
    due_at: r.due_at,
    direction: r.direction ?? null,
    overdue: !!r.due_at && new Date(r.due_at).getTime() < now,
  }));
  return { items, text: formatDue(items, days, tz) };
}

/** Find a project by fuzzy title match within scope. */
export async function findProject(
  sb: SupabaseClient,
  scope: ScopeArgs,
  query: string,
): Promise<{ id: string; title: string; summary: string; brief_structured: unknown } | null> {
  const q = (query ?? "").trim();
  if (!q) return null;
  const { data } = await scoped(
    sb.from("projects").select("id, title, summary, brief_structured").limit(25),
    scope,
  ).ilike("title", `%${q}%`);
  const rows = (data ?? []) as any[];
  if (!rows.length) return null;
  const exact = rows.find((r) => r.title.toLowerCase() === q.toLowerCase());
  return exact ?? rows[0];
}

export async function listProjects(sb: SupabaseClient, scope: ScopeArgs, limit = 8) {
  const { data } = await scoped(
    sb.from("projects").select("id, title").order("updated_at", { ascending: false }).limit(limit),
    scope,
  ).eq("status", "active");
  return (data ?? []) as { id: string; title: string }[];
}

export async function projectStatus(
  sb: SupabaseClient,
  scope: ScopeArgs,
  query: string,
): Promise<{ project: { id: string; title: string } | null; text: string }> {
  const project = await findProject(sb, scope, query);
  if (!project) {
    const options = await listProjects(sb, scope, 5);
    const list = options.length ? ` Projects I can see: ${options.map((o) => o.title).join(", ")}.` : "";
    return { project: null, text: `I don't have a project matching "${query}".${list}` };
  }
  const [items, commitments] = await Promise.all([
    sb.from("project_items").select("item_type", { count: "exact" }).eq("project_id", project.id).limit(200),
    scoped(sb.from("commitments").select("summary, due_at").limit(20), scope).eq("status", "open"),
  ]);
  const itemCount = (items as any).count ?? ((items as any).data ?? []).length;
  const open = ((commitments as any).data ?? []).length;
  const brief = (project as any).brief_structured as any;
  const stands: string | null =
    typeof brief?.overall_summary?.body === "string"
      ? brief.overall_summary.body
      : typeof brief?.situation?.body === "string"
        ? brief.situation.body
        : (project as any).summary || null;
  const lines = [
    `${project.title} — ${itemCount} item${itemCount === 1 ? "" : "s"} attached, ${open} promise${open === 1 ? "" : "s"} open.`,
  ];
  if (stands) lines.push(`Where it stands: ${String(stands).replace(/\s+/g, " ").slice(0, 220)}`);
  else lines.push("No brief yet — open the project and tap Summarize to build one.");
  return { project: { id: project.id, title: project.title }, text: lines.join("\n") };
}

export async function whatsChanged(
  sb: SupabaseClient,
  scope: ScopeArgs,
  opts: { days?: number } = {},
): Promise<{ text: string }> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 30);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [captures, closed, drafts, findings] = await Promise.all([
    scoped(sb.from("ingested_files").select("id", { count: "exact", head: true }), scope).gte("created_at", since),
    scoped(sb.from("commitments").select("id", { count: "exact", head: true }), scope)
      .eq("status", "done").gte("updated_at", since),
    scoped(sb.from("actions").select("id", { count: "exact", head: true }), scope).gte("created_at", since),
    scoped(sb.from("sherlock_findings").select("id", { count: "exact", head: true }), scope).gte("created_at", since),
  ]);
  return {
    text: formatChanged(
      {
        captures: (captures as any).count ?? 0,
        commitmentsClosed: (closed as any).count ?? 0,
        drafts: (drafts as any).count ?? 0,
        findings: (findings as any).count ?? 0,
      },
      days,
    ),
  };
}

/**
 * File an existing capture under an existing project. Reversible link, no new
 * object, provenance recorded on the row.
 */
export async function attachToProject(
  sb: SupabaseClient,
  scope: ScopeArgs,
  args: { projectId: string; itemType: string; itemId: string; via?: string },
): Promise<{ ok: boolean; title?: string; reason?: string }> {
  const { data: project } = await scoped(
    sb.from("projects").select("id, title").eq("id", args.projectId).limit(1),
    scope,
  ).maybeSingle();
  if (!project) return { ok: false, reason: "project_not_found" };

  const { data: existing } = await sb.from("project_items").select("id")
    .eq("project_id", args.projectId).eq("item_type", args.itemType).eq("item_id", args.itemId).maybeSingle();
  if (existing) return { ok: true, title: (project as any).title };

  const { error } = await sb.from("project_items").insert({
    project_id: args.projectId,
    item_type: args.itemType,
    item_id: args.itemId,
    added_by: scope.userId,
    note: args.via ? `Filed from ${args.via}` : null,
  });
  if (error) return { ok: false, reason: error.message };

  await sb.from("audit_log").insert({
    user_id: scope.userId,
    organization_id: scope.orgId,
    entity_type: "project",
    entity_id: args.projectId,
    event: "project.item_attached",
    payload: { item_type: args.itemType, item_id: args.itemId, via: args.via ?? null },
  });
  return { ok: true, title: (project as any).title };
}
