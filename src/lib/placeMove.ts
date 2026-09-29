// placeMove — one rule for what survives a move.
//
// A fix used to be written by spreading the old geo object over the new
// coordinates, so a hop from Ko Samui to Tokyo kept the old city, country code
// and display name as "fallbacks". Reverse geocoding then filled the blanks it
// found and left the stale names where they were, and the room went on saying
// Ko Samui over a Tokyo pin.
//
// Rule: past a short walk, a new fix is a new place. Names do not travel with
// coordinates. Echo says nothing about where you are until the lookup for the
// new spot answers.

/** Past this, the old names are about somewhere else. */
export const MOVE_RESET_M = 2_000;

/**
 * Sources that are a deliberate "this is where I am" fix — the device's GPS
 * or your own hand correcting it. A saved place (Home, Work, a named reading
 * seeded through AddPlaceForm with source "manual") is never one of these:
 * editing it bumps updated_at and must never teleport the app. The active
 * place read (AwarenessProvider) accepts exactly this list.
 */
export const LIVE_FIX_SOURCES = [
  "device",
  "map_picker",
  "manual_search",
  "nearby_suggestion",
  "manual_fix",
] as const;

export type Fix = { lat: number; lon: number; acc?: number | null; source?: string };

const R = 6_371_000;

export function metresApart(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Everything in a geo blob that is a claim about a named place. */
const NAME_KEYS = [
  "city",
  "country_code",
  "display_name",
  "geocoded_at",
  "geocode_source",
  "sanity",
  "sanity_meta",
] as const;

export function movedFar(prevGeo: unknown, fix: Fix, thresholdM = MOVE_RESET_M): boolean {
  const g = (prevGeo ?? {}) as Record<string, unknown>;
  const lat = Number(g.lat);
  const lon = Number(g.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;
  return metresApart({ lat, lon }, fix) > thresholdM;
}

/**
 * The geo blob to write for a new fix. Close by, the old detail is still true
 * and is kept. Far away, only the fix itself survives.
 */
export function geoForFix(
  prevGeo: unknown,
  fix: Fix,
  thresholdM = MOVE_RESET_M,
): Record<string, unknown> {
  const prev = { ...((prevGeo ?? {}) as Record<string, unknown>) };
  const far = movedFar(prev, fix, thresholdM);
  if (far) for (const k of NAME_KEYS) delete prev[k];
  return {
    ...prev,
    lat: fix.lat,
    lon: fix.lon,
    acc: fix.acc ?? null,
    source: fix.source ?? "device",
  };
}

/**
 * The row patch for a new fix: geo plus, on a real move, the named columns
 * cleared so nothing downstream can fall back to the old country.
 */
export function placePatchForFix(
  prev: { geo?: unknown; country?: string | null; region?: string | null } | null,
  fix: Fix,
  thresholdM = MOVE_RESET_M,
): any {
  const geo = geoForFix(prev?.geo, fix, thresholdM);
  const patch: any = { geo, updated_at: new Date().toISOString() };
  if (movedFar(prev?.geo, fix, thresholdM)) {
    patch.country = null;
    patch.region = null;
    /* A stamp is place identity: it obeys the same law as names and never
       travels with coordinates. */
    patch.stamped_at = null;
  }
  return patch;
}
