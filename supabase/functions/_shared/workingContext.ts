// Server-side working context — the same ranking the Today "Continue where you
// left off" section uses, so Ask Vanta answers "where did I leave off?" from
// real records instead of guessing from unrelated history.
//
// Scope-isolated: the caller passes the already-scoped query wrapper.
// Read-only: this never writes, proposes, or executes anything.

type Scoped = (q: any) => any;

const HOUR = 3600_000;
const DAY = 24 * HOUR;

type Signal = {
  projectId: string | null;
  projectTitle: string | null;
  kind: "action" | "commitment" | "receipt";
  at: string;
  label: string;
  unresolved?: boolean;
  hasDueDate?: boolean;
  decision?: boolean;
};

export type ServerCandidate = {
  projectId: string | null;
  projectTitle: string | null;
  score: number;
  lastActivityAt: string;
  unresolved: string[];
  lastDecision: string | null;
  sources: string[];
  activityCount: number;
};

function recencyScore(at: string, now: number): number {
  const age = now - new Date(at).getTime();
  if (age < 4 * HOUR) return 4;
  if (age < DAY) return 3;
  if (age < 2 * DAY) return 2;
  if (age < 7 * DAY) return 1;
  return 0;
}

export async function buildWorkingContext(
  supabase: any,
  scoped: Scoped,
  opts: { windowDays?: number; limit?: number } = {},
): Promise<ServerCandidate[]> {
  const windowDays = opts.windowDays ?? 14;
  const now = Date.now();
  const since = new Date(now - windowDays * DAY).toISOString();

  const [p, a, c, e] = await Promise.all([
    scoped(supabase.from("projects").select("id, title, metadata, pinned")).neq("status", "archived").limit(40),
    scoped(supabase.from("actions").select("id, title, status, updated_at"))
      .in("status", ["proposed", "staged", "approved", "executed"])
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(40),
    scoped(supabase.from("commitments").select("id, summary, due_at, status, updated_at"))
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(40),
    scoped(supabase.from("audit_log").select("event, entity_type, entity_id, created_at"))
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const projects = (p?.data ?? []) as { id: string; title: string; metadata: any; pinned: boolean }[];
  if (!projects.length && !(a?.data ?? []).length && !(c?.data ?? []).length) return [];
  const titleOf = new Map(projects.map((r) => [r.id, r.title]));

  const ownerOf = new Map<string, string>();
  if (projects.length) {
    const { data: items } = await supabase
      .from("project_items")
      .select("item_id, project_id")
      .in("project_id", projects.map((r) => r.id))
      .limit(400);
    for (const row of (items ?? []) as { item_id: string; project_id: string }[]) {
      ownerOf.set(row.item_id, row.project_id);
    }
  }

  const dismissed = new Map<string, string | null>();
  for (const r of projects) dismissed.set(r.id, r.metadata?.working_context?.dismissed_until ?? null);
  const pinned = new Set(
    projects.filter((r) => r.pinned || r.metadata?.working_context?.pinned).map((r) => r.id),
  );

  const signals: Signal[] = [];
  for (const row of (a?.data ?? []) as any[]) {
    const projectId = ownerOf.get(row.id) ?? null;
    signals.push({
      projectId,
      projectTitle: projectId ? titleOf.get(projectId) ?? null : null,
      kind: "action",
      at: row.updated_at,
      label: row.title,
      unresolved: row.status !== "executed",
      decision: row.status === "approved" || row.status === "executed",
    });
  }
  for (const row of (c?.data ?? []) as any[]) {
    const projectId = ownerOf.get(row.id) ?? null;
    signals.push({
      projectId,
      projectTitle: projectId ? titleOf.get(projectId) ?? null : null,
      kind: "commitment",
      at: row.updated_at,
      label: row.summary,
      unresolved: row.status === "open",
      hasDueDate: !!row.due_at,
    });
  }
  for (const row of (e?.data ?? []) as any[]) {
    const projectId = (row.entity_id && ownerOf.get(row.entity_id)) || (row.entity_type === "project" ? row.entity_id : null);
    if (!projectId) continue;
    signals.push({
      projectId,
      projectTitle: titleOf.get(projectId) ?? null,
      kind: "receipt",
      at: row.created_at,
      label: String(row.event).replace(/[._:]/g, " "),
      decision: /approve|execute/.test(String(row.event)),
    });
  }

  const groups = new Map<string, Signal[]>();
  for (const s of signals) {
    const key = s.projectId ?? "loose";
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const out: ServerCandidate[] = [];
  for (const [key, list] of groups) {
    const until = dismissed.get(key);
    if (until && new Date(until).getTime() > now) continue;
    const sorted = list.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
    const lastActivityAt = sorted[0].at;
    const age = now - new Date(lastActivityAt).getTime();
    const unresolved = sorted.filter((s) => s.unresolved).map((s) => s.label);
    const isPinned = key !== "loose" && pinned.has(key);
    if (age >= 2 * DAY && age < 14 * DAY && unresolved.length === 0 && !isPinned) continue;
    if (age >= 14 * DAY && !isPinned) continue;

    out.push({
      projectId: sorted[0].projectId,
      projectTitle: sorted[0].projectTitle,
      score:
        unresolved.length * 3 +
        (sorted.some((s) => s.unresolved && s.hasDueDate) ? 2 : 0) +
        recencyScore(lastActivityAt, now) +
        (isPinned ? 2 : 0) +
        Math.min(sorted.length, 5) * 0.4,
      lastActivityAt,
      unresolved: unresolved.slice(0, 4),
      lastDecision: sorted.find((s) => s.decision)?.label ?? null,
      sources: Array.from(new Set(sorted.map((s) => s.kind))),
      activityCount: sorted.length,
    });
  }

  return out.sort((x, y) => y.score - x.score).slice(0, opts.limit ?? 3);
}

/** Prompt block. Empty string when there is nothing grounded to say. */
export function workingContextBlock(candidates: ServerCandidate[]): string {
  if (!candidates.length) {
    return `Working context: no recent work found in this space. If the user asks where they left off, say you do not see recent work here — do not invent continuity.`;
  }
  const lines = candidates.map((c, i) => {
    const where = c.projectTitle ?? "work outside a project";
    return [
      `${i + 1}. ${where}`,
      `   - last activity: ${c.lastActivityAt} (${c.activityCount} recent record${c.activityCount === 1 ? "" : "s"}; sources: ${c.sources.join(", ")})`,
      c.unresolved.length ? `   - still open: ${c.unresolved.join("; ")}` : "   - nothing open",
      c.lastDecision ? `   - last decision: ${c.lastDecision}` : "",
    ].filter(Boolean).join("\n");
  });
  const ambiguous =
    candidates.length > 1 && candidates[0].score > 0 && (candidates[0].score - candidates[1].score) / candidates[0].score < 0.12;
  return [
    "Working context — the user's recent work in this space, ranked. Answer continuity questions from this, not from unrelated history:",
    ...lines,
    ambiguous
      ? "Two threads are close to equal. Name both and ask which one the user means instead of guessing."
      : "",
    "Summarize; never dump these records verbatim. Working context can prepare work, never execute it.",
  ].filter(Boolean).join("\n");
}
