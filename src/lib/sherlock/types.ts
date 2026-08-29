// Sherlock 3 — shared types for the ambient recognition layer.
// Mirrors the `sherlock_findings` and `sherlock_settings` tables.

export type SherlockMode = "observe" | "extract" | "relate" | "suggest" | "investigate";
export type SherlockConfidence = "low" | "medium" | "high";
export type SherlockStatus = "pending" | "accepted" | "edited" | "dismissed" | "expired";

export type SherlockSourceType =
  | "message"
  | "note"
  | "action"
  | "commitment"
  | "reminder"
  | "briefing"
  | "file"
  | "entity"
  | "canvas"
  | "aware"
  | "freeform";

export interface SherlockFinding {
  id: string;
  user_id: string;
  source_object_id: string | null;
  source_object_type: SherlockSourceType | string;
  mode: SherlockMode;
  finding_type: string;
  summary: string;
  extracted_data: Record<string, unknown>;
  suggested_action: string | null;
  suggested_relation_type: string | null;
  target_object_id: string | null;
  target_object_type: string | null;
  confidence: SherlockConfidence;
  rationale: string | null;
  status: SherlockStatus;
  surface_origin: string | null;
  sensitive_flag: boolean;
  cooldown_until: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  audit_event_id: string | null;
  evidence_hash: string | null;
  created_at: string;
  updated_at: string;
}

/** Detector switches. Keys mirror `finding_type` so nothing needs translating. */
export type DetectorKey =
  | "detect_stale_commitment"
  | "detect_near_duplicate_note"
  | "detect_recurring_entity"
  | "detect_obligation_untracked"
  | "detect_unapproved_high_risk"
  | "detect_meeting_without_context"
  | "detect_promise_collides"
  | "detect_entity_gone_quiet"
  | "detect_notes_disagree";

export interface SherlockSettings {
  user_id: string;
  ambient_enabled: boolean;
  show_low_confidence: boolean;
  sensitive_caution: boolean;
  show_in_canvas: boolean;
  show_in_briefings: boolean;
  dismissed_cooldown_days: number;
  manual_only_for_sensitive: boolean;
  // Detection sensitivity — what Sherlock notices, never what it may do.
  detect_stale_commitment: boolean;
  detect_near_duplicate_note: boolean;
  detect_recurring_entity: boolean;
  detect_obligation_untracked: boolean;
  detect_unapproved_high_risk: boolean;
  detect_meeting_without_context: boolean;
  detect_promise_collides: boolean;
  detect_entity_gone_quiet: boolean;
  detect_notes_disagree: boolean;
  stale_promise_days: number;
  duplicate_window_days: number;
  recurring_min_mentions: number;
  quiet_gap_days: number;
  meeting_lookahead_hours: number;
  // Weekly read.
  weekly_digest_enabled: boolean;
  weekly_digest_today: boolean;
  weekly_digest_telegram: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_SETTINGS: Omit<SherlockSettings, "user_id" | "created_at" | "updated_at"> = {
  ambient_enabled: true,
  show_low_confidence: false,
  sensitive_caution: true,
  show_in_canvas: true,
  show_in_briefings: true,
  dismissed_cooldown_days: 7,
  manual_only_for_sensitive: true,
  detect_stale_commitment: true,
  detect_near_duplicate_note: true,
  detect_recurring_entity: true,
  detect_obligation_untracked: true,
  detect_unapproved_high_risk: true,
  detect_meeting_without_context: true,
  detect_promise_collides: true,
  detect_entity_gone_quiet: true,
  detect_notes_disagree: true,
  stale_promise_days: 2,
  duplicate_window_days: 30,
  recurring_min_mentions: 4,
  quiet_gap_days: 14,
  meeting_lookahead_hours: 48,
  weekly_digest_enabled: true,
  weekly_digest_today: true,
  weekly_digest_telegram: false,
};
