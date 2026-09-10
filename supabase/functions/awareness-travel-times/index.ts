// awareness-travel-times: real driving time from one fix to a set of places.
//
// Recorded ground truth only. Durations come from OSRM road routing (the same
// public map data the nearby lookup uses) — never estimated from straight-line
// distance. A destination the router cannot reach comes back with null, and the
// UI says so instead of guessing.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { PLACE_LOOKUP_TIMEOUT_MS, placeLookupHeaders } from "../_shared/placeSpine.ts";

const TTL_MS = 6 * 60 * 60 * 1000; // roads don't move; traffic isn't claimed here.
const MAX_TARGETS = 12;

const Coord = z.object({ lat: z.number().gte(-90).lte(90), lon: z.number().gte(-180).lte(180) });
const BodySchema = z.object({
  from: Coord,
  to: z.array(Coord.extend({ id: z.string().min(1) })).min(1).max(MAX_TARGETS),
});

type Leg = { id: string; duration_s: number | null; distance_m: number | null };

function key(from: { lat: number; lon: number }, to: Array<{ lat: number; lon: number }>): string {
  const pt = (c: { lat: number; lon: number }) => `${c.lat.toFixed(3)},${c.lon.toFixed(3)}`;
  return `route:${pt(from)}|${to.map(pt).join(";")}`;
}

async function osrmTable(
  from: { lat: number; lon: number },
  to: Array<{ id: string; lat: number; lon: number }>,
): Promise<Leg[]> {
  const coords = [from, ...to].map((c) => `${c.lon},${c.lat}`).join(";");
  const url =
    `https://router.project-osrm.org/table/v1/driving/${coords}` +
    `?sources=0&annotations=duration,distance`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PLACE_LOOKUP_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: placeLookupHeaders(), signal: ctrl.signal });
    if (!r.ok) return to.map((t) => ({ id: t.id, duration_s: null, distance_m: null }));
    const json = await r.json();
    const durations: Array<number | null> = json?.durations?.[0] ?? [];
    const distances: Array<number | null> = json?.distances?.[0] ?? [];
    return to.map((t, i) => {
      const d = durations[i + 1];
      const m = distances[i + 1];
      return {
        id: t.id,
        duration_s: Number.isFinite(Number(d)) ? Math.round(Number(d)) : null,
        distance_m: Number.isFinite(Number(m)) ? Math.round(Number(m)) : null,
      };
    });
  } catch {
    return to.map((t) => ({ id: t.id, duration_s: null, distance_m: null }));
  } finally {
    clearTimeout(timer);
  }
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
    const { from, to } = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cacheKey = key(from, to);
    try {
      const { data: cached } = await admin
        .from("awareness_overpass_cache")
        .select("payload, fetched_at")
        .eq("cell_key", cacheKey)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
        return new Response(
          JSON.stringify({ legs: (cached.payload as { legs: Leg[] })?.legs ?? [], mode: "driving", cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch {/* cache miss is fine */}

    const legs = await osrmTable(from, to);

    try {
      await admin
        .from("awareness_overpass_cache")
        .upsert({ cell_key: cacheKey, payload: { legs }, fetched_at: new Date().toISOString() });
    } catch {/* non-fatal */}

    return new Response(JSON.stringify({ legs, mode: "driving", cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
