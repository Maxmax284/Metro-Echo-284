// Plain-talk normalizer for Awareness briefings.
// Forces every compact layer card to render as a Vanta-voice VantaSignal,
// regardless of whether the DB row has a structured `signal` JSON or only
// legacy Gemini prose. Raw prose is ALWAYS pushed into `long_detail` —
// never into `short_summary`.

import { coerceSignal, isVantaSignal, type VantaSignal, type SignalRoute, type SourceLabel } from "@/lib/vantaSignal";
import { stripMarkdown } from "@/lib/markdown";
import type { AwarenessBriefing, AwarenessPlace } from "@/providers/AwarenessProvider";

export type PlainTalkCtx = {
  place: AwarenessPlace | null;
  serpEnabled?: boolean;
  serpUsed?: boolean;
};

// Phrases in legacy prose that signal "the model couldn't actually read this layer".
const VAGUE_PROSE_MARKERS = [
  "significantly hampered",
  "is unavailable",
  "are unavailable",
  "is not specific enough",
  "too broad",
  "cannot determine",
  "cannot be determined",
  "insufficient",
  "lack of country",
  "lack of region",
  "no specific",
  "effectively zero",
  "absence of terrestrial",
  "deep-water",
  "deep water",
  "offshore",
  "gulf of",
  "open ocean",
  "geo-coordinates",
];

// Rough offshore bounding boxes for common false-fix areas. Cheap heuristic —
// not authoritative, but enough to catch the "Gulf of Thailand" style mistakes.
const OFFSHORE_BOXES: Array<{ name: string; minLat: number; maxLat: number; minLon: number; maxLon: number }> = [
  { name: "Gulf of Thailand", minLat: 6,  maxLat: 13.5, minLon: 99.5, maxLon: 104.5 },
  { name: "Andaman Sea",      minLat: 6,  maxLat: 14,   minLon: 92,   maxLon: 98 },
  { name: "South China Sea",  minLat: 5,  maxLat: 22,   minLon: 109,  maxLon: 120 },
  { name: "Mediterranean",    minLat: 31, maxLat: 40,   minLon: 0,    maxLon: 35 },
];

function isOffshoreGuess(place: AwarenessPlace | null): boolean {
  if (!place?.geo) return false;
  const lat = Number(place.geo.lat);
  const lon = Number(place.geo.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  // Missing country with valid coords + no region → suspicious
  if (!place.country && !place.region) {
    for (const b of OFFSHORE_BOXES) {
      if (lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon) return true;
    }
  }
  return false;
}

function isLocationVague(place: AwarenessPlace | null): boolean {
  if (!place) return true;
  if (!place.country) return true;
  return false;
}

// ---------------------------------------------------------------------------
// L2 — Location tier classifier
// ---------------------------------------------------------------------------
export type LocationTier = "exact" | "saved" | "area" | "city" | "country" | "unknown";

export type TierClassification = {
  tier: LocationTier;
  city: string | null;
  region: string | null;
  country: string | null;
  offshoreGuess: boolean;
  accuracy_m: number | null;
  display: string;
};

export function classifyTier(place: AwarenessPlace | null): TierClassification {
  if (!place) {
    return { tier: "unknown", city: null, region: null, country: null, offshoreGuess: false, accuracy_m: null, display: "Unknown location" };
  }
  const geo = (place.geo ?? {}) as any;
  const city: string | null = geo.city ?? null;
  const accuracy_m: number | null = Number.isFinite(geo.acc) ? Number(geo.acc) : null;
  const offshoreGuess = isOffshoreGuess(place);
  const country = place.country ?? null;
  const region = place.region ?? null;

  const parts = [city, region, country].filter(Boolean) as string[];
  const display = parts.length ? parts.join(", ") : (offshoreGuess ? "Offshore (best guess)" : "Unknown location");

  if (!country) return { tier: "unknown", city, region, country, offshoreGuess, accuracy_m, display };
  if (!city && !region) return { tier: "country", city, region, country, offshoreGuess, accuracy_m, display };
  if (!city) return { tier: "city", city, region, country, offshoreGuess, accuracy_m, display };
  if (accuracy_m !== null && accuracy_m <= 150) return { tier: "exact", city, region, country, offshoreGuess, accuracy_m, display };
  if (!accuracy_m && place.label) return { tier: "saved", city, region, country, offshoreGuess, accuracy_m, display };
  return { tier: "area", city, region, country, offshoreGuess, accuracy_m, display };
}

export function tierIsUseless(tier: LocationTier): boolean {
  return tier === "unknown";
}

/** L6 — Tier-aware broader-context guidance per layer. */
const BROADER_CONTEXT: Record<string, (scope: string) => { summary: string; why: string; next: string }> = {
  transport:     (s) => ({ summary: `Using broader ${s} context for transport — useful but not street-level.`, why: "Exact transport options change neighborhood by neighborhood.", next: "Confirm your spot for sharper info." }),
  infrastructure:(s) => ({ summary: `Showing ${s}-wide infrastructure context.`, why: "Power, water, and services vary block by block.", next: "Confirm the place to sharpen this read." }),
  payments:      (s) => ({ summary: `Payment norms across ${s} — confirm spot for shop-level detail.`, why: "Card/cash/QR varies by neighborhood and vendor.", next: "Pin a specific place when you need to pay." }),
  etiquette:     (s) => ({ summary: `General etiquette for ${s}.`, why: "Customs hold at the country/region level — useful baseline.", next: "Sharpen the place for neighborhood nuances." }),
  hazards:       (s) => ({ summary: `Broad hazard read for ${s}.`, why: "Big-picture risks (weather, region-wide alerts) still apply.", next: "Confirm spot for street-level hazards." }),
  scams:         (s) => ({ summary: `Known scam patterns across ${s}.`, why: "Some scams are regional, not neighborhood-specific.", next: "Confirm the spot for hyper-local warnings." }),
  connectivity:  (s) => ({ summary: `${s}-wide connectivity outlook.`, why: "Carriers/eSIM coverage usually consistent at country level.", next: "Confirm spot for venue Wi-Fi specifics." }),
  timing:        (s) => ({ summary: `General timing patterns for ${s}.`, why: "Holidays, prayer/siesta, rush hours hold at the region level.", next: "Confirm spot for venue hours." }),
};

/** Build a broader-context signal payload when tier is city/country/area but not exact. */
export function broaderContextCopy(section: string, tier: TierClassification): { title: string; summary: string; why: string; next: string } | null {
  if (tier.tier === "exact" || tier.tier === "saved") return null;
  if (tier.tier === "unknown") return null;
  const scope = tier.city ?? tier.region ?? tier.country ?? "this area";
  const fn = BROADER_CONTEXT[section] ?? BROADER_CONTEXT.transport;
  const copy = fn(scope);
  return {
    title: `${section.charAt(0).toUpperCase() + section.slice(1)} — broader ${scope} context`,
    ...copy,
  };
}

function proseSoundsVague(prose: string): boolean {
  const p = prose.toLowerCase();
  return VAGUE_PROSE_MARKERS.some((m) => p.includes(m));
}

// Per-layer plain-talk copy when location/read is too vague to trust.
const VAGUE_COPY: Record<string, { title: string; summary: string; why: string; next: string }> = {
  transport: {
    title: "Transport read needs a better location",
    summary: "Your location looks too broad right now. Confirm the place so I can give useful transport info.",
    why: "Transport advice depends on the exact city or area — without it I'd be guessing.",
    next: "Pick a saved place, or capture a fresh GPS fix and try again.",
  },
  infrastructure: {
    title: "Infrastructure read needs a better location",
    summary: "Your spot is too vague to read local infrastructure. Confirm the place first.",
    why: "Power, water, and services vary block by block — I won't fake confidence.",
    next: "Confirm the place or recenter, then refresh.",
  },
  payments: {
    title: "Payment read needs a real location",
    summary: "This location looks offshore or misread, so I can't tell what payment options are nearby. Confirm your place first.",
    why: "Card vs. cash vs. QR realities change by country and neighborhood — I need a real spot.",
    next: "Pick a saved place or recenter onto a known address.",
  },
  etiquette: {
    title: "Etiquette read needs a country",
    summary: "I can't read etiquette here because the country isn't clear. Confirm the place first.",
    why: "Greetings, dress, and norms shift by culture — wrong place = wrong advice.",
    next: "Confirm the country or pick a saved place.",
  },
  hazards: {
    title: "Hazard read isn't trustworthy yet",
    summary: "I can't trust the hazard read yet because the location is too vague. Confirm the place first.",
    why: "Hazards (weather, traffic, terrain risk) depend on the exact area — vague input = misleading output.",
    next: "Recenter or pick a saved place, then refresh hazards.",
  },
  scams: {
    title: "Scam read isn't useful yet",
    summary: "I'm not seeing a useful scam read here because the location looks wrong or offshore. Fix the location before trusting this.",
    why: "Scam patterns are hyper-local — without a real place I'd just guess.",
    next: "Confirm the place, then refresh.",
  },
  connectivity: {
    title: "Connection read needs a better fix",
    summary: "Connection info looks shaky because your location is too broad. Confirm the spot before relying on it.",
    why: "Coverage, eSIM, and Wi-Fi reality depend on country and city — I won't pretend otherwise.",
    next: "Recenter or pick a saved place, then re-scan.",
  },
  timing: {
    title: "Timing read needs a place",
    summary: "I can't give useful timing info until your location is confirmed.",
    why: "Opening hours, prayer/siesta, and rush patterns are all local.",
    next: "Confirm the place, then refresh.",
  },
};

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : trimmed).slice(0, 220);
}

function freshness(generatedAt: string | null | undefined): VantaSignal["freshness"] {
  if (!generatedAt) return "unknown";
  const age = Date.now() - new Date(generatedAt).getTime();
  if (age < 24 * 60 * 60 * 1000) return "live";
  if (age < 7 * 24 * 60 * 60 * 1000) return "cached";
  return "stale";
}

/**
 * Normalize any awareness briefing row into a plain-talk VantaSignal.
 * Never lets raw model prose leak into `short_summary`.
 */
export function normalizeAwarenessSignal(
  section: string,
  briefing: AwarenessBriefing | undefined,
  ctx: PlainTalkCtx,
): VantaSignal {
  const vague = isLocationVague(ctx.place) || isOffshoreGuess(ctx.place);
  const rawContent = briefing?.content ?? "";
  const proseVague = !!rawContent && proseSoundsVague(rawContent);

  // Case 1: structured signal exists → trust it, but still push raw content into long_detail.
  if (briefing?.signal && isVantaSignal(briefing.signal)) {
    const s = coerceSignal(briefing.signal);
    return {
      ...s,
      freshness: s.freshness === "unknown" ? freshness(briefing.generated_at) : s.freshness,
      long_detail: s.long_detail || rawContent,
    };
  }

  // Case 2: legacy prose + (vague location OR prose itself sounds vague) → force confirm-place plain-talk.
  if (briefing && (vague || proseVague)) {
    const copy = VAGUE_COPY[section] ?? VAGUE_COPY.transport;
    return coerceSignal({
      signal_type: section,
      title: copy.title,
      short_summary: copy.summary,
      confidence: "low",
      risk_level: "none",
      source_labels: ["internal"] as SourceLabel[],
      freshness: freshness(briefing.generated_at),
      why_it_matters: copy.why,
      what_to_do_next: copy.next,
      requires_confirmation: true,
      confirmation_reason: "Location looks too vague or off — confirm the place before trusting this read.",
      available_routes: ["confirm_location", "use_saved_place", "refresh_signal"] as SignalRoute[],
      long_detail: rawContent, // full robotic paragraph lives here, behind "View full detail"
      display_priority: 5,
    });
  }

  // Case 3: legacy prose, location seems fine → extract first sentence as summary, dump rest to long_detail.
  if (briefing && rawContent) {
    const summary = stripMarkdown(firstSentence(rawContent));
    return coerceSignal({
      signal_type: section,
      title: section.charAt(0).toUpperCase() + section.slice(1),
      short_summary: summary,
      confidence: briefing.confidence ?? "low",
      risk_level: "none",
      source_labels: (ctx.serpUsed ? ["serpapi"] : ["internal"]) as SourceLabel[],
      freshness: freshness(briefing.generated_at),
      why_it_matters: "",
      what_to_do_next: "",
      requires_confirmation: false,
      confirmation_reason: "",
      available_routes: ["refresh_signal"] as SignalRoute[],
      long_detail: rawContent,
      display_priority: 5,
    });
  }

  // Case 4: no briefing at all → empty placeholder signal.
  return coerceSignal({
    signal_type: section,
    title: section.charAt(0).toUpperCase() + section.slice(1),
    short_summary: "",
    confidence: "low",
  });
}

/** Plain-talk SERP/source state for the status pill. */
export type SourceStatus =
  | { kind: "on_not_called"; label: string }
  | { kind: "active";        label: string }
  | { kind: "cached";        label: string }
  | { kind: "failed";        label: string }
  | { kind: "off";           label: string };

export function computeSourceStatus(args: {
  enabled: boolean | null | undefined;
  sourcesUsed?: string[];
  generatedAt?: string | null;
  hasError?: boolean;
}): SourceStatus {
  if (!args.enabled) return { kind: "off", label: "External search off — using saved info" };
  if (args.hasError)  return { kind: "failed", label: "External search failed — check key/quota" };
  const used = (args.sourcesUsed ?? []).some((s) => s.toLowerCase().includes("serp"));
  if (!used && !args.generatedAt) return { kind: "on_not_called", label: "External search on · no live scan yet" };
  const f = freshness(args.generatedAt);
  if (used && f === "live")   return { kind: "active", label: "External search active" };
  if (f === "cached")         return { kind: "cached", label: "External search cached" };
  if (f === "stale")          return { kind: "cached", label: "External search cached (stale)" };
  return { kind: "on_not_called", label: "External search on · no live scan yet" };
}
