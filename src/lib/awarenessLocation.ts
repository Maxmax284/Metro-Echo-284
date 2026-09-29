// awarenessLocation — separated state model for the Aware layer.
//
// Replaces the old "one big badness flag" approach. Each axis is independent
// so we never shame a valid broad place because the exact GPS pin is weak.
//
//   deviceLocationStatus — what the phone GPS is doing right now
//   placeStatus          — whether the selected/saved place is usable
//   pinQuality           — quality of the exact coordinate only
//   scanStatus           — whether an awareness scan has been run
//   advisorMode          — what mode the Aware layer should operate in
//
// UI also gets a clean `sources[]` badge list + a calm one-line `message`.

import type { AwarenessPlace } from "@/providers/AwarenessProvider";

export type DeviceLocationStatus =
  | "high_accuracy" | "approximate" | "broad" | "weak"
  | "stale" | "denied" | "unavailable" | "unknown";

export type PlaceStatus =
  | "confirmed" | "broad_confirmed" | "saved_place" | "searched_place"
  | "manual_place" | "unresolved" | "invalid" | "unknown";

export type PinQuality =
  | "valid" | "low_accuracy" | "broad" | "offshore"
  | "stale" | "missing" | "not_required" | "invalid";

export type ScanStatus =
  | "never_scanned" | "ready" | "scanning"
  | "scanned_recently" | "stale" | "failed" | "blocked";

export type AdvisorMode =
  | "exact_local" | "broad_area" | "manual_place"
  | "saved_place" | "search_place" | "blocked" | "needs_location";

export type SourceBadge =
  | "phone_gps" | "saved_place" | "searched_place" | "manual_place"
  | "broad_area" | "no_scan" | "scan_ready"
  | "external_on" | "external_off" | "external_not_run";

export type LocationState = {
  deviceLocationStatus: DeviceLocationStatus;
  placeStatus: PlaceStatus;
  pinQuality: PinQuality;
  scanStatus: ScanStatus;
  advisorMode: AdvisorMode;
  sources: SourceBadge[];
  /** Calm, single-line status message for the place strip. */
  message: string;
  /** True only when we genuinely cannot run anything — no place, no GPS. */
  isBlocked: boolean;
  /** True only when the place itself is unresolved (no country fallback). */
  placeUnresolved: boolean;
  accuracy_m: number | null;
  fixAgeMs: number | null;
};

const STALE_FIX_MS = 10 * 60 * 1000;        // 10 min
const SCAN_FRESH_MS = 24 * 60 * 60 * 1000;  // 24 h
const SCAN_AGING_MS = 7 * 24 * 60 * 60 * 1000;

function classifyPinFromAccuracy(acc: number | null): PinQuality {
  if (acc == null || !Number.isFinite(acc)) return "missing";
  if (acc < 50) return "valid";
  if (acc < 250) return "low_accuracy";
  if (acc < 1000) return "broad";
  return "low_accuracy";
}

function classifyDeviceFromAccuracy(acc: number | null, ageMs: number | null): DeviceLocationStatus {
  if (acc == null || !Number.isFinite(acc)) return "unknown";
  if (ageMs != null && ageMs > STALE_FIX_MS) return "stale";
  if (acc < 50) return "high_accuracy";
  if (acc < 250) return "approximate";
  if (acc < 1000) return "broad";
  return "weak";
}

export function resolveLocationState(
  place: AwarenessPlace | null,
  opts: {
    generatedAt?: string | null;
    serpEnabled?: boolean | null;
    serpUsed?: boolean | null;
  } = {},
): LocationState {
  const geo: any = place?.geo ?? {};
  const acc: number | null = Number.isFinite(geo.acc) ? Number(geo.acc) : null;
  const ts: number | null = Number.isFinite(geo.ts) ? Number(geo.ts) : null;
  const fixAgeMs = ts ? Date.now() - ts : null;
  const sanity: string | null = geo.sanity ?? null;
  const source: string | null = geo.source ?? null;
  const hasCoord = Number.isFinite(geo.lat) && Number.isFinite(geo.lon);
  const city: string | null = geo.city ?? null;
  const country = place?.country ?? null;
  const region = place?.region ?? null;

  // ---- pinQuality -----------------------------------------------------
  let pinQuality: PinQuality = "missing";
  if (hasCoord) {
    pinQuality = classifyPinFromAccuracy(acc);
    if (sanity === "offshore_confirmed") pinQuality = "offshore";
    if (fixAgeMs != null && fixAgeMs > STALE_FIX_MS && pinQuality === "valid") pinQuality = "stale";
  }

  // ---- placeStatus ----------------------------------------------------
  let placeStatus: PlaceStatus = "unknown";
  if (!place) {
    placeStatus = "unknown";
  } else if (!country && !region && !city && sanity !== "land_nearby") {
    placeStatus = "unresolved";
  } else if (country && (city || region)) {
    placeStatus = "confirmed";
  } else if (country) {
    placeStatus = "broad_confirmed";
  } else if (sanity === "land_nearby") {
    placeStatus = "broad_confirmed";
  } else {
    placeStatus = "unresolved";
  }

  // ---- deviceLocationStatus ------------------------------------------
  let deviceLocationStatus: DeviceLocationStatus = "unknown";
  if (hasCoord) {
    deviceLocationStatus = classifyDeviceFromAccuracy(acc, fixAgeMs);
  }

  // ---- advisorMode ---------------------------------------------------
  let advisorMode: AdvisorMode;
  if (placeStatus === "unresolved" || placeStatus === "unknown") {
    advisorMode = place ? "needs_location" : "needs_location";
  } else if (deviceLocationStatus === "high_accuracy" || deviceLocationStatus === "approximate") {
    advisorMode = "exact_local";
  } else {
    advisorMode = "broad_area";
  }

  // ---- scanStatus ----------------------------------------------------
  let scanStatus: ScanStatus;
  const generatedAt = opts.generatedAt ?? null;
  if (placeStatus === "unresolved" || placeStatus === "unknown") {
    scanStatus = "blocked";
  } else if (!generatedAt) {
    scanStatus = "never_scanned";
  } else {
    const age = Date.now() - new Date(generatedAt).getTime();
    if (age < SCAN_FRESH_MS) scanStatus = "scanned_recently";
    else if (age < SCAN_AGING_MS) scanStatus = "ready";
    else scanStatus = "stale";
  }

  // ---- sources[] -----------------------------------------------------
  const sources: SourceBadge[] = [];
  if (advisorMode === "exact_local") sources.push("phone_gps");
  if (placeStatus === "confirmed" || placeStatus === "broad_confirmed") {
    if (source === "manual_search") sources.push("searched_place");
    else if (["manual", "map_pick", "map_picker", "manual_fix", "nearby_suggestion"].includes(source)) sources.push("manual_place");
    else if (!sources.includes("phone_gps")) sources.push("saved_place");
  }
  if (advisorMode === "broad_area") sources.push("broad_area");
  if (scanStatus === "never_scanned") sources.push("no_scan");
  else if (scanStatus === "ready" || scanStatus === "stale") sources.push("scan_ready");
  if (opts.serpEnabled) {
    if (opts.serpUsed) sources.push("external_on");
    else sources.push("external_not_run");
  } else {
    sources.push("external_off");
  }

  // ---- message — source-first, honest, no false certainty ----------
  const placeLabel = place?.label || [city, region, country].filter(Boolean).join(", ") || "this place";
  const regionLabel = [city, region, country].filter(Boolean).join(", ") || placeLabel;
  let message = "";
  if (placeStatus === "unresolved" || placeStatus === "unknown") {
    if (pinQuality === "offshore") {
      message = "GPS pin looks offshore. Search a place or pick one on the map.";
    } else {
      message = "Location unknown — tap to set.";
    }
  } else if (advisorMode === "exact_local") {
    const a = acc != null ? `${Math.round(acc)}m accuracy` : "good accuracy";
    message = `Using your current location · ${a}.`;
  } else if (["manual", "map_pick", "map_picker", "manual_fix", "nearby_suggestion"].includes(source)) {
    message = `Manually set to ${placeLabel}.`;
  } else if (source === "manual_search") {
    message = `Using ${placeLabel} (searched).`;
  } else if (pinQuality === "offshore" || deviceLocationStatus === "weak" || deviceLocationStatus === "stale") {
    message = `Approximate — ${regionLabel} area.`;
  } else if (deviceLocationStatus === "denied" || deviceLocationStatus === "unavailable") {
    message = `Location off — using ${placeLabel}.`;
  } else {
    message = `Using ${placeLabel}.`;
  }

  return {
    deviceLocationStatus,
    placeStatus,
    pinQuality,
    scanStatus,
    advisorMode,
    sources,
    message,
    isBlocked: advisorMode === "needs_location",
    placeUnresolved: placeStatus === "unresolved" || placeStatus === "unknown",
    accuracy_m: acc,
    fixAgeMs,
  };
}

export const SOURCE_BADGE_LABEL: Record<SourceBadge, string> = {
  phone_gps:         "Phone GPS",
  saved_place:       "Saved place",
  searched_place:    "Searched place",
  manual_place:      "Manual place",
  broad_area:        "Broad area",
  no_scan:           "No scan yet",
  scan_ready:        "Scan ready",
  external_on:       "External search on",
  external_off:      "External search off",
  external_not_run:  "External search not run",
};

export const SOURCE_BADGE_TONE: Record<SourceBadge, string> = {
  phone_gps:         "bg-primary/15 text-primary ring-primary/30",
  saved_place:       "bg-primary/10 text-primary ring-primary/30",
  searched_place:    "bg-accent/15 text-accent ring-accent/30",
  manual_place:      "bg-accent/10 text-accent ring-accent/30",
  broad_area:        "bg-muted/40 text-muted-foreground ring-border/60",
  no_scan:           "bg-warn/10 text-warn ring-warn/30",
  scan_ready:        "bg-primary/10 text-primary ring-primary/30",
  external_on:       "bg-accent/15 text-accent ring-accent/30",
  external_off:      "bg-muted/30 text-muted-foreground ring-border/60",
  external_not_run:  "bg-muted/40 text-muted-foreground ring-border/60",
};

export function logLocationDecision(tag: string, state: LocationState, extra: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  if (!(window as any).__VANTA_LOC_DEBUG__) return;
  console.log(`[aware:${tag}]`, {
    placeStatus: state.placeStatus,
    deviceLocationStatus: state.deviceLocationStatus,
    pinQuality: state.pinQuality,
    scanStatus: state.scanStatus,
    advisorMode: state.advisorMode,
    accuracy_m: state.accuracy_m,
    fixAgeMs: state.fixAgeMs,
    sources: state.sources,
    ...extra,
  });
}
