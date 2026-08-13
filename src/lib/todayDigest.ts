// todayDigest — the attention model behind Today.
//
// Pure functions only, so ordering, grouping and the quiet-state wording can be
// tested without rendering or hitting the database. The hook in
// hooks/useTodayDigest.ts does the scoped reads and calls into here.

export type DigestCommitment = { id: string; summary: string; due_at: string | null; priority: string | null };
export type DigestAction = { id: string; title: string; risk: string; status: string; updated_at: string };
export type DigestEvent = { id: string; event: string; entity_type: string; created_at: string };

export type AttentionLevel = "critical" | "attention" | "upcoming";

export type AttentionItem = {
  key: string;
  kind: "commitment" | "action";
  id: string;
  label: string;
  meta?: string;
  level: AttentionLevel;
  /** Surface that owns the review → approve → execute → receipt path. */
  destination: "commitments" | "actions";
};

export type AttentionGroup = { project: string | null; count: number; items: AttentionItem[] };

const LEVEL_RANK: Record<AttentionLevel, number> = { critical: 0, attention: 1, upcoming: 2 };

/** Overdue promises and high-risk approvals are critical; everything else waits. */
export function buildAttention(
  commitments: DigestCommitment[],
  actions: DigestAction[],
  now: number = Date.now(),
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const c of commitments) {
    if (!c.due_at) continue;
    const due = new Date(c.due_at).getTime();
    if (due >= now) continue;
    items.push({
      key: `commitment:${c.id}`,
      kind: "commitment",
      id: c.id,
      label: c.summary,
      meta: "past its date",
      level: "critical",
      destination: "commitments",
    });
  }

  for (const a of actions) {
    items.push({
      key: `action:${a.id}`,
      kind: "action",
      id: a.id,
      label: a.title,
      meta: a.risk === "high" ? "needs a careful look" : "waiting on you",
      level: a.risk === "high" ? "critical" : "attention",
      destination: "actions",
    });
  }

  return items.sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level]);
}

/**
 * Group attention items by the project that owns them so Today shows
 * "CampStay has 3 items needing attention" instead of ten separate rows.
 * Items with no project land in a single unassigned group (project: null).
 */
export function groupAttention(
  items: AttentionItem[],
  projectOf: Record<string, string | undefined>,
): AttentionGroup[] {
  const byProject = new Map<string | null, AttentionItem[]>();
  for (const it of items) {
    const project = projectOf[it.id] ?? null;
    const list = byProject.get(project) ?? [];
    list.push(it);
    byProject.set(project, list);
  }
  return [...byProject.entries()]
    .map(([project, list]) => ({ project, count: list.length, items: list }))
    .sort((a, b) => {
      // Unassigned last, otherwise biggest pile first.
      if (a.project === null) return 1;
      if (b.project === null) return -1;
      return b.count - a.count;
    });
}

export type SecurityTone = "good" | "attention" | "critical";

/** One line about security, derived from real Fenrir audit events only. */
export function securityLine(events: DigestEvent[]): { tone: SecurityTone; line: string; count: number } {
  const security = events.filter((e) => e.event.startsWith("fenrir."));
  if (security.length === 0) {
    return { tone: "good", line: "Security looks good. Nothing unusual came in.", count: 0 };
  }
  const critical = security.filter((e) => /breach|denied|locked|critical/i.test(e.event));
  if (critical.length > 0) {
    return {
      tone: "critical",
      line: `Fenrir needs your attention — ${critical.length} ${critical.length === 1 ? "event" : "events"} to read.`,
      count: security.length,
    };
  }
  return {
    tone: "attention",
    line:
      security.length === 1
        ? "Fenrir logged one unusual event. No action required."
        : `Fenrir logged ${security.length} events. No action required.`,
    count: security.length,
  };
}

/** The calm line shown when nothing is waiting. Facts only, no filler. */
export function quietSummary(input: {
  commitmentsToday: number;
  nextLabel?: string | null;
  nextWhen?: string | null;
  securityTone: SecurityTone;
}): string {
  const parts: string[] = ["You're clear right now."];
  parts.push(
    input.commitmentsToday === 0
      ? "Nothing promised for today."
      : `${input.commitmentsToday} ${input.commitmentsToday === 1 ? "promise" : "promises"} for today.`,
  );
  if (input.securityTone === "good") parts.push("Security looks good.");
  if (input.nextLabel) {
    parts.push(`Next up${input.nextWhen ? ` ${input.nextWhen}` : ""}: ${input.nextLabel}.`);
  }
  return parts.join(" ");
}
