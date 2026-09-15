// Client-facing surface for the proactive-awareness detectors. The logic lives
// in the shared edge-function module so the server and the tests read the same
// code — there is exactly one definition of "drift".
export {
  detectDriftingCommitment,
  detectSilentProject,
  detectUnreadRisk,
  driftScopeTargets,
  isInQuietHours,
  mayRepropose,
  rankDrift,
  scopedDedupeKey,
  situationDedupeKey,
  type DriftCommitment,
  type DriftProject,
  type DriftRisk,
  type DriftSignal,
} from "../../supabase/functions/_shared/drift";

/**
 * Notice kinds Echo raises on its own — used to style the Today row.
 * Calendar notices belong here too: an appointment heads-up is the same kind of
 * quiet note as a drifting promise, and Today is the only place it lands.
 */
export const DRIFT_KINDS = [
  "project_went_silent",
  "commitment_drifting",
  "risk_unread",
  "appointment_ahead",
  "meeting_starting_soon",
  "meeting_changed",
  "commitment_collides_with_meeting",
  /* A page the person asked Echo to watch actually moved. Same quiet note. */
  "web_page_changed",
  /* An urgent signal from a connected system: one line, in the same lane. */
  "inbound_needs_you",
] as const;

export function isDriftKind(kind: string): boolean {
  return (DRIFT_KINDS as readonly string[]).includes(kind);
}
