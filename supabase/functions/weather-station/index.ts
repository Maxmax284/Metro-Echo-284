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

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
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

    const ground = await activeGround(admin, { userId: user.id, orgId: null });
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
       the telemetry numbers. */
    const token = ground.label.split(",")[0].trim();
    const { data: watchRows } = await admin
      .from("watches")
      .select("id,goal,state,last_read,last_check_at,next_check_at")
      .eq("user_id", user.id)
      .eq("kind", "web_search")
      .in("state", ["on_it", "watching", "waiting", "needs_you"])
      .ilike("goal", `%${token}%`)
      .order("last_check_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const watch = (watchRows ?? [])[0] ?? null;

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
