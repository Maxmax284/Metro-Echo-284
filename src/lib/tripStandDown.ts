// tripStandDown — when a finished trip stops leading the flight desk.
//
// The desk is for the trip you are on. Once the last leg has been down for a
// night and there is nothing onward — no next leg, no proposal, no other
// flight on the books — the hero card, the arrival guidance and the open
// journey spine fold into one quiet "trip finished" card.
//
// Doctrine:
//   - Display only. Nothing is deleted, archived away, or rewritten. The
//     spine, the route and every record open again behind one tap, and
//     Receipts keeps the summary permanently.
//   - The fold lifts the moment anything is live again: a confirmed onward
//     leg, a proposed one, or any flight still ahead on the books.
//   - The clock is the filed landing time where one exists, and otherwise the
//     moment the traveller said "landed" — never the device's guess.

/** A night and a morning at the destination before the desk stands down. */
export const STAND_DOWN_AFTER_MS = 18 * 3_600_000;

/**
 * The landing instant to fold from, in epoch ms. The filed arrival wins; a
 * ticket-stamp flight with no filed times falls back to the traveller's own
 * "landed" tap. Neither on record means the desk cannot know it is over —
 * and an unknown never folds anything.
 */
export function landingMs(
  filedArrival: string | null,
  legStateAt: string | null,
): number | null {
  const filed = filedArrival ? Date.parse(filedArrival) : Number.NaN;
  if (Number.isFinite(filed)) return filed;
  const said = legStateAt ? Date.parse(legStateAt) : Number.NaN;
  return Number.isFinite(said) ? said : null;
}

export type StandDownArgs = {
  /** The live leg is down — the airline's word or the traveller's. */
  landed: boolean;
  /** Landing instant from landingMs, or null when it cannot be known. */
  landedAtMs: number | null;
  now: number;
  /** A confirmed next leg waits on this same journey. */
  onwardConfirmed: boolean;
  /** A proposed flight could still chain onto this journey. */
  onwardCandidate: boolean;
  /** Another flight on the books — any status that still flies — is ahead. */
  upcomingElsewhere: boolean;
  /**
   * Your own word that the trip is over. It skips the wait, never the checks:
   * anything still to fly keeps the desk standing regardless.
   */
  wrappedUp?: boolean;
};

/**
 * True when the desk should fold the finished trip into its quiet card.
 * Anything still to fly — confirmed, proposed, or simply undated — keeps the
 * desk standing, because a person adding a flight to a finished trip is
 * starting the next one, not admiring the last.
 */
export function deskStandsDown(args: StandDownArgs): boolean {
  if (!args.landed) return false;
  if (args.onwardConfirmed || args.onwardCandidate || args.upcomingElsewhere) return false;
  if (args.wrappedUp) return true;
  if (args.landedAtMs === null) return false;
  return args.now - args.landedAtMs >= STAND_DOWN_AFTER_MS;
}
