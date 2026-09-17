// consequence — importance from what happens if this is ignored, not from count.
//
// Doctrine:
//   - Eight calendar events is not news. One moved appointment is.
//   - Every level is explainable from recorded fact. No hidden weighting, no
//     model opinion, no user-facing score.
//   - This feeds the existing awareness relevance/urgency/suppression pipeline.
//     It does not replace it and it does not get its own UI.
//
// Pure module.

export type Consequence = "none" | "low" | "moderate" | "high";

export const CONSEQUENCE_ORDER: Consequence[] = ["none", "low", "moderate", "high"];

export function consequenceRank(level: Consequence): number {
  return CONSEQUENCE_ORDER.indexOf(level);
}

export type ConsequenceInput = {
  /** Registered signal kind, when there is one. */
  kind?: string | null;
  /** Something the person actually committed to is in play. */
  touchesCommitment?: boolean;
  /** Hours until it bites. Negative means it already has. */
  hoursUntil?: number | null;
  /** A thing already booked or scheduled moved. */
  movedSomethingBooked?: boolean;
  /** Someone getting in, or the person getting in, depends on it. */
  blocksAccess?: boolean;
  /** The person said they were waiting for this. */
  awaited?: boolean;
  /** Anything actually changed since the last read. */
  changed?: boolean;
  /** Bulk/broadcast material: newsletters, notices to everyone. */
  broadcast?: boolean;
  /** A promise captured for later, with no date on it yet. */
  parkedPromise?: boolean;
};

export type ConsequenceRead = {
  level: Consequence;
  because: string[];
};

const HIGH_KINDS = new Set([
  "flight_gate_changed",
  "flight_delayed",
  "flight_cancelled",
  "meeting_changed",
  "security_event",
]);

/**
 * The doctrine examples, made deterministic:
 *   newsletter                              → low (broadcast, nothing owed)
 *   appointment moved tomorrow              → high (booked thing moved, clock close)
 *   landlord access message                 → high (access depends on it)
 *   gate/terminal change                    → high (booked thing moved on the clock)
 *   trainer change before a commitment      → high (commitment in play)
 *   payment landed and it was awaited       → moderate
 *   promise captured for later              → low, and it says so
 */
export function consequenceOf(input: ConsequenceInput): ConsequenceRead {
  const because: string[] = [];
  let score = 0;

  if (input.broadcast) {
    because.push("sent to everyone, nothing owed by you");
    score -= 1;
  }
  if (input.parkedPromise) {
    because.push("a promise kept for later, with no date on it yet");
    score -= 1;
  }
  if (input.changed === true) {
    because.push("something actually changed");
    score += 1;
  }
  if (input.movedSomethingBooked) {
    because.push("something already booked moved");
    score += 2;
  }
  if (input.blocksAccess) {
    because.push("access depends on it");
    score += 2;
  }
  if (input.touchesCommitment) {
    because.push("it lands on something you committed to");
    score += 2;
  }
  if (input.awaited) {
    because.push("you said you were waiting on it");
    score += 1;
  }
  if (input.kind && HIGH_KINDS.has(input.kind)) {
    because.push("this kind of change usually costs you something");
    score += 1;
  }
  const hours = input.hoursUntil;
  if (typeof hours === "number" && Number.isFinite(hours)) {
    if (hours < 0) {
      because.push("the time has already passed");
      score += 2;
    } else if (hours <= 36) {
      because.push("it bites inside a day and a half");
      score += 1;
    }
  }

  const level: Consequence = score >= 4 ? "high" : score >= 2 ? "moderate" : score >= 1 ? "low" : "none";
  if (!because.length) because.push("nothing recorded says this costs anything");
  return { level, because };
}

/** Feeds the existing relevance `impact` factor. Derived, never invented. */
export function consequenceImpact(level: Consequence): number {
  switch (level) {
    case "high": return 0.95;
    case "moderate": return 0.6;
    case "low": return 0.3;
    default: return 0.1;
  }
}

export type InterruptContext = {
  inQuietHours?: boolean;
  /** Posture or attention budget already says hold ordinary noise. */
  holdingNoise?: boolean;
  /** The person is standing in front of the surface anyway. */
  alreadyLooking?: boolean;
};

/**
 * Interruption eligibility. Silence is a valid answer, so the default is no.
 * Quiet hours only bend for high consequence, and even then only when the clock
 * is against the person — never for a merely interesting change.
 */
export function needsYouNow(level: Consequence, ctx: InterruptContext = {}): boolean {
  if (ctx.alreadyLooking) return level !== "none";
  if (ctx.inQuietHours) return level === "high";
  if (ctx.holdingNoise) return consequenceRank(level) >= consequenceRank("moderate");
  return consequenceRank(level) >= consequenceRank("moderate");
}

/** One plain sentence, only ever used behind "Why this?". */
export function consequenceWhy(read: ConsequenceRead): string {
  return read.because.join("; ") + ".";
}
