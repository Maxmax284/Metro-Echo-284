// care-nearby — the care directory around a fix.
//
// Doctrine:
//   - Map records only, through the same Overpass cache every other place lookup
//     uses. Nothing here is scraped from a listings site and nothing is ranked
//     by anything Echo cannot see.
//   - Read only. There is no call arm, no appointment arm.
//   - A silent map is reported as a silent map, never as "no care nearby".
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { PLACE_CACHE_TTL_MS, PLACE_LOOKUP_TIMEOUT_MS, placeLookupHeaders } from "../_shared/placeSpine.ts";
import { CARE_KINDS, careOverpassQL, normalizeCare, type CareKind, type CarePlace } from "../_shared/careFinder.ts";

const RADII = [3_000, 10_000, 30_000];

const BodySchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  kinds: z.array(z.enum(CARE_KINDS.map((k) => k.id) as [CareKind, ...CareKind[]])).optional(),
  radius_m: z.number().min(500).max(50_000).optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

    try {
      const { data: cached } = await admin
        .from("awareness_overpass_cache")
        .select("payload, fetched_at")
        .eq("cell_key", cellKey)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < PLACE_CACHE_TTL_MS) {
        const payload = cached.payload as { places?: CarePlace[]; radius_m?: number };
        return json({ places: payload?.places ?? [], radius_m: payload?.radius_m ?? RADII[0], cached: true });
      }
    } catch {
      /* A cache miss is not a failure. */
    }

    let places: CarePlace[] = [];
    let used = RADII[RADII.length - 1];
    for (const radius of parsed.data.radius_m ? [parsed.data.radius_m] : RADII) {
      const elements = await overpass(careOverpassQL(lat, lon, radius, kinds));
      places = normalizeCare(elements, lat, lon);
      used = radius;
      if (places.length >= 5) break;
    }

    try {
      await admin.from("awareness_overpass_cache").upsert({
        cell_key: cellKey,
        payload: { places, radius_m: used },
        fetched_at: new Date().toISOString(),
      });
    } catch {
      /* Caching is a courtesy, not a requirement. */
    }

    return json({ places, radius_m: used, cached: false });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
