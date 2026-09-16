// airport-places — what is inside a terminal, read from a places provider.
//
// Doctrine:
//   - Signed in only. This costs money per lookup, so an unauthenticated caller
//     gets nothing and no provider call is made.
//   - Cached hard and shared: an airport is an airport for everybody, so one
//     copy is kept per airport and category with the time of the reading on it.
//   - Only what the provider carried. No invented hours, no guessed "open now".
//   - Bounded: one category per call, eight results, no fan-out.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import {
  CACHE_DAYS,
  cacheStale,
  categorySpec,
  normalizePlaces,
  type IntelPlace,
} from "../_shared/airportIntel.ts";
import { airport } from "../_shared/airports.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const BodySchema = z.object({
  iata: z.string().trim().min(3).max(4),
  category: z.string().trim().min(2).max(20),
  /** Force a fresh read even when the cache is young. */
  refresh: z.boolean().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return json({ error: "Sign in first." }, 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const iata = parsed.data.iata.toUpperCase();
    const spec = categorySpec(parsed.data.category);
    if (!spec) return json({ error: "That is not a category Echo reads for." }, 400);

    /* Read the shared cache first. This is the whole cost control. */
    const { data: cached } = await supabase
      .from("airport_places_cache")
      .select("payload, fetched_at")
      .eq("iata", iata)
      .eq("category", spec.key)
      .maybeSingle();

    if (cached && !parsed.data.refresh && !cacheStale(cached.fetched_at)) {
      return json({
        iata,
        category: spec.key,
        places: cached.payload as IntelPlace[],
        fetched_at: cached.fetched_at,
        from_cache: true,
        cache_days: CACHE_DAYS,
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return json({ error: "The places provider is not connected, so Echo has nothing to read." }, 503);
    }

    const known = airport(iata);
    const where = known ? `${known.name} airport ${known.city}` : `${iata} airport`;
    const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.primaryTypeDisplayName",
          "places.currentOpeningHours.openNow",
          "places.regularOpeningHours.weekdayDescriptions",
        ].join(","),
      },
      body: JSON.stringify({ textQuery: `${spec.query} in ${where} terminal`, pageSize: 8 }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`google_maps searchText failed [${res.status}]: ${errorBody}`);
      /* A stale copy beats nothing when you are standing in the terminal. */
      if (cached) {
        return json({
          iata,
          category: spec.key,
          places: cached.payload as IntelPlace[],
          fetched_at: cached.fetched_at,
          from_cache: true,
          stale: true,
          note: "The provider could not be reached just now, so this is the last reading Echo has.",
        });
      }
      return json({ error: "Places request failed", status: res.status, details: errorBody }, res.status);
    }

    const places = normalizePlaces(await res.json(), 8);
    const fetched_at = new Date().toISOString();
    await supabase
      .from("airport_places_cache")
      .upsert({ iata, category: spec.key, payload: places as never, fetched_at }, { onConflict: "iata,category" });

    return json({ iata, category: spec.key, places, fetched_at, from_cache: false, cache_days: CACHE_DAYS });
  } catch (e) {
    console.error("airport-places failed:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown failure" }, 500);
  }
});
