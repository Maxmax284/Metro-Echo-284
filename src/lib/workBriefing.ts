// workBriefing — Work opens with the state of work, not a directory.
//
// Doctrine: this module invents no scores and reads no database. Surfaces hand
// it records they already queried; it decides what belongs in the briefing and
// which single item earns "Start here". Exactly one item is ever promoted.
//
// Order of claim on attention, hardest first:
//   1. something needs a human decision
//   2. something is already overdue
//   3. something arrived and nobody has sorted it
//   4. something is due soon
//   5. something has gone quiet and still matters
//
// Pure functions only. Every line is traceable to a record the caller passed in.

import type { SurfaceId } from "@/lib/navigation";

export type BriefingLane = "needs-you" | "arrived" | "due" | "drifting";

export type BriefingItem = {
  /** Real record id. A briefing row with no record is not allowed. */
  id: string;
  /** Already-human one-liner. */
  label: string;
  /** Where tapping goes. Never executes. */
  surface: SurfaceId;
  /** ISO date the item is due, when the record carries one. */
  dueAt?: string | null;
  /** ISO date of last real activity, for the drifting lane. */
  lastAt?: string | null;
  /** Optional deep link, e.g. /projects/<id>. */
  href?: string | null;
  /** Arrivals only: what kind of record, so filing attaches the right thing. */
  itemType?: "note" | "capture";
  /** Arrivals only: where it probably belongs. Null means "not sure". */
  suggestion?: { projectId: string; title: string } | null;
};

export type BriefingSection = {
  lane: BriefingLane;
  title: string;
  /** One line saying what this lane means. Structure, never state. */
  note: string;
  items: BriefingItem[];
  /** Total in the lane, which can exceed the shown items. */
  total: number;
  surface: SurfaceId;
};

export type StartHere = {
  /** The promoted sentence: "Start here: 1 approval is waiting." */
  line: string;
  lane: BriefingLane;
  surface: SurfaceId;
  href?: string | null;
};

export type BriefingInput = {
  /** Actions and decisions genuinely waiting on the user. */
  needsYou: BriefingItem[];
  /** New captures nobody has routed. */
  arrived: BriefingItem[];
  /** Dated commitments and calendar items, nearest first. */
  due: BriefingItem[];
  /** Projects or responsibilities that have gone quiet and still hold work. */
  drifting: BriefingItem[];
};

export const LANE_TITLE: Record<BriefingLane, string> = {
  "needs-you": "Needs you",
  arrived: "Arrived",
  due: "Due",
  drifting: "Drifting",
};

export const LANE_NOTE: Record<BriefingLane, string> = {
  "needs-you": "Waiting on your decision. Nothing runs until you say so.",
  arrived: "Came in and has not been sorted yet.",
  due: "Promises and meetings with a date on them.",
  drifting: "Quiet for a while, still carrying open work.",
};

const LANE_SURFACE: Record<BriefingLane, SurfaceId> = {
  "needs-you": "actions",
  arrived: "inbox",
  due: "commitments",
  drifting: "projects",
};

/** Max rows per lane on the briefing. Detail lives at the desk, not here. */
export const LANE_LIMIT = 2;

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function isOverdue(item: BriefingItem, now: number): boolean {
  const t = ms(item.dueAt);
  return t !== null && t < now;
}

/** Nearest due date first; undated items sink. */
export function byDueDate(a: BriefingItem, b: BriefingItem): number {
  const x = ms(a.dueAt);
  const y = ms(b.dueAt);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x - y;
}

/** Quietest first — the one that has been ignored longest leads. */
export function byQuietest(a: BriefingItem, b: BriefingItem): number {
  const x = ms(a.lastAt) ?? Number.POSITIVE_INFINITY;
  const y = ms(b.lastAt) ?? Number.POSITIVE_INFINITY;
  return x - y;
}

export function daysQuiet(item: BriefingItem, now: number): number | null {
  const t = ms(item.lastAt);
  if (t === null) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

export function buildSections(input: BriefingInput, now: number = Date.now()): BriefingSection[] {
  const lanes: Array<[BriefingLane, BriefingItem[]]> = [
    ["needs-you", [...input.needsYou]],
    ["arrived", [...input.arrived]],
    ["due", [...input.due].sort(byDueDate)],
    ["drifting", [...input.drifting].sort(byQuietest)],
  ];
  return lanes
    .filter(([, items]) => items.length > 0)
    .map(([lane, items]) => ({
      lane,
      title: LANE_TITLE[lane],
      note: LANE_NOTE[lane],
      items: items.slice(0, LANE_LIMIT),
      total: items.length,
      surface: LANE_SURFACE[lane],
    }));
}

function countLine(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/**
 * Exactly one promoted next tap, with a plain-English reason. Returns null when
 * nothing has a real claim — silence is a valid state and must not be filled.
 */
export function startHere(input: BriefingInput, now: number = Date.now()): StartHere | null {
  const needs = input.needsYou;
  if (needs.length > 0) {
    return {
      line: `Start here: ${countLine(needs.length, "approval is waiting", "approvals are waiting")}.`,
      lane: "needs-you",
      surface: needs.length === 1 ? needs[0].surface : LANE_SURFACE["needs-you"],
      href: needs.length === 1 ? needs[0].href ?? null : null,
    };
  }

  const overdue = input.due.filter((d) => isOverdue(d, now)).sort(byDueDate);
  if (overdue.length > 0) {
    const line =
      overdue.length === 1
        ? `Start here: ${overdue[0].label} is past its date.`
        : `Start here: ${overdue.length} promises are past their date.`;
    return {
      line,
      lane: "due",
      surface: overdue.length === 1 ? overdue[0].surface : LANE_SURFACE.due,
      href: overdue.length === 1 ? overdue[0].href ?? null : null,
    };
  }

  if (input.arrived.length > 0) {
    const n = input.arrived.length;
    return {
      line: `Start here: ${n === 1 ? "1 thing came in" : `${n} things came in`}.`,
      lane: "arrived",
      surface: LANE_SURFACE.arrived,
      href: null,
    };
  }

  const soonest = [...input.due].sort(byDueDate)[0];
  if (soonest && ms(soonest.dueAt) !== null) {
    return {
      line: `Start here: ${soonest.label} is next up.`,
      lane: "due",
      surface: soonest.surface,
      href: soonest.href ?? null,
    };
  }

  const quietest = [...input.drifting].sort(byQuietest)[0];
  if (quietest) {
    const d = daysQuiet(quietest, now);
    return {
      line:
        d && d > 0
          ? `Start here: ${quietest.label} has been quiet for ${d} ${d === 1 ? "day" : "days"}.`
          : `Start here: ${quietest.label} needs a look.`,
      lane: "drifting",
      surface: quietest.surface,
      href: quietest.href ?? null,
    };
  }

  return null;
}

export type WorkBriefing = {
  sections: BriefingSection[];
  start: StartHere | null;
  /** True when there is genuinely nothing to brief on. */
  calm: boolean;
};

export function buildWorkBriefing(input: BriefingInput, now: number = Date.now()): WorkBriefing {
  const sections = buildSections(input, now);
  return { sections, start: startHere(input, now), calm: sections.length === 0 };
}

/** The line shown when Work is genuinely quiet. Honest, not congratulatory. */
export const CALM_LINE = "Nothing is waiting on you. Desks below hold the rest.";
