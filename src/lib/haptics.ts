// haptics — four patterns, nothing more.
//
// A buzz is a word, not decoration. The vocabulary stays small enough to learn
// without trying: note, change, needs-you, critical. Quiet hours silence everything
// but critical. A haptic is always an addition to a readable line, never a
// replacement for it.
import { URGENCY_RANK, type Urgency } from "@/lib/deviceCompression";

export type HapticPattern = "note" | "change" | "time_sensitive" | "critical";

export interface HapticSpec {
  label: string;
  meaning: string;
  /** Vibrate pattern in ms: buzz, gap, buzz… */
  ms: number[];
  /** The strongest urgency this pattern is allowed to represent. */
  ceiling: Urgency;
}

export const HAPTIC_PATTERNS: Record<HapticPattern, HapticSpec> = {
  note: {
    label: "Note",
    meaning: "For your information. Nothing is waiting on you.",
    ms: [40],
    ceiling: "useful",
  },
  change: {
    label: "Change",
    meaning: "Something meaningful changed.",
    ms: [35, 90, 35],
    ceiling: "attention",
  },
  needs_you: {
    label: "Needs you",
    meaning: "Something is waiting on you.",
    ms: [140],
    ceiling: "time_sensitive",
  },
  critical: {
    label: "Critical",
    meaning: "A hard critical condition you defined.",
    ms: [180, 90, 60, 90, 180],
    ceiling: "critical",
  },
};

export function hapticFor(urgency: Urgency): HapticPattern {
  switch (urgency) {
    case "critical":
      return "critical";
    case "time_sensitive":
      return "needs_you";
    case "attention":
      return "change";
    default:
      return "note";
  }
}

export interface HapticGate {
  quietHours?: boolean;
  /** A posture that holds ordinary noise: deep work, training, driving, sleep… */
  postureHoldsNoise?: boolean;
  /** False when the attention budget for this stretch is spent. */
  budgetLeft?: boolean;
}

/**
 * Whether a buzz is allowed. Reduced motion is deliberately NOT a gate here — a
 * haptic is quieter than an animation, and it is the accessible alternative to one.
 */
export function allowHaptic(pattern: HapticPattern, gate: HapticGate = {}): boolean {
  const rank = URGENCY_RANK[HAPTIC_PATTERNS[pattern].ceiling];
  if (pattern === "critical") return true;
  if (gate.quietHours) return false;
  if (gate.budgetLeft === false) return false;
  if (gate.postureHoldsNoise && rank < URGENCY_RANK.time_sensitive) return false;
  return true;
}

/** Returns true when a buzz actually went out. Silence is never an error. */
export function playHaptic(pattern: HapticPattern, gate: HapticGate = {}): boolean {
  if (!allowHaptic(pattern, gate)) return false;
  try {
    const nav = typeof navigator === "undefined" ? null : (navigator as Navigator);
    if (!nav || typeof nav.vibrate !== "function") return false;
    return nav.vibrate(HAPTIC_PATTERNS[pattern].ms);
  } catch {
    return false;
  }
}
