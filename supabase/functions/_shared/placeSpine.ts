// placeSpine — the server half of the one place/location policy.
//
// `src/lib/placeTruth.ts` decides what Echo is allowed to SAY about where you
// are. This module holds the same precision buckets and the same staleness
// window, plus the one outbound identity and cache policy that every place
// lookup must use. Two lookup functions used to carry their own User-Agent, TTL
// and radius rules, which is how a server line and an app line end up
// disagreeing about the same pin.
//
// Nothing here watches anyone: no background tracking, no geofences, no
// always-on location. It converts a fix that a surface already had into words.

import { PRODUCT_NAME } from "./brand.ts";

/** Must be ASCII — a non-ASCII header value fails before the request leaves. */
export function placeLookupUserAgent(): string {
  const site = (Deno.env.get("VANTA_PUBLIC_URL") ?? "").replace(/\/$/, "");
  const label = PRODUCT_NAME.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, "");
  return site ? `${label}/1.0 (${site})` : `${label}/1.0`;
}

export function placeLookupHeaders(): Record<string, string> {
  return { "User-Agent": placeLookupUserAgent(), "Accept-Language": "en" };
}

/** One cache policy for every place lookup. */
export const PLACE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PLACE_LOOKUP_TIMEOUT_MS = 9_000;

/** Mirrors PlacePrecision in src/lib/placeTruth.ts. Keep the buckets identical. */
export type PlacePrecision = "street" | "neighbourhood" | "city" | "area" | "unknown";
export type PlaceSource = "device" | "manual" | "saved" | "unknown";

const HOUR = 60 * 60 * 1000;
/** Same window the client uses. A fix older than this is "last known". */
export const PLACE_STALE_MS = 12 * HOUR;

/** Same thresholds as the client. Do not tune one side alone. */
export function precisionFor(accuracyMetres: number | null | undefined): PlacePrecision {
  const acc = Number(accuracyMetres);
  if (!Number.isFinite(acc) || acc <= 0) return "unknown";
  if (acc <= 50) return "street";
  if (acc <= 500) return "neighbourhood";
  if (acc <= 5_000) return "city";
  return "area";
}

export function sourceFor(raw: unknown): PlaceSource {
  const s = String(raw ?? "").toLowerCase();
  /* Mirror of src/lib/placeTruth.ts — every hand-fix tag reads as "manual". */
  if (["manual", "pin", "dragged", "manual_fix", "map_picker", "manual_search", "nearby_suggestion"].includes(s)) return "manual";
  if (s === "device" || s === "gps") return "device";
  if (s === "saved") return "saved";
  return "unknown";
}

export function isStale(fixAtIso: string | null | undefined, now = Date.now()): boolean {
  const t = fixAtIso ? new Date(fixAtIso).getTime() : NaN;
  return Number.isFinite(t) ? now - t > PLACE_STALE_MS : false;
}

/**
 * The most specific thing a fix earns the right to be called. A wide fix may
 * name a region; it may never name a street. Anything Echo says about a place
 * on the server goes through here first.
 */
export function nameAllowedAt(
  precision: PlacePrecision,
  parts: { street?: string | null; neighbourhood?: string | null; city?: string | null; region?: string | null; country?: string | null },
): string | null {
  const { street, neighbourhood, city, region, country } = parts;
  switch (precision) {
    case "street": return street || neighbourhood || city || region || country || null;
    case "neighbourhood": return neighbourhood || city || region || country || null;
    case "city": return city || region || country || null;
    case "area": return region || country || null;
    default: return city || region || country || null;
  }
}

/** One sentence, server side, matching the client's shape of honesty. */
export function placeLine(input: {
  name: string | null;
  precision: PlacePrecision;
  source: PlaceSource;
  stale: boolean;
}): string {
  const { name, precision, source, stale } = input;
  const byYou = source === "manual";
  if (!name) {
    return byYou
      ? "You placed this pin yourself, and Echo still can't tell what's there."
      : "Echo has a fix but can't tell what's there yet.";
  }
  const head = byYou
    ? `You set this to ${name}.`
    : precision === "street" || precision === "neighbourhood"
      ? `You're in ${name}.`
      : precision === "city"
        ? `You're somewhere in ${name}.`
        : `Somewhere around ${name} — the fix is wide.`;
  return stale ? `${head} That was a while back, so treat it as the last place Echo knew.` : head;
}
