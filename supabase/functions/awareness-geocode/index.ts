import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// awareness-geocode: reverse-geocode a place's lat/lon via Nominatim (OpenStreetMap)
// and populate country, region, and city on the awareness_places row.
//
// Safe to call repeatedly — short-circuits if the place already has a country/region
// and `force` is false. Never throws on Nominatim failure: returns a soft error so
// the UI can still operate with raw coords.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { placeLookupHeaders } from "../_shared/placeSpine.ts";

// ---------- Overpass cache (server-only) -----------------------------------
const OVERPASS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OVERPASS_TIMEOUT_MS = 8000;

function cellKey(lat: number, lon: number): string {
  // ~110m grid via 3 decimal rounding
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

type OverpassSanity = {
  sanity: "land_nearby" | "offshore_confirmed" | "unresolved";
  nearest_place?: { name: string; type: string; distance_m: number } | null;
  coastline_nearby?: boolean;
  fetched_at: string;
};

async function fetchOverpassSanity(lat: number, lon: number, admin: any): Promise<OverpassSanity | null> {
  const key = cellKey(lat, lon);
  try {
    const { data: cached } = await admin
      .from("awareness_overpass_cache")
      .select("payload, fetched_at")
      .eq("cell_key", key)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < OVERPASS_TTL_MS) {
      return cached.payload as OverpassSanity;
    }
  } catch {/* ignore cache miss */}

  const ql = `[out:json][timeout:8];(node(around:3000,${lat},${lon})[place~"island|town|village|city|hamlet|suburb"];way(around:5000,${lat},${lon})[natural=coastline];);out tags center 10;`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS);
  let json: any = null;
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(ql),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: ctrl.signal,
    });
    if (!r.ok) return null;
    json = await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  const elements = (json?.elements ?? []) as any[];
  const places = elements.filter((e) => e.tags?.place && (e.type === "node" || e.center));
  const coast = elements.some((e) => e.tags?.natural === "coastline");

  // Haversine
  const dist = (la2: number, lo2: number) => {
    const R = 6371000;
    const dLat = ((la2 - lat) * Math.PI) / 180;
    const dLon = ((lo2 - lon) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((la2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  };

  let nearest: OverpassSanity["nearest_place"] = null;
  for (const p of places) {
    const plat = p.lat ?? p.center?.lat;
    const plon = p.lon ?? p.center?.lon;
    if (!Number.isFinite(plat) || !Number.isFinite(plon)) continue;
    const d = dist(plat, plon);
    if (!nearest || d < nearest.distance_m) {
      nearest = { name: p.tags["name:en"] ?? p.tags.int_name ?? p.tags.name ?? p.tags.place, type: p.tags.place, distance_m: Math.round(d) };
    }
  }

  const sanity: OverpassSanity = nearest
    ? { sanity: "land_nearby", nearest_place: nearest, coastline_nearby: coast, fetched_at: new Date().toISOString() }
    : coast
      ? { sanity: "offshore_confirmed", nearest_place: null, coastline_nearby: true, fetched_at: new Date().toISOString() }
      : { sanity: "unresolved", nearest_place: null, coastline_nearby: false, fetched_at: new Date().toISOString() };

  try {
    await admin
      .from("awareness_overpass_cache")
      .upsert({ cell_key: key, payload: sanity, fetched_at: new Date().toISOString() });
  } catch {/* ignore cache write failures */}

  return sanity;
}




/* Two ways in, one reverse-lookup behind them: a saved place (which gets its
   row updated) or a bare pin the person is dragging (answered, never stored).
   The map picker used to call Nominatim straight from the browser with its own
   headers, which is how the app and the server ended up disagreeing about the
   same coordinates. */
const Body = z.object({
  place_id: z.string().uuid().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  force: z.boolean().optional().default(false),
}).refine(
  (b) => Boolean(b.place_id) || (typeof b.lat === "number" && typeof b.lon === "number"),
  { message: "give either place_id or lat and lon" },
);

type Geo = { lat?: number; lon?: number; acc?: number; [k: string]: unknown };

type NominatimResp = {
  address?: {
    country?: string;
    country_code?: string;
    state?: string;
    region?: string;
    province?: string;
    county?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    hamlet?: string;
  };
  display_name?: string;
  error?: string;
};

function pickRegion(a: NominatimResp["address"]): string | null {
  if (!a) return null;
  return a.state ?? a.region ?? a.province ?? a.county ?? null;
}

function pickCity(a: NominatimResp["address"]): string | null {
  if (!a) return null;
  return (
    a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.hamlet ?? null
  );
}

/* A label that names a different town than the lookup just returned is a
   leftover from before a move ("Bangkok" over a Ko Samui pin). Replace it with
   the resolved town. Labels the person clearly chose (home, work, a spot they
   named) are left alone unless they are just an old city name. */
function labelPatch(place: any, city: string | null, region: string | null): { label: string } | null {
  if (!place || !city) return null;
  const label = String(place.label ?? "").trim();
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
  if (!label) return { label: city };
  if (norm(label) === norm(city)) return null;
  const autoish = /^(current|here|spot |pin|unknown|location)/i.test(label) || place.kind === "current";
  const looksLikeCity = /^[A-Za-z .'-]{2,40}$/.test(label) && label.split(" ").length <= 3;
  if (autoish || (looksLikeCity && region && !norm(region).includes(norm(label)))) return { label: city };
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { place_id, force } = parsed.data;
    const pinMode = !place_id;

    const { data: place, error: pErr } = pinMode
      ? { data: null, error: null }
      : await supabase
      .from("awareness_places")
      .select("id, user_id, geo, country, region, label, kind")
      .eq("id", place_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!place && !pinMode) {
      return new Response(JSON.stringify({ error: "place not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (place && place.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geo = (place?.geo ?? {}) as Geo;
    const lat = pinMode ? Number(parsed.data.lat) : Number(geo.lat);
    const lon = pinMode ? Number(parsed.data.lon) : Number(geo.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(JSON.stringify({ error: "no_coords", reason: "Place has no usable lat/lon" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Short-circuit: already geocoded recently, no force
    if (!pinMode && !force && place!.country && place!.region && (geo as any).city) {
      return new Response(JSON.stringify({
        skipped: true,
        country: place!.country,
        region: place!.region,
        city: (geo as any).city,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Nominatim usage policy requires a real User-Agent. Header values must be
    // ASCII, or the request fails before it ever leaves.
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1&accept-language=en`;
    let nomi: NominatimResp | null = null;
    let fetchError: string | null = null;
    let lookupSource = "nominatim";
    try {
      const r = await fetch(url, {
        headers: placeLookupHeaders(),
      });
      if (!r.ok) {
        fetchError = `nominatim_${r.status}`;
      } else {
        nomi = await r.json() as NominatimResp;
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "fetch_failed";
    }

    /* One place-name service being busy must not leave a person's place
       nameless. Photon reads the same OpenStreetMap data, so the second try is
       the same truth from another door. */
    if (!nomi || !nomi.address) {
      console.error("[vanta] first place lookup failed:", fetchError ?? "no address in response");
      try {
        const r2 = await fetch(
          `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=en`,
          { headers: placeLookupHeaders() },
        );
        if (r2.ok) {
          const j2 = await r2.json();
          const pr = j2?.features?.[0]?.properties ?? null;
          if (pr && (pr.country || pr.city || pr.state)) {
            lookupSource = "photon";
            nomi = {
              address: {
                country: pr.country ?? undefined,
                country_code: pr.countrycode ?? undefined,
                state: pr.state ?? undefined,
                county: pr.county ?? undefined,
                city: pr.city ?? pr.district ?? undefined,
                suburb: pr.district ?? undefined,
              },
              display_name: [pr.name, pr.city, pr.state, pr.country].filter(Boolean).join(", "),
            };
          } else {
            fetchError = fetchError ?? "photon_no_match";
          }
        } else {
          fetchError = `${fetchError ?? "nominatim_failed"}+photon_${r2.status}`;
        }
      } catch (e) {
        fetchError = `${fetchError ?? "nominatim_failed"}+${e instanceof Error ? e.message : "photon_failed"}`;
      }
    }

    if (!nomi || !nomi.address) {
      console.error("[vanta] place lookup failed:", fetchError ?? "no address in response");
      return new Response(JSON.stringify({
        error: "geocode_failed",
        reason: fetchError ?? "no address came back",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let country = nomi.address.country ?? null;
    let region = pickRegion(nomi.address);
    let city = pickCity(nomi.address);
    const country_code = nomi.address.country_code?.toUpperCase() ?? null;

    // Overpass sanity layer — only when Nominatim returned no country/region.
    let sanity: OverpassSanity | null = null;
    if (!country && !region) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      sanity = await fetchOverpassSanity(lat, lon, admin);
      if (sanity?.sanity === "land_nearby" && sanity.nearest_place) {
        // Synthesize a city/region from the closest land feature so the UI
        // can stop saying "unknown". Do NOT invent a country.
        city = city ?? sanity.nearest_place.name;
        region = region ?? sanity.nearest_place.name;
      }
    }

    const nextGeo: Geo = {
      ...geo,
      city: city ?? (geo as any).city ?? null,
      country_code: country_code ?? (geo as any).country_code ?? null,
      display_name: nomi.display_name ?? (geo as any).display_name ?? null,
      geocoded_at: new Date().toISOString(),
      geocode_source: lookupSource,
      sanity: sanity?.sanity ?? (geo as any).sanity ?? null,
      sanity_meta: sanity ?? (geo as any).sanity_meta ?? null,
    };

    /* A dragged pin is a question, not a saved place. Answer it and store
       nothing. */
    if (!pinMode) {
      const { error: uErr } = await supabase
        .from("awareness_places")
        .update({
          country: country ?? place!.country,
          region: region ?? place!.region,
          geo: nextGeo,
          ...(labelPatch(place, city, region) ?? {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", place_id!);
      if (uErr) throw uErr;
    }

    return new Response(JSON.stringify({
      ok: true,
      country: country ?? place?.country ?? null,
      region: region ?? place?.region ?? null,
      city,
      country_code,
      display_name: nomi.display_name,
      sanity: sanity?.sanity ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("awareness-geocode error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
