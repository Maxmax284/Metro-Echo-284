// awareness-geocode: reverse-geocode a place's lat/lon via Nominatim (OpenStreetMap)
// and populate country, region, and city on the awareness_places row.
//
// Safe to call repeatedly — short-circuits if the place already has a country/region
// and `force` is false. Never throws on Nominatim failure: returns a soft error so
// the UI can still operate with raw coords.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  place_id: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { place_id, force } = parsed.data;

    const { data: place, error: pErr } = await supabase
      .from("awareness_places")
      .select("id, user_id, geo, country, region")
      .eq("id", place_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!place) {
      return new Response(JSON.stringify({ error: "place not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (place.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geo = (place.geo ?? {}) as Geo;
    const lat = Number(geo.lat);
    const lon = Number(geo.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(JSON.stringify({ error: "no_coords", reason: "Place has no usable lat/lon" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Short-circuit: already geocoded recently, no force
    if (!force && place.country && place.region && (geo as any).city) {
      return new Response(JSON.stringify({
        skipped: true,
        country: place.country,
        region: place.region,
        city: (geo as any).city,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Nominatim usage policy requires a real User-Agent.
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`;
    let nomi: NominatimResp | null = null;
    let fetchError: string | null = null;
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Vanta Mindful AI (https://vanta.lovable.app) — awareness-geocode",
          "Accept-Language": "en",
        },
      });
      if (!r.ok) {
        fetchError = `nominatim_${r.status}`;
      } else {
        nomi = await r.json() as NominatimResp;
      }
    } catch (e) {
      fetchError = e instanceof Error ? e.message : "fetch_failed";
    }

    if (!nomi || !nomi.address) {
      return new Response(JSON.stringify({
        error: "geocode_failed",
        reason: fetchError ?? "nominatim returned no address",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const country = nomi.address.country ?? null;
    const region = pickRegion(nomi.address);
    const city = pickCity(nomi.address);
    const country_code = nomi.address.country_code?.toUpperCase() ?? null;

    const nextGeo: Geo = {
      ...geo,
      city: city ?? (geo as any).city ?? null,
      country_code: country_code ?? (geo as any).country_code ?? null,
      display_name: nomi.display_name ?? (geo as any).display_name ?? null,
      geocoded_at: new Date().toISOString(),
    };

    const { error: uErr } = await supabase
      .from("awareness_places")
      .update({
        country: country ?? place.country,
        region: region ?? place.region,
        geo: nextGeo,
        updated_at: new Date().toISOString(),
      })
      .eq("id", place_id);
    if (uErr) throw uErr;

    return new Response(JSON.stringify({
      ok: true,
      country: country ?? place.country,
      region: region ?? place.region,
      city,
      country_code,
      display_name: nomi.display_name,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("awareness-geocode error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
