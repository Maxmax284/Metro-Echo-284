// weather-station — the structured sky read for the standalone weather page.
//
// Same law as weatherRead.ts: the sky above the stamped ground is coordinate
// telemetry (Open-Meteo), never a web search. The advisory layer is the active
// local watch's recorded sitrep — a separate field, clearly marked, so a
// forecast and a news item can never blur together on the page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders, jsonResponse, preflight } from "../_shared/http.ts";
import { activeGround, knots, marineLine, rainWindows } from "../_shared/weatherRead.ts";

/* The station reads any genuine fix the person has stamped, not just the one
   active ground — a saved-reading row still never qualifies. */
const LIVE_FIX_SOURCES = ["device", "map_picker", "manual_search", "nearby_suggestion", "manual_fix"];

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** All of the person's genuine grounds, freshest stamp first. */
async function stampedGrounds(admin: ReturnType<typeof createClient>, userId: string) {
  const { data } = await admin
    .from("awareness_places")
    .select("id,label,country,geo,category,stamped_at,updated_at")
    .eq("user_id", userId)
    .filter("geo->>source", "in", `(${LIVE_FIX_SOURCES.map((s) => `"${s}"`).join(",")})`)
    .order("stamped_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(8);
  return ((data ?? []) as Array<Record<string, unknown>>).filter((p) => p.category !== "reading");
}

/** WMO code → plain words (mirror of weatherRead's codeLabel, kept local so
    this endpoint stays self-describing for the page). */
function codeLabel(code: number): string {
  if (code === 0) return "clear sky";
  if (code === 1) return "mostly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "foggy";
  if (code >= 51 && code <= 55) return "drizzle";
  if (code >= 61 && code <= 65) return code >= 65 ? "heavy rain" : "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return code === 82 ? "violent rain showers" : "rain showers";
  if (code === 95) return "thunderstorm";
  if (code === 96 || code === 99) return "thunderstorm with hail";
  return "mixed conditions";
}

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, supabase as never);
    if (!user) return unauthorized();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _user_id: user.id, _bucket: "weather-station", _limit: 30, _window_seconds: 60,
    });
    if (allowed === false) {
      return jsonResponse({ error: "rate_limited" }, 429);
    }

    /* Optional body: { place_id } reads that stamped ground; { mode: "grounds" }
       returns one current-temp line per stamped ground for the Today strip. */
    let placeId: string | null = null;
    let groundsMode = false;
    if (req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object") {
        if (typeof body.place_id === "string" && body.place_id) placeId = body.place_id;
        if (body.mode === "grounds") groundsMode = true;
      }
    }

    if (groundsMode) {
      const grounds = await stampedGrounds(admin, user.id);
      const withCoords = grounds
        .map((p) => ({
          id: String(p.id),
          label: String(p.label ?? ""),
          lat: Number((p.geo as Record<string, unknown> | null)?.lat),
          lon: Number((p.geo as Record<string, unknown> | null)?.lon ??
            (p.geo as Record<string, unknown> | null)?.lng),
        }))
        .filter((p) => p.label && Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (withCoords.length === 0) return jsonResponse({ grounds: [] });

      /* One multi-location call — comma-separated coordinates keep this to a
         single upstream request no matter how many grounds are stamped. */
      const gUrl =
        `https://api.open-meteo.com/v1/forecast?latitude=${withCoords.map((p) => p.lat).join(",")}` +
        `&longitude=${withCoords.map((p) => p.lon).join(",")}` +
        `&current=temperature_2m,weather_code&forecast_days=1&timezone=auto`;
      const gr = await fetch(gUrl);
      if (!gr.ok) return jsonResponse({ error: "telemetry_down" }, 502);
      const gm = await gr.json();
      const readings = Array.isArray(gm) ? gm : [gm];
      return jsonResponse({
        grounds: withCoords.map((p, i) => {
          const cur = readings[i]?.current ?? {};
          return {
            ...p,
            tempC: Number(cur.temperature_2m ?? NaN),
            code: Number(cur.weather_code ?? 0),
            condition: codeLabel(Number(cur.weather_code ?? 0)),
            checkedLocal: String(cur.time ?? ""),
          };
        }),
        generatedAt: new Date().toISOString(),
      });
    }

    let ground = await activeGround(admin, { userId: user.id, orgId: null });
    if (placeId) {
      const grounds = await stampedGrounds(admin, user.id);
      const picked = grounds.find((p) => String(p.id) === placeId);
      if (!picked) return jsonResponse({ error: "place_not_found" }, 404);
      const lat = Number((picked.geo as Record<string, unknown> | null)?.lat);
      const lon = Number((picked.geo as Record<string, unknown> | null)?.lon ??
        (picked.geo as Record<string, unknown> | null)?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return jsonResponse({ error: "place_has_no_coordinates" }, 200);
      }
      ground = {
        id: String(picked.id),
        label: String(picked.label ?? ""),
        country: (picked.country as string | null) ?? null,
        region: null,
        lat,
        lon,
        stampedAt: (picked.stamped_at as string | null) ?? null,
      };
    }
    if (!ground) {
      return jsonResponse({ error: "no_ground" }, 200);
    }

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${ground.lat}&longitude=${ground.lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m` +
      `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min&forecast_days=2&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) return jsonResponse({ error: "telemetry_down" }, 502);
    const m = await r.json();

    const now = m.current;
    const localNow: string = now.time;

    /* Next 24 local hours, one object each — the page draws the strip. */
    const hours: Array<{ t: string; tempC: number; precipPct: number; code: number; windKmh: number }> = [];
    const times: string[] = m.hourly?.time ?? [];
    for (let i = 0; i < times.length && hours.length < 24; i++) {
      if (times[i] < localNow) continue;
      hours.push({
        t: times[i],
        tempC: Number(m.hourly.temperature_2m?.[i] ?? NaN),
        precipPct: Number(m.hourly.precipitation_probability?.[i] ?? 0),
        code: Number(m.hourly.weather_code?.[i] ?? 0),
        windKmh: Number(m.hourly.wind_speed_10m?.[i] ?? 0),
      });
    }

    const maxWindNext12 = Math.max(
      ...hours.slice(0, 12).map((h) => h.windKmh),
      Number(now.wind_speed_10m ?? 0),
    );

    const windows = rainWindows(
      times,
      m.hourly?.precipitation_probability ?? [],
      localNow,
    );

    /* The advisory layer: the newest open web_search watch whose goal names
       this ground. A recorded sitrep with its check time — never blended into
       the telemetry numbers. Place names drift between spellings ("Ko Samui"
       vs "Koh Samui"), so the match tries the full first segment and the
       distinctive last word of it, and keeps only genuine hits. */
    const segment = ground.label.split(",")[0].trim();
    const words = segment.split(/\s+/).filter(Boolean);
    const lastWord = words[words.length - 1] ?? segment;
    const candidates = [...new Set([segment, ...(lastWord.length >= 4 ? [lastWord] : [])])];
    const { data: watchRows } = await admin
      .from("watches")
      .select("id,goal,state,last_read,last_check_at,next_check_at")
      .eq("user_id", user.id)
      .eq("kind", "web_search")
      .in("state", ["on_it", "watching", "waiting", "needs_you"])
      .or(candidates.map((c) => `goal.ilike.%${c}%`).join(","))
      .order("last_check_at", { ascending: false, nullsFirst: false })
      .limit(5);
    const watch = ((watchRows ?? []) as Array<{ goal: string } & Record<string, unknown>>)
      .find((w) => candidates.some((c) => w.goal.toLowerCase().includes(c.toLowerCase()))) ?? null;

    return jsonResponse({
      place: {
        label: ground.label,
        country: ground.country,
        region: ground.region,
        lat: ground.lat,
        lon: ground.lon,
        stampedAt: ground.stampedAt,
      },
      checkedLocal: localNow,
      current: {
        tempC: Number(now.temperature_2m),
        feelsC: Number(now.apparent_temperature),
        humidityPct: Number(now.relative_humidity_2m ?? 0),
        code: Number(now.weather_code),
        condition: codeLabel(Number(now.weather_code)),
        windKmh: Number(now.wind_speed_10m),
        windKn: Math.round(knots(Number(now.wind_speed_10m))),
        windDir: compass(Number(now.wind_direction_10m ?? 0)),
      },
      today: {
        hiC: Number(m.daily?.temperature_2m_max?.[0] ?? NaN),
        loC: Number(m.daily?.temperature_2m_min?.[0] ?? NaN),
      },
      hours,
      rainWindows: windows,
      marine: marineLine(maxWindNext12),
      watch: watch
        ? {
            id: watch.id,
            goal: watch.goal,
            state: watch.state,
            sitrep: watch.last_read ?? null,
            checkedAt: watch.last_check_at ?? null,
            nextCheckAt: watch.next_check_at ?? null,
          }
        : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[weather-station]", e);
    return jsonResponse({ error: "weather_station_failed" }, 500);
  }
});
