// continuity — the long-gap layer on top of working memory.
//
// Working memory (lib/workingContext.ts) answers "what was I just doing?" over a
// 14-day window. This module answers the harder question: "bring me back up to
// speed" after days or weeks away. It is deliberately pure — ranking, state
// classification, anchors, deltas and snapshot merging are all testable without
// a database or a render.
//
// Doctrine, unchanged:
//   - continuity prepares, it never executes
//   - every claim is traceable to a source record (kind + id)
//   - age alone never erases relevance; recency alone never wins
//   - dormant work stays quiet unless there is a real reason to speak
//   - ambiguity is not failure

export type ContinuitySignalKind =
  | "receipt"
  | "action"
  | "commitment"
  | "note"
  | "item"
  | "brief"
  | "document"
  | "correction"
  | "finding";

export type ContinuitySignal = {
  /** null = work not attached to any project. */
  projectId: string | null;
  projectTitle: string | null;
  kind: ContinuitySignalKind;
  /** ISO time of the record. */
  at: string;
  /** Plain-English one-liner, already human. */
  label: string;
  /** Source record so the UI/companion can link to proof. */
  sourceId?: string | null;
  /** Still open: staged action, open commitment, draft awaiting review. */
  unresolved?: boolean;
  hasDueDate?: boolean;
  dueAt?: string | null;
  /** An approval or execution happened here. */
  decision?: boolean;
  /** Why the decision was taken, when the record captured it. */
  rationale?: string | null;
  highRisk?: boolean;
  pendingApproval?: boolean;
  blocked?: boolean;
  /** The user touched this by hand (opened, edited, wrote about it). */
  userTouch?: boolean;
};

/** Longer freshness model. Age is one input, not the verdict. */
export type ContinuityState = "active" | "recent" | "dormant" | "stale" | "unresolved-long-term";

export type SurfaceReason =
  | "recent-activity"
  | "open-items"
  | "due-date"
  | "pending-approval"
  | "high-risk"
  | "blocked"
  | "pinned"
  | "dependency-changed"
  | "asked";

export type SourceRef = { kind: ContinuitySignalKind; id: string | null; label: string; at: string };

export type ContinuityThread = {
  label: string;
  kind: ContinuitySignalKind;
  sourceId: string | null;
  at: string;
  overdue: boolean;
};

export type ContinuityDecision = {
  label: string;
  at: string;
  rationale: string | null;
  sourceId: string | null;
  kind: ContinuitySignalKind;
};

export type RelatedProjectNote = {
  projectId: string;
  projectTitle: string | null;
  /** The shared record that makes the relationship real. */
  via: string;
  label: string;
};

export type ContinuityCandidate = {
  key: string;
  projectId: string | null;
  projectTitle: string | null;
  score: number;
  state: ContinuityState;
  /** Why this is allowed to surface at all. Null = it should stay quiet. */
  reason: SurfaceReason | null;
  lastActivityAt: string;
  /** Strongest signal of the user's own last interaction. */
  anchorAt: string | null;
  anchorConfidence: "known" | "inferred" | "none";
  summary: string;
  unresolved: ContinuityThread[];
  decisions: ContinuityDecision[];
  sources: SourceRef[];
  activityCount: number;
  pinned: boolean;
  related: RelatedProjectNote[];
};

export type ContinuitySnapshot = {
  scope_key: string;
  summary: string;
  state: ContinuityState;
  unresolved: string[];
  last_decision: string | null;
  last_activity_at: string;
  anchor_at: string | null;
  anchor_confidence: "known" | "inferred" | "none";
  sources: ContinuitySignalKind[];
  refreshed_at: string;
  dismissed_until?: string | null;
  resolved?: boolean;
  pinned?: boolean;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ACTIVE_DAYS = 3;
const RECENT_DAYS = 10;
const DORMANT_DAYS = 60;

/** Meaningful records — a metadata touch is not activity. */
const MEANINGFUL: ContinuitySignalKind[] = [
  "receipt",
  "action",
  "commitment",
  "note",
  "brief",
  "document",
  "correction",
  "finding",
];

export function isMeaningful(kind: ContinuitySignalKind): boolean {
  return MEANINGFUL.includes(kind);
}

export function ageDays(at: string, now: number = Date.now()): number {
  return (now - new Date(at).getTime()) / DAY;
}

export function continuityStateOf(
  lastActivityAt: string,
  opts: { unresolved?: boolean } = {},
  now: number = Date.now(),
): ContinuityState {
  const age = ageDays(lastActivityAt, now);
  if (age < ACTIVE_DAYS) return "active";
  if (age < RECENT_DAYS) return "recent";
  // Old but still open work gets its own state so it never reads as "stale".
  if (opts.unresolved) return "unresolved-long-term";
  if (age < DORMANT_DAYS) return "dormant";
  return "stale";
}

function isOverdue(dueAt: string | null | undefined, now: number): boolean {
  return !!dueAt && new Date(dueAt).getTime() < now;
}

function isDueSoon(dueAt: string | null | undefined, now: number): boolean {
  if (!dueAt) return false;
  const t = new Date(dueAt).getTime();
  return t >= now && t - now < 7 * DAY;
}

function recencyWeight(at: string, now: number): number {
  const age = ageDays(at, now);
  if (age < 0.25) return 4;
  if (age < 1) return 3;
  if (age < 3) return 2;
  if (age < 10) return 1;
  return 0;
}

export type ContinuityRankOptions = {
  now?: number;
  pinned?: Set<string>;
  /** projectId (or "loose") -> ISO time the user muted it until. */
  dismissedUntil?: Record<string, string | null | undefined>;
  /** Projects the user said are finished. */
  resolved?: Set<string>;
  /** Explicit user priority per project ("high" bumps ranking). */
  priority?: Record<string, string | null | undefined>;
  /** The user asked directly, so dormant/stale work is allowed to answer. */
  asked?: boolean;
  /** Grounded project relationships: projectId -> related notes. */
  related?: Record<string, RelatedProjectNote[]>;
  /** Snapshot per project, for "what changed" and incremental refresh. */
  snapshots?: Record<string, ContinuitySnapshot | null | undefined>;
};

/**
 * Fold raw signals into ranked, honest re-entry candidates.
 *
 * A candidate is returned only when it earns a `reason`. Dormant work with
 * nothing open, and stale work that is not pinned or overdue, stays quiet.
 */
export function rankContinuity(
  signals: ContinuitySignal[],
  opts: ContinuityRankOptions = {},
): ContinuityCandidate[] {
  const now = opts.now ?? Date.now();
  const pinnedSet = opts.pinned ?? new Set<string>();
  const resolvedSet = opts.resolved ?? new Set<string>();
  const dismissed = opts.dismissedUntil ?? {};
  const priority = opts.priority ?? {};
  const related = opts.related ?? {};

  const groups = new Map<string, ContinuitySignal[]>();
  for (const s of signals) {
    if (!isMeaningful(s.kind)) continue;
    const key = s.projectId ?? "loose";
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const out: ContinuityCandidate[] = [];

  for (const [key, list] of groups) {
    const until = dismissed[key];
    if (until && new Date(until).getTime() > now) continue;
    if (key !== "loose" && resolvedSet.has(key)) continue;

    const sorted = [...list].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const lastActivityAt = sorted[0].at;
    const openSignals = sorted.filter((s) => s.unresolved);
    const pinned = key !== "loose" && pinnedSet.has(key);
    const state = continuityStateOf(lastActivityAt, { unresolved: openSignals.length > 0 }, now);

    const overdue = openSignals.some((s) => isOverdue(s.dueAt, now));
    const dueSoon = openSignals.some((s) => isDueSoon(s.dueAt, now));
    const pendingApproval = openSignals.some((s) => s.pendingApproval);
    const highRisk = openSignals.some((s) => s.highRisk);
    const blocked = openSignals.some((s) => s.blocked);
    const relatedNotes = key !== "loose" ? related[key] ?? [] : [];

    const reason = surfaceReasonFor({
      state,
      hasOpen: openSignals.length > 0,
      overdue,
      dueSoon,
      pendingApproval,
      highRisk,
      blocked,
      pinned,
      dependencyChanged: relatedNotes.length > 0,
      asked: !!opts.asked,
    });
    if (!reason) continue;

    const openCount = openSignals.length;
    const score =
      Math.min(openCount, 5) * 3 +
      (overdue ? 5 : 0) +
      (dueSoon ? 4 : 0) +
      (highRisk ? 3 : 0) +
      (pendingApproval ? 3 : 0) +
      (blocked ? 2 : 0) +
      (pinned ? 3 : 0) +
      (priority[key] === "high" ? 2 : 0) +
      (relatedNotes.length > 0 ? 1 : 0) +
      recencyWeight(lastActivityAt, now) +
      Math.min(sorted.filter((s) => s.userTouch).length, 4) * 0.5 +
      Math.min(sorted.length, 6) * 0.3;

    const anchor = anchorFor(sorted);

    out.push({
      key,
      projectId: sorted[0].projectId,
      projectTitle: sorted[0].projectTitle,
      score: Math.round(score * 100) / 100,
      state,
      reason,
      lastActivityAt,
      anchorAt: anchor.at,
      anchorConfidence: anchor.confidence,
      summary: summarizeContinuity({
        projectTitle: sorted[0].projectTitle,
        state,
        lastLabel: sorted[0].label,
        lastDecision: sorted.find((s) => s.decision)?.label ?? null,
        openLabels: openSignals.map((s) => s.label),
      }),
      unresolved: openSignals.slice(0, 5).map((s) => ({
        label: s.label,
        kind: s.kind,
        sourceId: s.sourceId ?? null,
        at: s.at,
        overdue: isOverdue(s.dueAt, now),
      })),
      decisions: sorted
        .filter((s) => s.decision)
        .slice(0, 3)
        .map((s) => ({
          label: s.label,
          at: s.at,
          rationale: s.rationale ?? null,
          sourceId: s.sourceId ?? null,
          kind: s.kind,
        })),
      sources: sorted.slice(0, 8).map((s) => ({ kind: s.kind, id: s.sourceId ?? null, label: s.label, at: s.at })),
      activityCount: sorted.length,
      pinned,
      related: relatedNotes,
    });
  }

  return out.sort((a, b) => b.score - a.score || b.lastActivityAt.localeCompare(a.lastActivityAt));
}

/** Should this work be allowed to speak, and on what grounds. */
export function surfaceReasonFor(input: {
  state: ContinuityState;
  hasOpen: boolean;
  overdue?: boolean;
  dueSoon?: boolean;
  pendingApproval?: boolean;
  highRisk?: boolean;
  blocked?: boolean;
  pinned?: boolean;
  dependencyChanged?: boolean;
  asked?: boolean;
}): SurfaceReason | null {
  if (input.state === "active") return "recent-activity";
  if (input.state === "recent") {
    if (input.hasOpen) return "open-items";
    if (input.pinned) return "pinned";
    return input.asked ? "asked" : null;
  }
  // dormant / stale / unresolved-long-term need a real reason.
  if (input.overdue || input.dueSoon) return "due-date";
  if (input.pendingApproval) return "pending-approval";
  if (input.highRisk) return "high-risk";
  if (input.blocked) return "blocked";
  if (input.pinned) return "pinned";
  if (input.dependencyChanged) return "dependency-changed";
  if (input.state === "unresolved-long-term" && input.hasOpen) return "open-items";
  return input.asked ? "asked" : null;
}

export const REASON_LABEL: Record<SurfaceReason, string> = {
  "recent-activity": "Recent activity",
  "open-items": "Still open",
  "due-date": "Date coming up",
  "pending-approval": "Waiting on your approval",
  "high-risk": "High-risk action open",
  blocked: "Blocked",
  pinned: "Pinned by you",
  "dependency-changed": "Something it depends on changed",
  asked: "You asked",
};

export const STATE_LABEL: Record<ContinuityState, string> = {
  active: "Active",
  recent: "Recent",
  dormant: "Dormant",
  stale: "Cold",
  "unresolved-long-term": "Needs attention",
};

/**
 * The anchor for "since I was last here". Prefer a real user touch; fall back to
 * the last recorded activity and say the anchor is inferred. Never invent one.
 */
export function anchorFor(sorted: ContinuitySignal[]): { at: string | null; confidence: "known" | "inferred" | "none" } {
  const touch = sorted.find((s) => s.userTouch);
  if (touch) return { at: touch.at, confidence: "known" };
  if (sorted.length) return { at: sorted[0].at, confidence: "inferred" };
  return { at: null, confidence: "none" };
}

/** Honest, compact state line. No omniscience. */
export function summarizeContinuity(input: {
  projectTitle: string | null;
  state: ContinuityState;
  lastLabel: string;
  lastDecision: string | null;
  openLabels: string[];
}): string {
  const where = input.projectTitle ?? "Work outside a project";
  const parts: string[] = [];
  if (input.lastDecision) parts.push(`last recorded decision: ${input.lastDecision}`);
  else parts.push(`last recorded activity: ${input.lastLabel}`);
  if (input.openLabels.length) {
    const more = input.openLabels.length - 1;
    parts.push(`still open: ${input.openLabels[0]}${more > 0 ? ` and ${more} more` : ""}`);
  }
  return `${where} — ${parts.join("; ")}.`;
}

/** Threads that quietly fell out of recent activity but are still open. */
export function unresolvedThreads(
  candidates: ContinuityCandidate[],
  now: number = Date.now(),
  minAgeDays = RECENT_DAYS,
): ContinuityThread[] {
  const out: ContinuityThread[] = [];
  for (const c of candidates) {
    for (const t of c.unresolved) {
      if (t.overdue || ageDays(t.at, now) >= minAgeDays) out.push(t);
    }
  }
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.at.localeCompare(b.at));
}

/** Decision history, newest first. Empty means the rationale was never captured. */
export function decisionHistory(candidates: ContinuityCandidate[], limit = 5): ContinuityDecision[] {
  return candidates
    .flatMap((c) => c.decisions)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/** Ambiguity is not failure. */
export function isContinuityAmbiguous(candidates: ContinuityCandidate[], margin = 0.12): boolean {
  if (candidates.length < 2) return false;
  const [a, b] = candidates;
  if (a.score <= 0) return false;
  return (a.score - b.score) / a.score < margin;
}

export function clarificationPrompt(candidates: ContinuityCandidate[], max = 3): string | null {
  if (candidates.length < 2 || !isContinuityAmbiguous(candidates)) return null;
  const names = candidates.slice(0, max).map((c) => c.projectTitle ?? "work outside a project");
  return `You had ${names.length} threads open: ${names.join(", ")}. Which one?`;
}

/** What moved since the anchoring snapshot. Meaningful changes only. */
export function changedSince(
  prev: ContinuitySnapshot | null | undefined,
  next: ContinuityCandidate,
): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const before = new Set(prev.unresolved ?? []);
  const after = new Set(next.unresolved.map((t) => t.label));
  for (const item of after) if (!before.has(item)) out.push(`new: ${item}`);
  for (const item of before) if (!after.has(item)) out.push(`closed: ${item}`);
  const decision = next.decisions[0]?.label ?? null;
  if (decision && decision !== prev.last_decision) out.push(`decided: ${decision}`);
  if (prev.state !== next.state) out.push(`state: ${STATE_LABEL[prev.state] ?? prev.state} → ${STATE_LABEL[next.state]}`);
  for (const r of next.related.slice(0, 2)) out.push(`related: ${r.label}`);
  return out.slice(0, 6);
}

/** Human "last active" label that stays honest across long gaps. */
export function lastActiveLabel(at: string, now: number = Date.now()): string {
  const age = now - new Date(at).getTime();
  if (age < HOUR) return "just now";
  if (age < DAY) return `${Math.max(1, Math.round(age / HOUR))}h ago`;
  const days = Math.round(age / DAY);
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? "about a month ago" : `about ${months} months ago`;
}

// ---------------------------------------------------------------------------
// Snapshots: incremental, reusing projects.metadata. No new tables.
// ---------------------------------------------------------------------------

export function toContinuitySnapshot(
  c: ContinuityCandidate,
  scopeKey: string,
  now: number = Date.now(),
): ContinuitySnapshot {
  return {
    scope_key: scopeKey,
    summary: c.summary,
    state: c.state,
    unresolved: c.unresolved.map((t) => t.label),
    last_decision: c.decisions[0]?.label ?? null,
    last_activity_at: c.lastActivityAt,
    anchor_at: c.anchorAt,
    anchor_confidence: c.anchorConfidence,
    sources: Array.from(new Set(c.sources.map((s) => s.kind))),
    refreshed_at: new Date(now).toISOString(),
    pinned: c.pinned,
  };
}

export function readContinuitySnapshot(metadata: unknown, scopeKey?: string): ContinuitySnapshot | null {
  if (!metadata || typeof metadata !== "object") return null;
  const snap = (metadata as Record<string, unknown>).continuity;
  if (!snap || typeof snap !== "object") return null;
  const typed = snap as ContinuitySnapshot;
  // A snapshot written in another scope is never readable here.
  if (scopeKey && typed.scope_key && typed.scope_key !== scopeKey) return null;
  return typed;
}

export function mergeContinuitySnapshot(
  metadata: unknown,
  patch: Partial<ContinuitySnapshot>,
  scopeKey: string,
): Record<string, unknown> {
  const base = (metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {}) as Record<
    string,
    unknown
  >;
  const prev = readContinuitySnapshot(metadata, scopeKey) ?? {};
  base.continuity = { ...prev, ...patch, scope_key: scopeKey };
  return base;
}

/**
 * Incremental refresh gate: only rewrite a snapshot when a meaningful record
 * landed after the last refresh, or when the derived state actually moved.
 * Trivial metadata churn must not trigger summarization.
 */
export function shouldRefreshSnapshot(
  prev: ContinuitySnapshot | null | undefined,
  next: ContinuityCandidate,
): boolean {
  if (!prev) return true;
  if (prev.state !== next.state) return true;
  if ((prev.last_decision ?? null) !== (next.decisions[0]?.label ?? null)) return true;
  const before = (prev.unresolved ?? []).join("|");
  const after = next.unresolved.map((t) => t.label).join("|");
  if (before !== after) return true;
  return new Date(next.lastActivityAt).getTime() > new Date(prev.refreshed_at).getTime();
}

/** Scope always rides in the cache key. */
export function continuityKey(scopeKey: string, projectId: string | null): string {
  return `${scopeKey}:continuity:${projectId ?? "loose"}`;
}

/**
 * Cross-project continuity, grounded only. A relationship exists when two
 * projects genuinely share a record; similar names prove nothing.
 */
export function groundedRelations(
  links: { projectId: string; otherProjectId: string; otherTitle: string | null; via: string; at: string }[],
  changedProjects: Set<string>,
): Record<string, RelatedProjectNote[]> {
  const out: Record<string, RelatedProjectNote[]> = {};
  for (const l of links) {
    if (!changedProjects.has(l.otherProjectId)) continue;
    const list = out[l.projectId] ?? [];
    if (list.some((n) => n.projectId === l.otherProjectId)) continue;
    list.push({
      projectId: l.otherProjectId,
      projectTitle: l.otherTitle,
      via: l.via,
      label: `${l.otherTitle ?? "a related project"} moved on a record this project shares`,
    });
    out[l.projectId] = list.slice(0, 3);
  }
  return out;
}

/**
 * A grounded name for a re-entry card.
 *
 * A project title always wins. Without one, name the work after the strongest
 * record actually behind it rather than the generic "Work outside a project" —
 * inference only, never invention: if there is no record to name, we say so
 * plainly.
 */
export function continuityName(c: ContinuityCandidate): string {
  if (c.projectTitle) return c.projectTitle;
  const thread = c.unresolved[0];
  if (thread?.label) return thread.label;
  const decision = c.decisions[0];
  if (decision?.label) return decision.label;
  return "Not filed under a project yet";
}

/** "Bring me back up to speed" — ordered: state, changes, decision, open, next. */
export function catchUpSummary(
  c: ContinuityCandidate,
  changes: string[] = [],
): { headline: string; lines: string[] } {
  const where = continuityName(c);
  const lines: string[] = [];
  lines.push(`Where it stands: ${STATE_LABEL[c.state].toLowerCase()}, last activity ${lastActiveLabel(c.lastActivityAt)}.`);
  if (changes.length) lines.push(`What changed: ${changes.join("; ")}.`);
  const decision = c.decisions[0];
  if (decision) {
    lines.push(`Last recorded decision: ${decision.label}${decision.rationale ? ` — ${decision.rationale}` : ""}.`);
  } else {
    lines.push("Last recorded decision: none captured.");
  }
  if (c.unresolved.length) lines.push(`Still open: ${c.unresolved.map((t) => t.label).join("; ")}.`);
  else lines.push("Still open: nothing I can see.");
  const next = c.unresolved[0];
  if (next) lines.push(`Likely next: ${next.overdue ? "clear the overdue item" : "pick up"} — ${next.label}.`);
  return { headline: `${where} — based on your recorded activity`, lines };
}
