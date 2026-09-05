// messageLane — which arrivals deserve a person's attention, and why not.
//
// Doctrine:
//   - recent is not relevant. Today is not a second Telegram inbox.
//   - something surfaces only when it is unfiled, time-sensitive, or tied to
//     something already active.
//   - everything held back keeps a reason that can be tested: duplicate,
//     acknowledged, stale, below the bar, quiet hours, or the attention
//     budget was already spent.
//
// Pure module: no IO, no React.

import { whyFor, type WhySurfaced } from "./whySurfaced.ts";

export type ArrivalChannel = "telegram" | "email" | "upload" | "other";

export type Arrival = {
  id: string;
  /** What the person actually sent, already trimmed. */
  text: string;
  /** ISO time it landed. */
  at: string;
  channel: ArrivalChannel;
  /** Who it came from, in plain words. Null when unknown. */
  from?: string | null;
  /** Which chat or mailbox it arrived in. */
  where?: string | null;
  /** Still waiting on a person to say where it belongs. */
  unfiled: boolean;
  /** A person already looked at it. */
  acknowledged?: boolean;
  /** Names an active project, commitment or meeting. */
  tiedTo?: string | null;
  /** Reads like it wants an answer at a particular time. */
  timeSensitive?: boolean;
  /** Attached file name, when the arrival brought one. */
  attachment?: string | null;
  /** How Echo got the words: typed, read off a page, or heard. */
  heardOrRead?: "typed" | "read" | "heard";
};

export type SuppressReason =
  | "duplicate"
  | "acknowledged"
  | "stale"
  | "below_threshold"
  | "quiet_hours"
  | "attention_budget";

export const SUPPRESS_EXPLANATION: Record<SuppressReason, string> = {
  duplicate: "The same thing already arrived, so this copy stays out of the way.",
  acknowledged: "You have already seen this one.",
  stale: "It has sat here long enough that raising it now would be noise.",
  below_threshold: "Nothing about it asks for you — it is filed and quiet.",
  quiet_hours: "It landed inside your quiet hours and nothing about it is urgent.",
  attention_budget: "Enough is already asking for you right now.",
};

export type LaneItem = {
  arrival: Arrival;
  surface: boolean;
  /** Why it surfaced, in plain words. Empty when suppressed. */
  reason: string;
  suppressed: SuppressReason | null;
  why: WhySurfaced | null;
};

export type LaneOptions = {
  now?: number;
  /** How many arrivals may ask for attention at once. */
  budget?: number;
  /** True when the person asked not to be interrupted right now. */
  quietHours?: boolean;
};

const DAY = 24 * 60 * 60 * 1000;
const STALE_MS = 7 * DAY;

function normal(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function channelName(c: ArrivalChannel): string {
  if (c === "telegram") return "Telegram";
  if (c === "email") return "Email";
  if (c === "upload") return "An upload";
  return "A channel";
}

function heardOrReadPhrase(a: Arrival): string | null {
  if (a.heardOrRead === "heard") return "Echo heard this one — it came in as a voice note.";
  if (a.heardOrRead === "read") return "Echo read this off the file that came with it.";
  return null;
}

/** The reveal for one arrival. Recorded facts only. */
export function arrivalWhy(item: { arrival: Arrival; reason: string }): WhySurfaced {
  const a = item.arrival;
  const fromBit = a.from ? ` from ${a.from}` : "";
  const whereBit = a.where ? ` in ${a.where}` : "";
  return whyFor({
    source: `${channelName(a.channel)}${fromBit}${whereBit}`,
    whatChanged: a.attachment
      ? `${a.attachment} arrived and nothing has been done with it yet.`
      : "A message arrived and nothing has been done with it yet.",
    comparedWith: null,
    reason: [item.reason, heardOrReadPhrase(a)].filter(Boolean).join(" "),
    at: a.at,
    whyItMatters: a.tiedTo
      ? `It names ${a.tiedTo}, which is live right now.`
      : "Nothing files it but you, so it sits here until you say where it goes.",
    ifIgnored: a.unfiled ? "It stays unfiled and stops being findable later." : null,
  });
}

/**
 * Rank and filter arrivals. Order is: time-sensitive first, then tied to
 * something active, then plain unfiled — newest inside each band.
 */
export function readMessageLane(arrivals: Arrival[], opts: LaneOptions = {}): LaneItem[] {
  const now = opts.now ?? Date.now();
  const budget = opts.budget ?? 3;

  const seen = new Set<string>();
  const scored = arrivals.map((arrival) => {
    const key = `${arrival.channel}:${normal(arrival.text)}`;
    const dup = arrival.text.trim().length > 0 && seen.has(key);
    if (!dup) seen.add(key);
    const age = now - new Date(arrival.at).getTime();

    let suppressed: SuppressReason | null = null;
    let reason = "";

    if (dup) suppressed = "duplicate";
    else if (arrival.acknowledged) suppressed = "acknowledged";
    else if (Number.isFinite(age) && age > STALE_MS && !arrival.timeSensitive) suppressed = "stale";
    else if (arrival.timeSensitive) reason = "It reads like it wants an answer at a particular time.";
    else if (arrival.tiedTo) reason = `It names ${arrival.tiedTo}, which is active.`;
    else if (arrival.unfiled) reason = "It arrived and has not been filed anywhere yet.";
    else suppressed = "below_threshold";

    if (!suppressed && opts.quietHours && !arrival.timeSensitive) suppressed = "quiet_hours";

    const band = arrival.timeSensitive ? 0 : arrival.tiedTo ? 1 : 2;
    return { arrival, suppressed, reason, band, at: arrival.at };
  });

  scored.sort((a, b) => (a.band - b.band) || b.at.localeCompare(a.at));

  let spent = 0;
  return scored.map((s) => {
    let suppressed = s.suppressed;
    if (!suppressed) {
      if (spent >= budget) suppressed = "attention_budget";
      else spent += 1;
    }
    const surface = !suppressed;
    return {
      arrival: s.arrival,
      surface,
      reason: surface ? s.reason : "",
      suppressed,
      why: surface ? arrivalWhy({ arrival: s.arrival, reason: s.reason }) : null,
    };
  });
}

/** Just the ones worth showing. */
export function surfacedArrivals(items: LaneItem[]): LaneItem[] {
  return items.filter((i) => i.surface);
}

/**
 * One honest line about what was held back, or null when nothing was. Plain
 * words, never a count of internal reasons.
 */
export function heldBackLine(items: LaneItem[]): string | null {
  const held = items.filter((i) => !i.surface);
  if (held.length === 0) return null;
  const noun = held.length === 1 ? "one other arrival" : `${held.length} other arrivals`;
  return `${noun} landed and none of them needs you — they are in your Inbox.`;
}

/* ------------------------------------------------------------------------- *
 * Capture or conversation?
 *
 * A question asked in chat is not a thing to file. Marking it "needs review"
 * turns Today into a second inbox, so the test lives here and both the
 * webhook and the surfaces use it.
 * ------------------------------------------------------------------------- */

const QUESTION_OPENERS =
  /^(who|what|what's|whats|how|how's|why|when|where|which|is|are|am|do|does|did|can|could|would|will|should|shall|may|might|have|has|tell me|explain|any|anything|anyone)\b/i;

const CHATTER =
  /^(hi|hey|hello|yo|sup|thanks|thank you|ta|cheers|ok|okay|k|cool|nice|great|lol|haha|got it|gotcha|morning|good morning|good night|night|bye|yes|no|yep|nope|sure|right)\b[\s!.,?]*$/i;

/**
 * True when a message is something Echo should hold for filing. Questions,
 * greetings and one-word replies are conversation, not capture.
 */
export function looksLikeCapture(text: string | null | undefined): boolean {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (t.startsWith("/")) return false;
  if (CHATTER.test(t)) return false;
  if (t.length < 12) return false;
  if (t.endsWith("?")) return false;
  if (QUESTION_OPENERS.test(t)) return false;
  return true;
}
