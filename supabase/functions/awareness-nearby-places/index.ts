// awareness-nearby-places: given a lat/lon, return ranked nearby populated
// places (towns / villages / suburbs / cities / islands) via Overpass.
// Used by the BadLocationRecoveryPanel to offer tap-to-fix suggestions
// instead of forcing the user to type. Works anywhere on Earth.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { PLACE_CACHE_TTL_MS, PLACE_LOOKUP_TIMEOUT_MS, placeLookupHeaders } from "../_shared/placeSpine.ts";

/* One cache and timeout policy for every place lookup — see _shared/placeSpine. */
const OVERPASS_TTL_MS = PLACE_CACHE_TTL_MS;
const OVERPASS_TIMEOUT_MS = PLACE_LOOKUP_TIMEOUT_MS;

// Search radii (m). Expand until we get land hits, so offshore pins still recover.
const RADII = [15_000, 50_000, 150_000];
const MAX_RESULTS = 10;

const BodySchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
});

type NearbyPlace = {
  name: string;
  local_name?: string | null;
  kind: string; // city|town|village|suburb|hamlet|island
  lat: number;
  lon: number;
  distance_m: number;
  admin?: string | null; // region/state/island context, if discoverable
};

function cellKey(lat: number, lon: number): string {
  // ~5km grid — generous so we hit cache often even after small drift.
  return `near:${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function haversine(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000;
  const dLat = ((la2 - la1) * Math.PI) / 180;
  const dLon = ((lo2 - lo1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((la1 * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Order places: cities/towns first, then villages, then suburbs/hamlets/islands.
const KIND_RANK: Record<string, number> = {
  city: 0,
  town: 1,
  village: 2,
  suburb: 3,
  hamlet: 4,
  island: 5,
};

async function runOverpass(lat: number, lon: number, radius: number): Promise<any[]> {
  const ql =
    `[out:json][timeout:8];` +
    `(` +
    `node(around:${radius},${lat},${lon})[place~"^(city|town|village|suburb|hamlet|island)$"];` +
    `way(around:${radius},${lat},${lon})[place~"^(island|suburb)$"];` +
    `);out tags center 60;`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(ql),
      headers: { ...placeLookupHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const json = await r.json();
    return (json?.elements ?? []) as any[];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchNearby(lat: number, lon: number, admin: any): Promise<NearbyPlace[]> {
  const key = cellKey(lat, lon);
  try {
    const { data: cached } = await admin
      .from("awareness_overpass_cache")
      .select("payload, fetched_at")
      .eq("cell_key", key)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < OVERPASS_TTL_MS) {
      return (cached.payload as { places: NearbyPlace[] })?.places ?? [];
    }
  } catch {/* cache miss */}

  // Expand radius until we have something usable.
  let elements: any[] = [];
  for (const r of RADII) {
    elements = await runOverpass(lat, lon, r);
    if (elements.length >= 3) break;
  }

  // Discover containing island/region from any nearby island element, used as admin hint.
  const islandHit = elements.find((e) => e.tags?.place === "island" && e.tags?.name);
  const islandName: string | null = islandHit?.tags?.["name:en"] ?? islandHit?.tags?.name ?? null;

  const seen = new Set<string>();
  const places: NearbyPlace[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const kind = tags.place;
    const local = tags.name;
    // English first; the local script stays as a quiet second line.
    const name = tags["name:en"] || tags.int_name || tags["name:latin"] || tags.name;
    if (!name || !KIND_RANK.hasOwnProperty(kind)) continue;
    const plat = el.lat ?? el.center?.lat;
    const plon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(plat) || !Number.isFinite(plon)) continue;
    const dedupe = `${kind}:${name.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const adminHint =
      tags["is_in:state"] ||
      tags["is_in:province"] ||
      tags["is_in:island"] ||
      (kind !== "island" ? islandName : null) ||
      null;
    places.push({
      name,
      local_name: local && local !== name ? local : null,
      kind,
      lat: plat,
      lon: plon,
      distance_m: Math.round(haversine(lat, lon, plat, plon)),
      admin: adminHint,
    });
  }

  // Sort: dominant settlements first, then by distance.
  places.sort((a, b) => {
    const ra = KIND_RANK[a.kind] ?? 9;
    const rb = KIND_RANK[b.kind] ?? 9;
    if (ra !== rb) return ra - rb;
    return a.distance_m - b.distance_m;
  });

  const top = places.slice(0, MAX_RESULTS);

  // Cache (service role; cell-keyed so no user data).
  try {
    await admin
      .from("awareness_overpass_cache")
      .upsert({ cell_key: key, payload: { places: top }, fetched_at: new Date().toISOString() });
  } catch {/* non-fatal */}

  return top;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { lat, lon } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const places = await fetchNearby(lat, lon, admin);
    return new Response(JSON.stringify({ places }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
