// Client-side mirror of the VantaSignal contract used by edge functions.
// Keep in sync with supabase/functions/_shared/vantaVoice.ts.

import { verbLabel } from "@/lib/interactionVerbs";

export type SignalType =
  | "transport" | "infrastructure" | "payments" | "etiquette"
  | "hazards" | "scams" | "connectivity" | "timing"
  | "weather" | "community" | "source" | "location_warning"
  | "captured_image" | "sherlock_flag" | "research"
  | "saved_place" | "commitment";

export type SourceLabel =
  | "internal" | "open-meteo" | "serpapi" | "community"
  | "reddit" | "gemini" | "user-capture" | "memory" | "sherlock";

export type SignalRoute =
  | "ask_vanta" | "save_to_memory" | "send_to_sherlock"
  | "create_commitment" | "draft_action" | "refresh_signal"
  | "confirm_location" | "use_saved_place" | "dismiss"
  // Stage 2 — feedback verbs. Always available, regardless of AI suggestion.
  | "mark_wrong" | "mark_useful" | "mark_outdated"
  | "add_field_note" | "flag_source" | "do_not_show_again";

export type Confidence = "low" | "medium" | "high";
export type RiskLevel = "none" | "low" | "medium" | "high";
export type Freshness = "live" | "cached" | "stale" | "unknown";

export interface VantaSignal {
  signal_type: SignalType;
  title: string;
  short_summary: string;
  confidence: Confidence;
  risk_level: RiskLevel;
  source_labels: SourceLabel[];
  freshness: Freshness;
  why_it_matters: string;
  what_to_do_next: string;
  requires_confirmation: boolean;
  confirmation_reason: string;
  available_routes: SignalRoute[];
  long_detail: string;
  display_priority: number;
}

/** Loose runtime guard — accepts anything that has the required fields. */
export function isVantaSignal(v: unknown): v is VantaSignal {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.signal_type === "string"
      && typeof s.title === "string"
      && typeof s.short_summary === "string"
      && typeof s.confidence === "string";
}

/**
 * Safe coercer — fills every field with sensible defaults so renderers never
 * crash on partial/legacy payloads. Use this at the UI boundary in Stage 3.
 */
export function coerceSignal(v: unknown): VantaSignal {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const str = (k: string, d = "") => (typeof s[k] === "string" ? (s[k] as string) : d);
  const arr = <T,>(k: string): T[] => (Array.isArray(s[k]) ? (s[k] as T[]) : []);
  const enumOr = <T extends string>(k: string, allowed: readonly T[], d: T): T =>
    (allowed as readonly string[]).includes(s[k] as string) ? (s[k] as T) : d;
  return {
    signal_type: str("signal_type", "source") as SignalType,
    title: str("title", "Signal"),
    short_summary: str("short_summary", ""),
    confidence: enumOr<Confidence>("confidence", ["low", "medium", "high"], "low"),
    risk_level: enumOr<RiskLevel>("risk_level", ["none", "low", "medium", "high"], "none"),
    source_labels: arr<SourceLabel>("source_labels"),
    freshness: enumOr<Freshness>("freshness", ["live", "cached", "stale", "unknown"], "unknown"),
    why_it_matters: str("why_it_matters", ""),
    what_to_do_next: str("what_to_do_next", ""),
    requires_confirmation: s.requires_confirmation === true,
    confirmation_reason: str("confirmation_reason", ""),
    available_routes: arr<SignalRoute>("available_routes"),
    long_detail: str("long_detail", ""),
    display_priority: typeof s.display_priority === "number" ? s.display_priority : 5,
  };
}

export const CONFIDENCE_TONE: Record<Confidence, string> = {
  low:    "bg-warn/15 text-warn ring-warn/30",
  medium: "bg-accent/15 text-accent ring-accent/30",
  high:   "bg-primary/15 text-primary ring-primary/30",
};

export const RISK_TONE: Record<RiskLevel, string> = {
  none:   "bg-muted/40 text-muted-foreground ring-border/60",
  low:    "bg-accent/15 text-accent ring-accent/30",
  medium: "bg-warn/15 text-warn ring-warn/40",
  high:   "bg-danger/15 text-danger ring-danger/40",
};

export const ROUTE_LABEL: Record<SignalRoute, string> = {
  ask_vanta:         "Ask Echo",
  save_to_memory:    "Save to Memory",
  send_to_sherlock:  "Send to Sherlock",
  create_commitment: "Create commitment",
  draft_action:      "Draft action",
  refresh_signal:    "Refresh",
  confirm_location:  "Confirm location",
  use_saved_place:   "Use saved place",
  dismiss:           verbLabel("hide"),
  mark_wrong:        "Wrong",
  mark_useful:       "Useful",
  mark_outdated:     "Outdated",
  add_field_note:    "Field note",
  flag_source:       "Source bad",
  do_not_show_again: verbLabel("not_now"),
};
