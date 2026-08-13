// workingContext — the "what was I working on?" layer.
//
// Pure functions only: ranking, freshness decay, ambiguity and snapshot diffing
// are all testable without rendering or touching the database. The hook in
// hooks/useWorkingContext.ts does the scoped reads and calls into here.
//
// Doctrine: working memory prepares, it never executes. Nothing here mutates
// state, proposes an action, or answers without a grounded source record.

export type WorkSignalKind = "receipt" | "action" | "commitment" | "note" | "item";

export type WorkSignal = {
  /** null = loose work not attached to any project. */
  projectId: string | null;
  projectTitle: string | null;
  kind: WorkSignalKind;
  at: string;
  /** Short human line, already plain-English. */
  label: string;
  /** Still open: staged action, open commitment, unreviewed capture. */
  unresolved?: boolean;
  /** Open commitment carrying an explicit date. */
  hasDueDate?: boolean;
  /** Last approval / execution decision on this work. */
  decision?: boolean;
};

export type Freshness = "current" | "recent" | "stale";

export type WorkingCandidate = {
  key: string;
  projectId: string | null;
  projectTitle: string | null;
  score: number;
  lastActivityAt: string;
  freshness: Freshness;
  /** What is still open, most relevant first. */
  unresolved: string[];
  lastDecision: string | null;
  summary: string;
  sources: WorkSignalKind[];
  activityCount: number;
  pinned: boolean;
};

export type WorkingContextSnapshot = {
  summary: string;
  unresolved: string[];
  last_decision: string | null;
  last_activity_at: string;
  sources: WorkSignalKind[];
  refreshed_at: string;
  dismissed_until?: string | null;
  pinned?: boolean;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function freshnessOf(at: string, now: number = Date.now()): Freshness {
  const age = now - new Date(at).getTime();
  if (age < 2 * DAY) return "current";
  if (age < 14 * DAY) return "recent";
  return "stale";
}

/** 4 → touched in the last hours, 0 → two weeks cold. */
function recencyScore(at: string, now: number): number {
  const age = now - new Date(at).getTime();
  if (age < 4 * HOUR) return 4;
  if (age < DAY) return 3;
  if (age < 2 * DAY) return 2;
  if (age < 7 * DAY) return 1;
  return 0;
}

export type RankOptions = {
  now?: number;
  /** Project ids the user pinned to Resume work. */
  pinned?: Set<string>;
  /** projectId (or "loose") -> ISO time the user muted it until. */
  dismissedUntil?: Record<string, string | null | undefined>;
  /** Project ids the user marked resolved (nothing open worth resuming). */
  resolved?: Set<string>;
};

/**
 * Fold raw signals into ranked candidates.
 *
 * Freshness decay: current work always shows, recent work only when something
 * is still open, stale work only when pinned.
 */
export function rankWorkCandidates(signals: WorkSignal[], opts: RankOptions = {}): WorkingCandidate[] {
  const now = opts.now ?? Date.now();
  const pinned = opts.pinned ?? new Set<string>();
  const resolved = opts.resolved ?? new Set<string>();
  const dismissed = opts.dismissedUntil ?? {};

  const groups = new Map<string, WorkSignal[]>();
  for (const s of signals) {
    const key = s.projectId ?? "loose";
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const out: WorkingCandidate[] = [];

  for (const [key, list] of groups) {
    const until = dismissed[key];
    if (until && new Date(until).getTime() > now) continue;
    if (key !== "loose" && resolved.has(key)) continue;

    const sorted = [...list].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const lastActivityAt = sorted[0].at;
    const freshness = freshnessOf(lastActivityAt, now);
    const unresolved = sorted.filter((s) => s.unresolved).map((s) => s.label);
    const isPinned = key !== "loose" && pinned.has(key);

    if (freshness === "recent" && unresolved.length === 0 && !isPinned) continue;
    if (freshness === "stale" && !isPinned) continue;

    const hasDue = sorted.some((s) => s.unresolved && s.hasDueDate);
    const score =
      unresolved.length * 3 +
      (hasDue ? 2 : 0) +
      recencyScore(lastActivityAt, now) +
      (isPinned ? 2 : 0) +
      Math.min(sorted.length, 5) * 0.4;

    const sources = Array.from(new Set(sorted.map((s) => s.kind)));
    const lastDecision = sorted.find((s) => s.decision)?.label ?? null;

    out.push({
      key,
      projectId: sorted[0].projectId,
      projectTitle: sorted[0].projectTitle,
      score: Math.round(score * 100) / 100,
      lastActivityAt,
      freshness,
      unresolved: unresolved.slice(0, 4),
      lastDecision,
      summary: summarizeCandidate({
        projectTitle: sorted[0].projectTitle,
        unresolvedCount: unresolved.length,
        firstUnresolved: unresolved[0] ?? null,
        lastLabel: sorted[0].label,
      }),
      sources,
      activityCount: sorted.length,
      pinned: isPinned,
    });
  }

  return out.sort((a, b) => b.score - a.score || b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/** One honest line — what this work is sitting on right now. */
export function summarizeCandidate(input: {
  projectTitle: string | null;
  unresolvedCount: number;
  firstUnresolved: string | null;
  lastLabel: string;
}): string {
  const where = input.projectTitle ?? "Work outside a project";
  if (input.unresolvedCount > 0 && input.firstUnresolved) {
    const more = input.unresolvedCount - 1;
    return `${where} — still open: ${input.firstUnresolved}${more > 0 ? ` and ${more} more` : ""}.`;
  }
  return `${where} — last thing: ${input.lastLabel}.`;
}

/** Ambiguity is not failure. Two near-equal candidates means Vanta asks. */
export function isAmbiguous(candidates: WorkingCandidate[], margin = 0.12): boolean {
  if (candidates.length < 2) return false;
  const [a, b] = candidates;
  if (a.score <= 0) return false;
  return (a.score - b.score) / a.score < margin;
}

export function resumePrompt(candidates: WorkingCandidate[]): string | null {
  if (candidates.length === 0) return null;
  if (isAmbiguous(candidates)) {
    const [a, b] = candidates;
    return `Two threads look equally warm: ${a.projectTitle ?? "loose work"} and ${b.projectTitle ?? "loose work"}. Which one?`;
  }
  return candidates[0].summary;
}

/** Human "last worked on" label. */
export function lastTouchedLabel(at: string, now: number = Date.now()): string {
  const age = now - new Date(at).getTime();
  if (age < HOUR) return "just now";
  if (age < DAY) return `${Math.max(1, Math.round(age / HOUR))}h ago`;
  const days = Math.round(age / DAY);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/** Meaningful deltas only — what moved since the cached snapshot. */
export function snapshotDeltas(
  prev: WorkingContextSnapshot | null,
  next: WorkingCandidate,
): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const before = new Set(prev.unresolved ?? []);
  const after = new Set(next.unresolved);
  for (const item of after) if (!before.has(item)) out.push(`new: ${item}`);
  for (const item of before) if (!after.has(item)) out.push(`closed: ${item}`);
  if (next.lastDecision && next.lastDecision !== prev.last_decision) {
    out.push(`decision: ${next.lastDecision}`);
  }
  return out.slice(0, 6);
}

export function toSnapshot(c: WorkingCandidate, now: number = Date.now()): WorkingContextSnapshot {
  return {
    summary: c.summary,
    unresolved: c.unresolved,
    last_decision: c.lastDecision,
    last_activity_at: c.lastActivityAt,
    sources: c.sources,
    refreshed_at: new Date(now).toISOString(),
    pinned: c.pinned,
  };
}

export function readSnapshot(metadata: unknown): WorkingContextSnapshot | null {
  if (!metadata || typeof metadata !== "object") return null;
  const wc = (metadata as Record<string, unknown>).working_context;
  if (!wc || typeof wc !== "object") return null;
  return wc as WorkingContextSnapshot;
}

export function mergeSnapshot(
  metadata: unknown,
  patch: Partial<WorkingContextSnapshot>,
): Record<string, unknown> {
  const base = (metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {}) as Record<string, unknown>;
  base.working_context = { ...(readSnapshot(metadata) ?? {}), ...patch };
  return base;
}

/** Cache keys always carry scope — Personal and each workspace stay separate. */
export function workingContextKey(scopeKey: string, projectId: string | null): string {
  return `${scopeKey}:working:${projectId ?? "loose"}`;
}
