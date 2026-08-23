// Ask promotion — moving a quick Ask into the full Ask room without losing the
// thread. The dock and the room share one thread engine, so "promotion" is a
// navigation act, not a data act: nothing is copied, re-sent or re-titled.

export const OPEN_ASK_EVENT = "vanta:open-ask-room";

/** Ask the shell to show the Ask room. The active thread carries over as-is. */
export function promoteToAskRoom() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_ASK_EVENT));
}

export type PromotionSignals = {
  /** Messages in the active thread. */
  messageCount: number;
  /** Thread has produced artifacts (drafts, notes, commitments). */
  hasOutputs?: boolean;
  /** Already in the Ask room — nothing to promote to. */
  inAskRoom?: boolean;
};

/**
 * When the quick surface has outgrown itself. Deliberately conservative: a
 * short exchange stays where it is, and we never suggest what the user is
 * already looking at.
 */
export function shouldSuggestPromotion(s: PromotionSignals): boolean {
  if (s.inAskRoom) return false;
  if (s.messageCount <= 0) return false;
  if (s.hasOutputs) return true;
  return s.messageCount >= 6;
}
