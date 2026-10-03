/**
 * watchPlace — where is this watch actually about?
 *
 * A conditions watch reads the sky over the place it names, not over wherever
 * the person happens to be standing. The resolver walks an honest ladder:
 *
 *   1. Stamped grounds (genuine fixes, never reading rows) — the person's own
 *      deliberate ground; these matches carry the lock-in privilege.
 *   2. Any named place on the person's board with coordinates — saved spots
 *      included, because the watch itself names the place; reading a saved
 *      row's coordinates for its own watch never moves the app's ground.
 *   3. The watch's own words geocoded through Open-Meteo (cached in
 *      api_cache — hits for 7 days, misses for 24 hours, so the hourly tick
 *      never re-geocodes). A geocode is only accepted when the answer shares
 *      a real word with the candidate, so "What's going on with the Bangkok
 *      flooding" resolves to Bangkok, not to a lucky guess.
 *
 * Returns null when no tier can pin the place — the caller then falls back to
 * the active stamped ground (a watch about "here" still reads home).
 */
import { fetchMeteo, weatherRead, weatherText, type MeteoData, type ScopeArgs } from "./weatherRead.ts";

// Structural client type, same trick as weatherRead.ts — importable from Deno
// edge functions and from the Vite/vitest typecheck alike.
type SupabaseClient = { from: (table: string) => any };

export type WatchPlace = {
  label: string;
  note: string;
  lat: number;
  lon: number;
  /** True only for tier 1 — a genuine fix. The lock-in belongs to these. */
  isStampedGround: boolean;
};

/* Mirror of LIVE_FIX_SOURCES in src/lib/placeMove.ts — the exact list the
   app's own active-place read accepts. */
const LIVE_FIX_SOURCES = ["device", "map_picker", "manual_search", "nearby_suggestion", "manual_fix"];

/** Name candidates for a place label — same drift tolerance as the station
    page ("Ko Samui" vs "Koh Samui"): full first segment plus the distinctive
    last word when it is long enough to be safe. */
export function nameCandidates(label: string): string[] {
  const segment = label.split(",")[0].trim();
  const words = segment.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] ?? segment;
  return [...new Set([segment, ...(lastWord.length >= 4 ? [lastWord] : [])])];
}

function coordsOf(row: Record<string, unknown>): { lat: number; lon: number } | null {
  const geo = row.geo as Record<string, unknown> | null;
  const lat = Number(geo?.lat);
  const lon = Number(geo?.lon ?? geo?.lng);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function matchesLabel(haystack: string, label: string): boolean {
  return nameCandidates(label).some((c) => haystack.includes(c.toLowerCase()));
}

/**
 * Place candidates in the watch's own words: quoted phrases first (a person
 * quotes the thing they care about), then capitalized runs inside them
 * ("Bangkok" inside "What's going on with the Bangkok flooding"), then the
 * "for X / in X / around X" tail of a sentence. Each candidate is tried as
 * written and as its first comma segment.
 */
function placeCandidates(text: string): string[] {
  const out: string[] = [];
  const push = (raw: string) => {
    const cleaned = raw.trim().replace(/[,.;:!?]+$/, "").trim();
    if (cleaned.length >= 3 && cleaned.length <= 60) out.push(cleaned);
    const segment = cleaned.split(",")[0]?.trim();
    if (segment && segment.length >= 3 && segment !== cleaned) out.push(segment);
  };
  for (const m of text.matchAll(/[“"]([^”"]{3,60})[”"]/g)) {
    push(m[1]);
    for (const w of m[1].matchAll(/\b([A-Z][\p{L}]{3,}(?:\s+[A-Z][\p{L}]{2,})*)\b/gu)) push(w[1]);
  }
  for (const m of text.matchAll(/(?:\bfor|\bin|\baround)\s+([\p{L}][\p{L} .'-]{2,50})/gu)) push(m[1]);
  return [...new Set(out)].slice(0, 8);
}

/** The geocode hit must share a real word with the candidate — otherwise it
    is the geocoder guessing, and a guess never writes the sitrep. */
function geocodeConfirms(candidate: string, hitName: string): boolean {
  const words = candidate.toLowerCase().match(/[\p{L}]{4,}/gu) ?? [];
  const hit = hitName.toLowerCase();
  return words.some((w) => hit.includes(w));
}

async function geocodeCached(
  sb: SupabaseClient,
  userId: string,
  candidate: string,
): Promise<{ label: string; lat: number; lon: number; country: string | null } | null> {
  const key = candidate.toLowerCase().replace(/\s+/g, " ").trim();
  const now = new Date();
  const { data: cached } = await sb
    .from("api_cache")
    .select("result_json, expires_at")
    .eq("owner_id", userId)
    .eq("provider", "open-meteo")
    .eq("feature", "watch-place-geocode")
    .eq("query_hash", key)
    .maybeSingle();
  if (cached && new Date(cached.expires_at) > now) {
    const j = cached.result_json as { miss?: boolean; label?: string; lat?: number; lon?: number; country?: string | null };
    if (j?.miss) return null;
    if (j && Number.isFinite(j.lat) && Number.isFinite(j.lon)) {
      return { label: String(j.label ?? candidate), lat: Number(j.lat), lon: Number(j.lon), country: j.country ?? null };
    }
  }

  let hit: { label: string; lat: number; lon: number; country: string | null } | null = null;
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(candidate)}&count=1&language=en&format=json`,
    );
    if (r.ok) {
      const j = await r.json().catch(() => null);
      const g = j?.results?.[0];
      if (g && Number.isFinite(Number(g.latitude)) && Number.isFinite(Number(g.longitude)) &&
        geocodeConfirms(candidate, String(g.name ?? ""))) {
        hit = {
          label: String(g.name ?? candidate),
          lat: Number(g.latitude),
          lon: Number(g.longitude),
          country: g.country ? String(g.country) : null,
        };
      }
    }
  } catch {
    hit = null;
  }

  /* Cache the answer either way: a hit rests for a week, a miss for a day,
     so the hourly tick never hammers the geocoder on an unplaceable goal. */
  await sb.from("api_cache").upsert({
    owner_id: userId,
    provider: "open-meteo",
    feature: "watch-place-geocode",
    query_hash: key,
    normalized_query: candidate,
    result_json: hit ?? { miss: true },
    expires_at: new Date(now.getTime() + (hit ? 7 : 1) * 86400_000).toISOString(),
  }, { onConflict: "owner_id,provider,feature,query_hash" });
  return hit;
}

/**
 * Resolve the place a conditions watch is about. `text` is the goal plus the
 * watch's search query — everything the watch says about itself.
 */
export async function resolveWatchPlace(
  sb: SupabaseClient,
  userId: string,
  text: string,
): Promise<WatchPlace | null> {
  const haystack = text.toLowerCase();

  /* Tier 1 — stamped grounds only, freshest stamp first. */
  const { data: stamped } = await sb
    .from("awareness_places")
    .select("id,label,geo,category")
    .eq("user_id", userId)
    .filter("geo->>source", "in", `(${LIVE_FIX_SOURCES.map((s) => `"${s}"`).join(",")})`)
    .order("stamped_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(10);
  for (const row of (stamped ?? []) as Array<Record<string, unknown>>) {
    if (row.category === "reading") continue;
    const label = String(row.label ?? "");
    if (!label || !matchesLabel(haystack, label)) continue;
    const c = coordsOf(row);
    if (c) return { label, note: "your stamped ground", ...c, isStampedGround: true };
  }

  /* Tier 2 — any named place on the board with coordinates. The watch names
     the place, so a saved row's coordinates are the right sky to read; this
     never changes what the app treats as the live ground. */
  const { data: places } = await sb
    .from("awareness_places")
    .select("id,label,geo,category")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(25);
  for (const row of (places ?? []) as Array<Record<string, unknown>>) {
    const label = String(row.label ?? "");
    if (!label || !matchesLabel(haystack, label)) continue;
    const c = coordsOf(row);
    if (c) return { label, note: "a place on your board", ...c, isStampedGround: false };
  }

  /* Tier 3 — the watch's own words, geocoded and cached. */
  for (const candidate of placeCandidates(text)) {
    const geo = await geocodeCached(sb, userId, candidate);
    if (geo) {
      return {
        label: geo.country ? `${geo.label}, ${geo.country}` : geo.label,
        note: "the place the watch names",
        lat: geo.lat,
        lon: geo.lon,
        isStampedGround: false,
      };
    }
  }
  return null;
}

/**
 * Telemetry for a watch: its own place's sky when one resolves, otherwise the
 * active stamped ground (a watch about "here"). Composed exactly the way the
 * sitrep board expects — the same weatherText every surface reads.
 */
export async function watchTelemetry(
  sb: SupabaseClient,
  scope: ScopeArgs,
  watchText_: string,
): Promise<string> {
  const place = await resolveWatchPlace(sb, scope.userId, watchText_);
  if (!place) return await weatherRead(sb, scope, {});
  const meteo: MeteoData | null = await fetchMeteo(place.lat, place.lon).catch(() => null);
  if (!meteo?.current) return "";
  return weatherText(place, meteo);
}
