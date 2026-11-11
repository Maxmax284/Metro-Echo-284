// liveFixSources — the one server-side list of geo sources that count as a
// genuine fix. Mirror of LIVE_FIX_SOURCES in src/lib/placeMove.ts (the client
// cannot import from here, so each runtime has exactly one export).
//
// A named or saved place is never the live ground; a stamp outranks a fresher
// unstamped fix because the stamp is the person's deliberate "this is my
// ground", and a real move lifts it (placeMove).
export const LIVE_FIX_SOURCES = ["device", "map_picker", "manual_search", "nearby_suggestion", "manual_fix"];

/** PostgREST `in` filter fragment for geo->>source. */
export function liveFixFilter(): string {
  return `(${LIVE_FIX_SOURCES.map((s) => `"${s}"`).join(",")})`;
}
