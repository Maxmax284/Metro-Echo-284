// drift — pure proactive-awareness detectors.
//
// Doctrine: detectors observe, they never write, never call AI, never execute.
// Each one returns at most one candidate signal. The caller ranks candidates
// and persists ONE per pulse as a draft nudge.

export type DriftProject = {
  id: string;
  title: string;
  status?: string | null;
  updated_at: string;
  /** Count of open commitments / staged actions attached to the project. */
  open_items: number;
};

export type DriftCommitment = {
  id: string;
  summary: string;
  due_at: string | null;
  status: string;
  /** Number of times the due date has been moved, if tracked in metadata. */
  reschedules?: number;
  /** Last time anything happened against this commitment. */
  last_activity_at?: string | null;
};

export type DriftRisk = {
  id: string;
  title: string;
  /** "action" (high-risk staged) or "document" (flagged risk). */
  source: "action" | "document";
  created_at: string;
  seen: boolean;
};

export type DriftSignal = {
  kind: "project_went_silent" | "commitment_drifting" | "risk_unread";
  title: string;
  /** Plain English: why Echo is mentioning this at all. */
  reason: string;
  /** Plain English: the one thing worth doing next. */
  next_step: string;
  related_entity_type: "project" | "commitment" | "action" | "document";
  related_entity_id: string;
  priority: number;
  dedupe_key: string;
};

const DAY = 24 * 60 * 60 * 1000;

const daysAgo = (iso: string | null | undefined, now: number): number => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((now - t) / DAY));
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * A project with unresolved work that has gone quiet. Silence only counts when
 * something is still open — a finished project going quiet is just finished.
 */
export function detectSilentProject(
  projects: DriftProject[],
  now: number,
  silentDays = 10,
): DriftSignal | null {
  const candidates = projects
    .filter((p) => (p.status ?? "active") === "active")
    .filter((p) => p.open_items > 0)
    .map((p) => ({ p, quiet: daysAgo(p.updated_at, now) }))
    .filter((c) => Number.isFinite(c.quiet) && c.quiet >= silentDays)
    .sort((a, b) => b.quiet - a.quiet || b.p.open_items - a.p.open_items);

  const top = candidates[0];
  if (!top) return null;
  return {
    kind: "project_went_silent",
    title: `${top.p.title} has gone quiet`,
    reason: `No activity for ${top.quiet} days, with ${top.p.open_items} ${plural(top.p.open_items, "item", "items")} still open.`,
    next_step: "Open the project and decide: pick it back up, or close it out.",
    related_entity_type: "project",
    related_entity_id: top.p.id,
    priority: 55,
    dedupe_key: `drift_silent:${top.p.id}`,
  };
}

/**
 * A commitment that is sliding: either its due date keeps moving, or it is
 * inside 48 hours with nothing happening against it.
 */
export function detectDriftingCommitment(
  commitments: DriftCommitment[],
  now: number,
): DriftSignal | null {
  const open = commitments.filter((c) => c.status === "open" && c.due_at);

  const rescheduled = open
    .filter((c) => (c.reschedules ?? 0) >= 2)
    .sort((a, b) => (b.reschedules ?? 0) - (a.reschedules ?? 0));

  if (rescheduled[0]) {
    const c = rescheduled[0];
    return {
      kind: "commitment_drifting",
      title: "A promise keeps moving",
      reason: `"${c.summary}" has been pushed ${c.reschedules} times.`,
      next_step: "Either commit to a date you'll keep, or let it go on the record as dropped.",
      related_entity_type: "commitment",
      related_entity_id: c.id,
      priority: 65,
      dedupe_key: `drift_reschedule:${c.id}`,
    };
  }

  const soonStalled = open
    .map((c) => ({ c, hours: (new Date(c.due_at as string).getTime() - now) / (60 * 60 * 1000) }))
    .filter(({ c, hours }) => hours > 0 && hours <= 48 && daysAgo(c.last_activity_at, now) >= 3)
    .sort((a, b) => a.hours - b.hours);

  if (soonStalled[0]) {
    const { c, hours } = soonStalled[0];
    return {
      kind: "commitment_drifting",
      title: "Due soon, nothing moving",
      reason: `"${c.summary}" is due in ${Math.max(1, Math.round(hours))}h and hasn't been touched in days.`,
      next_step: "Open it and either make a move or reset the date honestly.",
      related_entity_type: "commitment",
      related_entity_id: c.id,
      priority: 60,
      dedupe_key: `drift_stalled:${c.id}`,
    };
  }

  return null;
}

/** A flagged risk sitting unread. Oldest unseen wins. */
export function detectUnreadRisk(risks: DriftRisk[], now: number, minDays = 2): DriftSignal | null {
  const unseen = risks
    .filter((r) => !r.seen)
    .map((r) => ({ r, age: daysAgo(r.created_at, now) }))
    .filter((x) => Number.isFinite(x.age) && x.age >= minDays)
    .sort((a, b) => b.age - a.age);

  const top = unseen[0];
  if (!top) return null;
  const isAction = top.r.source === "action";
  return {
    kind: "risk_unread",
    title: isAction ? "A high-risk action is waiting" : "A flagged risk hasn't been read",
    reason: `"${top.r.title}" has been sitting for ${top.age} ${plural(top.age, "day", "days")} without review.`,
    next_step: isAction
      ? "Review it in Actions — nothing runs until you approve it."
      : "Open the document review and read the flagged clause.",
    related_entity_type: isAction ? "action" : "document",
    related_entity_id: top.r.id,
    priority: 70,
    dedupe_key: `drift_risk:${top.r.id}`,
  };
}

/** Highest-priority candidate only. One signal at a time is the whole point. */
export function rankDrift(signals: (DriftSignal | null)[]): DriftSignal | null {
  const real = signals.filter((s): s is DriftSignal => Boolean(s));
  if (real.length === 0) return null;
  return real.sort((a, b) => b.priority - a.priority)[0];
}

/** "HH:MM" window check in the user's timezone. Handles windows crossing midnight. */
export function isInQuietHours(tz: string, start = "22:00", end = "07:00", at = new Date()): boolean {
  try {
    const hhmm = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
    const toMin = (s: string) => {
      const [h, m] = s.split(":").map((x) => parseInt(x, 10));
      return (h || 0) * 60 + (m || 0);
    };
    const nowMin = toMin(hhmm);
    const s = toMin(start);
    const e = toMin(end);
    if (s === e) return false;
    return s < e ? nowMin >= s && nowMin < e : nowMin >= s || nowMin < e;
  } catch {
    return false;
  }
}

/** Scope segment so the same drift in two workspaces stays two distinct nudges. */
export function scopedDedupeKey(key: string, organizationId: string | null, dayKey: string): string {
  return `${key}:${organizationId ?? "personal"}:${dayKey}`;
}

/**
 * Situation identity, scope-segmented but NOT day-segmented. A situation that
 * is still true tomorrow is the same situation, not a new one — day-keying it
 * makes the same nudge pile up once per calendar day, which reads as spam.
 */
export function situationDedupeKey(key: string, organizationId: string | null): string {
  return `${key}:${organizationId ?? "personal"}`;
}

/**
 * A situation may be re-proposed only when nothing is pending for it and any
 * earlier dismissal has cooled off. Pure so the rule is testable.
 */
export function mayRepropose(
  prior: { status: string; created_at: string } | undefined | null,
  nowMs: number,
  cooldownDays = 7,
): boolean {
  if (!prior) return true;
  if (prior.status === "pending") return false;
  if (prior.status === "acted") return false;
  const age = nowMs - new Date(prior.created_at).getTime();
  return Number.isFinite(age) && age >= cooldownDays * 86_400_000;
}


/**
 * Every room a scheduled sweep should look at for one user: Personal first,
 * then each active workspace membership, de-duplicated. Personal is always
 * present so a user with no workspaces still gets swept.
 */
export function driftScopeTargets(
  organizationIds: (string | null | undefined)[],
): { organizationId: string | null }[] {
  const seen = new Set<string>();
  const targets: { organizationId: string | null }[] = [{ organizationId: null }];
  for (const id of organizationIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    targets.push({ organizationId: id });
  }
  return targets;
}

