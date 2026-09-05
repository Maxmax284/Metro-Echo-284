// fieldIntent — the phrases a person uses when they are out in the world.
//
// One recognizer, shared by Ask and Telegram through the capability router. It
// exists so "walk with me" is not a Telegram regex that Ask has never heard of.
//
// Pure: no IO, no model, no database. It classifies words. It cannot start a
// trip, share a location, call anyone, or approve anything — the caller decides
// what a recognized phrase is allowed to do, and the approval law still stands.

export type FieldIntent =
  /** Open a walk session. Deliberate: the person asked. */
  | "walk_start"
  /** Close the open session. */
  | "walk_end"
  /** "I'm here" — mark a point on the open session. */
  | "walk_checkin"
  /** "keep this trip open" — don't let the stale-close reap it yet. */
  | "walk_hold"
  /** "how much longer?" — read the open session back. */
  | "walk_eta"
  /** "is a trip running?" */
  | "trip_status"
  /** Explicit high-stakes language. Echo drops the personality and offers help. */
  | "high_stakes"
  /** Softer worry. Restrained, but not the emergency shape. */
  | "unease";

export type FieldMatch = {
  intent: FieldIntent;
  /** The words that triggered it, for "Why this?" and receipts. */
  matched: string;
  /** Only "high" phrases act; "possible" ones ask first. */
  confidence: "high" | "possible";
};

/* Order matters: high-stakes is checked before anything else, because a person
   saying they don't feel safe must never be parsed as a trip command. */
const RULES: Array<{ intent: FieldIntent; re: RegExp; confidence: FieldMatch["confidence"] }> = [
  // ---- high stakes -------------------------------------------------------
  { intent: "high_stakes", re: /\b(sos|mayday)\b/i, confidence: "high" },
  { intent: "high_stakes", re: /\bi (don'?t|do not) feel safe\b/i, confidence: "high" },
  { intent: "high_stakes", re: /\b(i need help|help me|i'?m in trouble|call (the )?(police|911|999|112))\b/i, confidence: "high" },
  { intent: "high_stakes", re: /\b(being followed|someone'?s following me|i'?m scared|emergency)\b/i, confidence: "high" },

  // ---- unease: worth a calm answer, not an emergency shape ---------------
  { intent: "unease", re: /\bsomething (feels|seems) (off|wrong)\b/i, confidence: "high" },
  { intent: "unease", re: /\bsomething'?s (off|wrong|not right)\b/i, confidence: "high" },
  { intent: "unease", re: /\bi'?m (a bit |kinda |kind of )?(uneasy|nervous|uncomfortable)\b/i, confidence: "possible" },

  // ---- walk session ------------------------------------------------------
  { intent: "walk_start", re: /\bwalk with me\b/i, confidence: "high" },
  { intent: "walk_start", re: /\bi'?m walking (home|back|to)\b/i, confidence: "high" },
  { intent: "walk_start", re: /\b(stay|stick) with me (while|until|on)\b/i, confidence: "high" },
  { intent: "walk_start", re: /\b(start|begin) (the |a )?(walk|trip|ride|journey)\b/i, confidence: "high" },
  { intent: "walk_start", re: /\bheading (home|out|back) now\b/i, confidence: "possible" },

  { intent: "walk_end", re: /\b(end|stop|close|finish) (the |this |my )?(walk|trip|ride|session|journey)\b/i, confidence: "high" },
  { intent: "walk_end", re: /\b(i'?m|made it) (home|back|inside)( safe| now)?\b/i, confidence: "high" },
  { intent: "walk_end", re: /\ball (good|clear),? (i'?m )?(home|done|in)\b/i, confidence: "high" },

  { intent: "walk_hold", re: /\bkeep (this|the|my) (trip|walk|session) open\b/i, confidence: "high" },
  { intent: "walk_hold", re: /\b(don'?t|do not) (close|end) (it|the trip|the walk)\b/i, confidence: "high" },

  { intent: "walk_checkin", re: /\bi'?m here\b/i, confidence: "high" },
  { intent: "walk_checkin", re: /\b(checking in|check me in|mark (this|my) spot)\b/i, confidence: "high" },
  { intent: "walk_checkin", re: /\bstill (walking|going|moving)\b/i, confidence: "possible" },

  { intent: "walk_eta", re: /\bhow much longer\b/i, confidence: "high" },
  { intent: "walk_eta", re: /\bhow (long|far) (have i|has it|am i)\b/i, confidence: "high" },

  { intent: "trip_status", re: /\b(is|have i got|do i have) (a |any )?(trip|walk|session) (running|open|going)\b/i, confidence: "high" },
  { intent: "trip_status", re: /\bwhat'?s my trip\b/i, confidence: "high" },
];

/** The first rule that matches, or null. Never guesses at empty input. */
export function fieldIntentFor(text: string | null | undefined): FieldMatch | null {
  const s = String(text ?? "").trim();
  if (!s) return null;
  for (const rule of RULES) {
    const m = rule.re.exec(s);
    if (m) return { intent: rule.intent, matched: m[0], confidence: rule.confidence };
  }
  return null;
}

const HIGH_STAKES: ReadonlySet<FieldIntent> = new Set(["high_stakes", "unease"]);

/** True when Echo must get simpler and quieter, not chattier. */
export function isHighStakes(intent: FieldIntent | null | undefined): boolean {
  return !!intent && HIGH_STAKES.has(intent);
}

const SESSION_INTENTS: ReadonlySet<FieldIntent> = new Set([
  "walk_start", "walk_end", "walk_checkin", "walk_hold", "walk_eta", "trip_status",
]);

/** True when the phrase is about the shared trip session. */
export function touchesSession(intent: FieldIntent | null | undefined): boolean {
  return !!intent && SESSION_INTENTS.has(intent);
}

/**
 * What Echo may do about a recognized phrase. Deliberately narrow: the only
 * writes a field phrase can cause are trip-session writes the person asked for.
 * Sharing a location, contacting anyone, or dialling is never in this list.
 */
export function fieldCapability(intent: FieldIntent): {
  writes_session: boolean;
  simplify: boolean;
  offers_help: boolean;
} {
  return {
    writes_session: intent === "walk_start" || intent === "walk_end" || intent === "walk_checkin" || intent === "walk_hold",
    simplify: isHighStakes(intent),
    offers_help: intent === "high_stakes" || intent === "unease",
  };
}
