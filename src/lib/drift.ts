// Client-facing surface for the proactive-awareness detectors. The logic lives
// in the shared edge-function module so the server and the tests read the same
// code — there is exactly one definition of "drift".
export {
  detectDriftingCommitment,
  detectSilentProject,
  detectUnreadRisk,
  driftScopeTargets,
  isInQuietHours,
  rankDrift,
  scopedDedupeKey,
  type DriftCommitment,
  type DriftProject,
  type DriftRisk,
  type DriftSignal,
} from "../../supabase/functions/_shared/drift";

/** Nudge kinds produced by drift detection — used to style the Today row. */
export const DRIFT_KINDS = ["project_went_silent", "commitment_drifting", "risk_unread"] as const;

export function isDriftKind(kind: string): boolean {
  return (DRIFT_KINDS as readonly string[]).includes(kind);
}
