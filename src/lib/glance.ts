// glance — the stricter wrist threshold, and the only actions a wrist may take.
//
// Smaller surface, stronger filtering. Today can carry a shelf of things; the wrist
// carries zero or one. Every decision states its reason so "why did you stay quiet?"
// has a real answer in Receipts.
//
// Pure module: no IO, no React, no clock beyond what the caller passes in.
import { postureHoldsNoise, type Posture } from "@/lib/awareness";
import { URGENCY_RANK, type Urgency } from "@/lib/deviceCompression";

export interface GlanceItem {
  id: string;
  kind: string;
  title: string;
  detail?: string | null;
  urgency: Urgency;
  createdAt: string;
  /** Set once the person has said "Noted". */
  acknowledgedAt?: string | null;
  /** Last time this exact item was put in front of them. */
  lastSurfacedAt?: string | null;
  /** What it points at, so "Open on phone" lands on the same object. */
  entity?: { type: string | null; id: string | null } | null;
  /** Where the phone should open. */
  href?: string | null;
}

export interface GlanceInput {
  items: GlanceItem[];
  posture?: Posture | null;
  quietHours?: boolean;
  /** False when the attention budget for this stretch is spent. */
  budgetLeft?: boolean;
  now?: Date;
  /** Repeat window. Nothing shows twice inside this. */
  repeatWindowMs?: number;
}

export interface GlanceDecision {
  card: GlanceItem | null;
  /** Plain-English reason, shown in the proof line and written to Receipts. */
  reason: string;
  /** Items that were real but did not deserve the wrist. They stay in Today. */
  held: number;
}

export const SILENCE_LINE = "Nothing needs you.";

const REPEAT_WINDOW_MS = 20 * 60 * 1000;

function passes(item: GlanceItem, input: GlanceInput, now: Date): { ok: boolean; why: string } {
  const rank = URGENCY_RANK[item.urgency];

  if (item.acknowledgedAt) return { ok: false, why: "already noted" };

  const window = input.repeatWindowMs ?? REPEAT_WINDOW_MS;
  if (item.lastSurfacedAt) {
    const since = now.getTime() - new Date(item.lastSurfacedAt).getTime();
    if (since >= 0 && since < window) return { ok: false, why: "shown a moment ago" };
  }

  // Informational items never reach a wrist. They live in Today.
  if (rank < URGENCY_RANK.attention) return { ok: false, why: "for info only" };

  if (item.urgency === "critical") return { ok: true, why: "critical" };

  if (input.quietHours) return { ok: false, why: "quiet hours" };
  if (input.budgetLeft === false) return { ok: false, why: "you've had enough interruptions" };

  if (postureHoldsNoise(input.posture ?? undefined) && rank < URGENCY_RANK.time_sensitive) {
    return { ok: false, why: "your posture holds ordinary notices" };
  }

  return { ok: true, why: item.urgency === "time_sensitive" ? "waiting on you" : "something changed" };
}

/** Zero or one card. Silence is a successful answer. */
export function pickGlance(input: GlanceInput): GlanceDecision {
  const now = input.now ?? new Date();
  const eligible: { item: GlanceItem; why: string }[] = [];
  let held = 0;

  for (const item of input.items) {
    const verdict = passes(item, input, now);
    if (verdict.ok) eligible.push({ item, why: verdict.why });
    else held += 1;
  }

  if (!eligible.length) {
    return { card: null, reason: SILENCE_LINE, held };
  }

  eligible.sort((a, b) => {
    const byUrgency = URGENCY_RANK[b.item.urgency] - URGENCY_RANK[a.item.urgency];
    if (byUrgency !== 0) return byUrgency;
    return new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime();
  });

  const [top] = eligible;
  return { card: top.item, reason: top.why, held: held + eligible.length - 1 };
}

/* ---------------------------------------------------------------- actions */

export const WRIST_ACTIONS = ["noted", "later", "done", "open_phone"] as const;
export type WristAction = (typeof WRIST_ACTIONS)[number];

export const WRIST_ACTION_COPY: Record<WristAction, { label: string; means: string }> = {
  noted: { label: "Noted", means: "Acknowledged. Nothing was done to it." },
  later: { label: "Remind later", means: "Still open. It comes back." },
  done: { label: "Mark done", means: "Closes the promise. Not an approval." },
  open_phone: { label: "Open on phone", means: "Same object, same scope, full context." },
};

/** Anything consequential is approval-shaped and never belongs on a wrist. */
export function isWristSafe(action: string): action is WristAction {
  return (WRIST_ACTIONS as readonly string[]).includes(action);
}

/**
 * Which controls this item gets. "Mark done" only appears where a narrow lifecycle
 * rule already permits closing the object from anywhere — a promise you made.
 */
export function wristActionsFor(item: GlanceItem | null): WristAction[] {
  if (!item) return [];
  const base: WristAction[] = ["noted", "later"];
  const closable =
    item.entity?.type === "commitment" && !!item.entity.id && item.kind.startsWith("commitment_");
  if (closable) base.push("done");
  base.push("open_phone");
  return base;
}

/* ---------------------------------------------------------------- capture */

const PROMISE_HINTS = [
  /\bi'?ll\b/i,
  /\bi will\b/i,
  /\bpromis/i,
  /\bsend (?:him|her|them|nikki|the|it)\b/i,
  /\bremind me\b/i,
  /\bby (?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tonight|friday)\b/i,
  /\bneed to\b/i,
  /\bfollow up\b/i,
];

/** A hint, not a decision. Echo offers review; it never converts silently. */
export function looksLikeCommitment(text: string): boolean {
  const t = (text ?? "").trim();
  if (t.length < 4) return false;
  return PROMISE_HINTS.some((re) => re.test(t));
}

export const COMMITMENT_PROMPT = "This sounds like a commitment. Review on phone?";
