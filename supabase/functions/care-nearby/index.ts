// care-nearby — the care directory around a fix.
//
// Doctrine:
//   - Two providers, one shape. Google's place records answer first because they
//     carry the chain pharmacies and urgent-care rooms a street actually has;
//     OpenStreetMap answers when Google cannot. The panel says which one spoke.
//   - Read only. There is no call arm, no appointment arm.
//   - A silent provider is reported as a silent provider, never as "no care
//     nearby". A field a provider did not carry stays blank.
//   - Cached per cell so a street is paid for once, with the reading time on it.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { PLACE_CACHE_TTL_MS, PLACE_LOOKUP_TIMEOUT_MS, placeLookupHeaders } from "../_shared/placeSpine.ts";
import {
  CARE_KINDS,
  careOverpassQL,
  googleCareTypes,
  normalizeCare,
  normalizeGoogleCare,
  type CareKind,
  type CarePlace,
} from "../_shared/careFinder.ts";

const RADII = [3_000, 10_000, 30_000];
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

const BodySchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  kinds: z.array(z.enum(CARE_KINDS.map((k) => k.id) as [CareKind, ...CareKind[]])).optional(),
  radius_m: z.number().min(500).max(50_000).optional(),
  /** Read again even when the cell was read recently. */
  refresh: z.boolean().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * One kind group at a time. Asking for everything at once and taking the twenty
 * nearest buries the pharmacy under a street of dentists, so each group is asked
 * for on its own and the answers are merged.
 */
async function googleGroup(
  lat: number,
  lon: number,
  radius: number,
  types: string[],
): Promise<CarePlace[] | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) return null;

  const res = await fetch(`${GATEWAY_URL}/places/v1/places:searchNearby`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.primaryType",
        "places.types",
        "places.nationalPhoneNumber",
        "places.regularOpeningHours.weekdayDescriptions",
      ].join(","),
    },
    body: JSON.stringify({
      includedTypes: googleCareTypes(kinds),
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`google_maps searchNearby failed [${res.status}]: ${body}`);
    return null;
  }
  const payload = await res.json();
  return normalizeGoogleCare((payload?.places ?? []) as unknown[], lat, lon);
}

/** OpenStreetMap, the fallback. An empty answer is an empty answer. */
async function overpass(ql: string): Promise<unknown[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PLACE_LOOKUP_TIMEOUT_MS);
  try {
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(ql),
      headers: { ...placeLookupHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      signal: ctrl.signal,
    });
    if (!r.ok) return [];
    const body = await r.json();
    return (body?.elements ?? []) as unknown[];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { lat, lon } = parsed.data;
    /* Every kind, unless the caller narrowed it. Narrowing on the client is a
       filter over what came back; narrowing here is a smaller query. */
    const kinds = (parsed.data.kinds?.length ? parsed.data.kinds : CARE_KINDS.map((k) => k.id)) as CareKind[];

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const kindKey = [...kinds].sort().join("+");
    const cellKey = `care:${lat.toFixed(2)},${lon.toFixed(2)}:${kindKey}`;

    if (!parsed.data.refresh) {
      try {
        const { data: cached } = await admin
          .from("awareness_overpass_cache")
          .select("payload, fetched_at")
          .eq("cell_key", cellKey)
          .maybeSingle();
        const payload = cached?.payload as { places?: CarePlace[]; radius_m?: number; source?: string } | undefined;
        const fresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < PLACE_CACHE_TTL_MS;
        /* An empty cached answer is not worth keeping — read again rather than
           repeat "nothing here" for a whole day. */
        if (fresh && (payload?.places?.length ?? 0) > 0) {
          return json({
            places: payload?.places ?? [],
            radius_m: payload?.radius_m ?? RADII[0],
            source: payload?.source ?? "osm",
            cached: true,
          });
        }
      } catch {
        /* A cache miss is not a failure. */
      }
    }

    let places: CarePlace[] = [];
    let used = RADII[RADII.length - 1];
    let source = "google";
    const radii = parsed.data.radius_m ? [parsed.data.radius_m] : RADII;

    /* Google first, widening only while the street looks empty. */
    for (const radius of radii) {
      const rows = await googleNearby(lat, lon, radius, kinds);
      used = radius;
      if (rows === null) {
        source = "osm";
        break;
      }
      places = rows;
      if (places.length >= 5) break;
    }

    /* OpenStreetMap answers when Google could not be asked, or carried nothing. */
    if (places.length === 0) {
      source = "osm";
      for (const radius of radii) {
        const elements = await overpass(careOverpassQL(lat, lon, radius, kinds));
        places = normalizeCare(elements, lat, lon);
        used = radius;
        if (places.length >= 5) break;
      }
    }

    if (places.length > 0) {
      try {
        await admin.from("awareness_overpass_cache").upsert({
          cell_key: cellKey,
          payload: { places, radius_m: used, source },
          fetched_at: new Date().toISOString(),
        });
      } catch {
        /* Caching is a courtesy, not a requirement. */
      }
    }

    return json({ places, radius_m: used, source, cached: false });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
