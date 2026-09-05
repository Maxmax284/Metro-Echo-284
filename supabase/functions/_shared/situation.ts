// situation — one read of where you are standing, across every source.
//
// Doctrine:
//   - one situation, not a list of sources reporting in turn.
//   - at most three things. Silence is a valid output.
//   - every line names its source, its freshness, and why it is here.
//   - authoritative state only. Nothing is inferred from a past conversation.
//   - a source with no data says so; it never contributes a zero.
//
// Pure module: callers fetch rows, this ranks and words them.

import { unusual, worthSurfacing, type BaselineRead, type Cadence } from "./baseline.ts";

export type SituationSource =
  | "commitments"
  | "actions"
  | "inbox"
  | "sherlock"
  | "calendar"
  | "telegram"
  | "projects"
  | "body";

export const SOURCE_LABEL: Record<SituationSource, string> = {
  commitments: "Commitments",
  actions: "Actions",
  inbox: "Inbox",
  sherlock: "What Vanta noticed",
  calendar: "Calendar",
  telegram: "Telegram",
  projects: "Projects",
  body: "Body",
};

export type SituationKind =
  | "overdue"
  | "due_soon"
  | "waiting_on_you"
  | "arrived"
  | "noticed"
  | "meeting_soon"
  | "went_unusually_quiet";

/** Ranked by consequence, not by recency. Lower number wins. */
const KIND_WEIGHT: Record<SituationKind, number> = {
  overdue: 1,
  waiting_on_you: 2,
  meeting_soon: 3,
  due_soon: 4,
  noticed: 5,
  went_unusually_quiet: 6,
  arrived: 7,
};

export type SituationLine = {
  kind: SituationKind;
  source: SituationSource;
  /** The one sentence a person reads. Plain English, no IDs. */
  text: string;
  /** Why this line is here at all. */
  reason: string;
  /** ISO time of the newest fact behind the line, for the freshness strip. */
  at: string | null;
  /** What it points at, so tapping lands on the same object. */
  entity?: { type: string; id: string } | null;
  /** Present only when a baseline actually informed the line. */
  baseline?: BaselineRead | null;
  weight: number;
};

export type SituationRead = {
  /** At most three, already ranked. */
  lines: SituationLine[];
  /** One opening sentence. Never a count of nothing. */
  headline: string;
  /** Sources that had nothing to say, named once rather than shown as zeros. */
  quietSources: SituationSource[];
  /** Sources that could not be read at all — missing, never zero. */
  unknownSources: SituationSource[];
};

export type SituationInput = {
  now?: number;
  overdue: Array<{ id: string; summary: string; due_at: string | null }>;
  dueSoon: Array<{ id: string; summary: string; due_at: string | null }>;
  waitingOnYou: Array<{ id: string; title: string; updated_at: string }>;
  arrived: Array<{ id: string; label: string; at: string; via?: string | null }>;
  noticed: Array<{ id: string; title: string; reason: string; at: string }> ;
  meetings: Array<{ id: string; title: string; starts_at: string }>;
  /** Projects with their stored cadence, for the "different from usual" read. */
  projects: Array<{ id: string; title: string; lastEventAt: string | null; cadence: Cadence | null }>;
  /** Sources the caller could not read (offline, off, not set up). */
  unknownSources?: SituationSource[];
};

const HOUR = 60 * 60 * 1000;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function hoursUntil(iso: string, now: number): number {
  return (new Date(iso).getTime() - now) / HOUR;
}

/**
 * Build the one read. Every branch either produces a line with a source and a
 * reason, or produces nothing at all.
 */
export function readSituation(input: SituationInput): SituationRead {
  const now = input.now ?? Date.now();
  const lines: SituationLine[] = [];
  const push = (l: Omit<SituationLine, "weight">) => lines.push({ ...l, weight: KIND_WEIGHT[l.kind] });

  if (input.overdue.length > 0) {
    const first = input.overdue[0];
    const rest = input.overdue.length - 1;
    push({
      kind: "overdue",
      source: "commitments",
      text: rest > 0 ? `${first.summary} is past due, and ${rest} ${plural(rest, "other is", "others are")} too.` : `${first.summary} is past due.`,
      reason: "The due time passed and it is still open.",
      at: first.due_at,
      entity: { type: "commitment", id: first.id },
    });
  }

  if (input.waitingOnYou.length > 0) {
    const n = input.waitingOnYou.length;
    const first = input.waitingOnYou[0];
    push({
      kind: "waiting_on_you",
      source: "actions",
      text: n === 1 ? `${first.title} is drafted and waiting for you.` : `${n} drafts are waiting for you, starting with ${first.title}.`,
      reason: "Vanta prepared these. Nothing runs until you approve.",
      at: first.updated_at,
      entity: { type: "action", id: first.id },
    });
  }

  const soonMeeting = input.meetings.find((m) => {
    const h = hoursUntil(m.starts_at, now);
    return h >= -0.25 && h <= 3;
  });
  if (soonMeeting) {
    const h = hoursUntil(soonMeeting.starts_at, now);
    push({
      kind: "meeting_soon",
      source: "calendar",
      text: h <= 0 ? `${soonMeeting.title} is starting now.` : `${soonMeeting.title} starts in ${Math.max(1, Math.round(h * 60))} minutes.`,
      reason: "It came from a calendar you connected.",
      at: soonMeeting.starts_at,
      entity: { type: "calendar_event", id: soonMeeting.id },
    });
  }

  if (input.dueSoon.length > 0 && input.overdue.length === 0) {
    const first = input.dueSoon[0];
    const rest = input.dueSoon.length - 1;
    push({
      kind: "due_soon",
      source: "commitments",
      text: rest > 0 ? `${first.summary} is due next, with ${rest} more behind it.` : `${first.summary} is due next.`,
      reason: "It is the nearest thing you promised.",
      at: first.due_at,
      entity: { type: "commitment", id: first.id },
    });
  }

  if (input.noticed.length > 0) {
    const first = input.noticed[0];
    push({
      kind: "noticed",
      source: "sherlock",
      text: first.title,
      reason: first.reason,
      at: first.at,
      entity: { type: "finding", id: first.id },
    });
  }

  /* Baselines only speak when the silence is genuinely outside ordinary. */
  const quietProject = input.projects
    .map((p) => ({ p, read: unusual(p.cadence, p.lastEventAt, now) }))
    .filter((x) => worthSurfacing(x.read))
    .sort((a, b) => (b.read.observedGapDays ?? 0) - (a.read.observedGapDays ?? 0))[0];
  if (quietProject) {
    push({
      kind: "went_unusually_quiet",
      source: "projects",
      text: `${quietProject.p.title} has gone quiet.`,
      reason: quietProject.read.line,
      at: quietProject.p.lastEventAt,
      entity: { type: "project", id: quietProject.p.id },
      baseline: quietProject.read,
    });
  }

  if (input.arrived.length > 0) {
    const n = input.arrived.length;
    const first = input.arrived[0];
    const via = first.via ? ` from ${first.via}` : "";
    push({
      kind: "arrived",
      source: "inbox",
      text: n === 1 ? `${first.label} arrived${via} and is not filed yet.` : `${n} things arrived${via} and are not filed yet.`,
      reason: "Captures wait in Inbox until you file them. Nothing was acted on.",
      at: first.at,
      entity: { type: "capture", id: first.id },
    });
  }

  lines.sort((a, b) => a.weight - b.weight);
  const top = lines.slice(0, 3);

  const quietSources: SituationSource[] = [];
  const unknown = input.unknownSources ?? [];
  const had = new Set(top.map((l) => l.source));
  const candidates: Array<[SituationSource, boolean]> = [
    ["commitments", input.overdue.length + input.dueSoon.length > 0],
    ["actions", input.waitingOnYou.length > 0],
    ["inbox", input.arrived.length > 0],
    ["sherlock", input.noticed.length > 0],
    ["calendar", input.meetings.length > 0],
  ];
  for (const [src, hasAny] of candidates) {
    if (unknown.includes(src)) continue;
    if (!hasAny && !had.has(src)) quietSources.push(src);
  }

  return { lines: top, headline: headlineFor(top), quietSources, unknownSources: unknown };
}

/** One opening sentence, chosen by the strongest line. Never a count of nothing. */
export function headlineFor(lines: SituationLine[]): string {
  if (lines.length === 0) return "Nothing needs you right now.";
  switch (lines[0].kind) {
    case "overdue":
      return "Something you promised is late.";
    case "waiting_on_you":
      return "Work is drafted and waiting on your call.";
    case "meeting_soon":
      return "You're due somewhere shortly.";
    case "due_soon":
      return "Here's what's next.";
    case "noticed":
      return "Vanta noticed something worth a look.";
    case "went_unusually_quiet":
      return "One thread has gone quieter than usual.";
    case "arrived":
      return "New things landed and are still unfiled.";
  }
}

/** "Nothing waiting in Commitments or Inbox." — named once, never as zeros. */
export function quietLine(sources: SituationSource[]): string | null {
  if (sources.length === 0) return null;
  const names = sources.map((s) => SOURCE_LABEL[s]);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `Nothing waiting in ${list}.`;
}

/** "Vanta can't see Calendar right now." — missing stays missing. */
export function unknownLine(sources: SituationSource[]): string | null {
  if (sources.length === 0) return null;
  const names = sources.map((s) => SOURCE_LABEL[s]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `No reading from ${list} — so this read leaves ${names.length === 1 ? "it" : "them"} out.`;
}
