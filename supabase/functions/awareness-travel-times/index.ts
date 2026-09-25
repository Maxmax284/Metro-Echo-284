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
/**
 * A destination is either coordinates already on file, or a written address the
 * calendar recorded. An address is looked up once on the map and cached; a
 * lookup that finds nothing stays null rather than guessing a point.
 */
const Target = z.union([
  Coord.extend({ id: z.string().min(1) }),
  z.object({ id: z.string().min(1), query: z.string().min(2).max(200) }),
]);
const BodySchema = z.object({
  from: Coord,
  to: z.array(Target).min(1).max(MAX_TARGETS),
});

type Leg = { id: string; duration_s: number | null; distance_m: number | null; resolved?: string | null };

/** Written address → a point on the map, cached. Never invented. */
async function geocode(query: string, admin: any): Promise<{ lat: number; lon: number; label: string } | null> {
  const cacheKey = `geo:${query.trim().toLowerCase()}`;
  try {
    const { data: cached } = await admin
      .from("awareness_overpass_cache")
      .select("payload, fetched_at")
      .eq("cell_key", cacheKey)
      .maybeSingle();
    if (cached?.payload) return (cached.payload as { point: any })?.point ?? null;
  } catch {/* cache miss is fine */}

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PLACE_LOOKUP_TIMEOUT_MS);
  let point: { lat: number; lon: number; label: string } | null = null;
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&accept-language=en&limit=1&q=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers: placeLookupHeaders(), signal: ctrl.signal });
    if (r.ok) {
      const rows = await r.json();
      const hit = Array.isArray(rows) ? rows[0] : null;
      const lat = Number(hit?.lat);
      const lon = Number(hit?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        point = { lat, lon, label: String(hit?.display_name ?? query) };
      }
    }
  } catch {
    point = null;
  } finally {
    clearTimeout(timer);
  }

  if (point) {
    try {
      await admin
        .from("awareness_overpass_cache")
        .upsert({ cell_key: cacheKey, payload: { point }, fetched_at: new Date().toISOString() });
    } catch {/* non-fatal */}
  }
  return point;
}

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

    /* Written addresses become points first. One that cannot be found comes back
       as a null leg — the surface says so instead of inventing a drive. */
    const unresolved: Leg[] = [];
    const points: Array<{ id: string; lat: number; lon: number; resolved?: string | null }> = [];
    for (const t of to) {
      if ("lat" in t) {
        points.push({ id: t.id, lat: t.lat, lon: t.lon });
        continue;
      }
      const hit = await geocode(t.query, admin);
      if (hit) points.push({ id: t.id, lat: hit.lat, lon: hit.lon, resolved: hit.label });
      else unresolved.push({ id: t.id, duration_s: null, distance_m: null, resolved: null });
    }
    if (points.length === 0) {
      return new Response(JSON.stringify({ legs: unresolved, mode: "driving", cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cacheKey = key(from, points);
    try {
      const { data: cached } = await admin
        .from("awareness_overpass_cache")
        .select("payload, fetched_at")
        .eq("cell_key", cacheKey)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) {
        return new Response(
          JSON.stringify({
            legs: [...(((cached.payload as { legs: Leg[] })?.legs) ?? []), ...unresolved],
            mode: "driving",
            cached: true,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch {/* cache miss is fine */}

    const routed = await osrmTable(from, points);
    const labelById = new Map(points.map((p) => [p.id, p.resolved ?? null]));
    const legs: Leg[] = routed.map((l) => ({ ...l, resolved: labelById.get(l.id) ?? null }));

    try {
      await admin
        .from("awareness_overpass_cache")
        .upsert({ cell_key: cacheKey, payload: { legs }, fetched_at: new Date().toISOString() });
    } catch {/* non-fatal */}

    return new Response(JSON.stringify({ legs: [...legs, ...unresolved], mode: "driving", cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
