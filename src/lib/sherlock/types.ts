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

export interface SherlockSettings {
  user_id: string;
  ambient_enabled: boolean;
  show_low_confidence: boolean;
  sensitive_caution: boolean;
  show_in_canvas: boolean;
  show_in_briefings: boolean;
  dismissed_cooldown_days: number;
  manual_only_for_sensitive: boolean;
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
};
