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

export type TodayTone = "calm" | "attention" | "urgent";

/**
 * The headline for Today. It is the largest text on the page, so it is only
 * ever a count of real things: attention items first, then recorded changes.
 * Nothing here is generated when there is nothing to say.
 */
export function todayHeadline(input: {
  attention: { level: AttentionLevel }[];
  changedCount?: number;
}): { tone: TodayTone; headline: string } {
  const n = input.attention.length;
  if (n === 0) {
    const changed = input.changedCount ?? 0;
    if (changed > 0) {
      return {
        tone: "calm",
        headline: changed === 1 ? "One thing moved since yesterday" : `${changed} things moved since yesterday`,
      };
    }
    return { tone: "calm", headline: "Quiet right now" };
  }
  const critical = input.attention.some((a) => a.level === "critical");
  return {
    tone: critical ? "urgent" : "attention",
    headline: n === 1 ? "One thing needs you" : `${n} things need you`,
  };
}


/**
 * The state-of-day line — one grounded sentence under the headline.
 *
 * It answers "what is the pressure right now, and where is it coming from",
 * using only counts of real records. It never advises, never speculates and
 * never pads. When there is genuinely nothing, it says so in one clause.
 */
export function stateOfDay(input: {
  overdue: number;
  waitingOnYou: number;
  dueToday: number;
  meetingsToday?: number;
  changed?: number;
  captures?: number;
  noticed?: boolean;
}): string {
  const clauses: string[] = [];

  if (input.overdue > 0) {
    clauses.push(
      input.overdue === 1
        ? "One promise is past its date"
        : `${input.overdue} promises are past their date`,
    );
  }
  if (input.waitingOnYou > 0) {
    clauses.push(
      input.waitingOnYou === 1
        ? "one thing is waiting on your approval"
        : `${input.waitingOnYou} things are waiting on your approval`,
    );
  }
  if (input.dueToday > 0) {
    clauses.push(
      input.dueToday === 1 ? "one promise lands today" : `${input.dueToday} promises land today`,
    );
  }
  if ((input.meetingsToday ?? 0) > 0) {
    const m = input.meetingsToday!;
    clauses.push(m === 1 ? "one meeting on the calendar" : `${m} meetings on the calendar`);
  }

  if (clauses.length === 0) {
    const quiet: string[] = ["Nothing is pressing"];
    if ((input.captures ?? 0) > 0) {
      const c = input.captures!;
      quiet.push(c === 1 ? "one new capture came in" : `${c} new captures came in`);
    } else if ((input.changed ?? 0) > 0) {
      const c = input.changed!;
      quiet.push(c === 1 ? "one thing moved in the last day" : `${c} things moved in the last day`);
    }
    let line = `${sentenceJoin(quiet)}.`;
    if (input.noticed) line += " Echo noticed something worth a look.";
    return line;
  }

  let line = `${sentenceJoin(clauses)}.`;
  if (input.noticed) line += " Echo also noticed something worth a look.";
  return line;
}

/** "a", "a and b", "a, b and c" — plain English, no Oxford comma. */
function sentenceJoin(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
