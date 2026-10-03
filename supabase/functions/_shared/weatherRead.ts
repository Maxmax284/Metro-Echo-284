/**
 * Live weather for the person's actual ground — telemetry, not news.
 *
 * The rule this file exists to enforce: the sky above you is structured data
 * (Open-Meteo for the stamped coordinates), never a web search that returns
 * month-old flood warnings and travel articles. Research is for what the
 * telemetry cannot say — advisories, disruptions, incidents — and an active
 * local watch carries those.
 *
 * Shared by Echo and Telegram through echoReads.ts, so both surfaces read the
 * same sky the same way.
 */
// Structural client type: keeps this module importable from both Deno (edge)
// and the Vite/vitest typecheck, which can't resolve npm: specifiers.
type SupabaseClient = { from: (table: string) => any };

export type ScopeArgs = { userId: string; orgId: string | null };

export type GroundPlace = {
  id: string;
  label: string;
  country: string | null;
  region: string | null;
  lat: number;
  lon: number;
  stampedAt: string | null;
};

/* Mirror of LIVE_FIX_SOURCES in src/lib/placeMove.ts and the awareness-query
   resolver — the exact list the app's own active-place read accepts. A named
   or saved place is never the live ground; a stamp outranks a fresher
   unstamped fix because the stamp is the person's deliberate "this is my
   ground". */
const LIVE_FIX_SOURCES = ["device", "map_picker", "manual_search", "nearby_suggestion", "manual_fix"];

/**
 * The one resolver for "where is this person standing". Stamped ground first,
 * then the freshest genuine fix; reading/saved rows never teleport the answer.
 */
export async function activeGround(sb: SupabaseClient, _scope: ScopeArgs): Promise<GroundPlace | null> {
  const { data } = await sb
    .from("awareness_places")
    .select("id,label,country,region,geo,stamped_at,category")
    .filter("geo->>source", "in", `(${LIVE_FIX_SOURCES.map((s) => `"${s}"`).join(",")})`)
    .order("stamped_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(5);
  const row = (data ?? []).find((r: any) => r?.category !== "reading") as any;
  if (!row) return null;
  const lat = Number(row.geo?.lat);
  const lon = Number(row.geo?.lon ?? row.geo?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    id: String(row.id),
    label: String(row.label ?? "your stamped ground"),
    country: row.country ?? row.geo?.country ?? null,
    region: row.region ?? null,
    lat,
    lon,
    stampedAt: row.stamped_at ?? null,
  };
}

/** "What's the weather" family — the trigger for the telemetry read. */
const WEATHER_WORDS =
  /\b(weather|forecast|raining|rain|storm|thunderstorm|sunny|cloud(y|s)|overcast|temperature|how hot|how cold|humid|wind(y)?|sea (state|conditions)|ferry|ferries|speedboat|beach day|swim|outside like|what'?s it like out)\b/i;

export function looksLikeWeather(text: string): boolean {
  return WEATHER_WORDS.test(text ?? "");
}

/* WMO weather codes → plain words (subset that covers the tropics and the
   temperate band; unknown codes fall back to a neutral label). */
function codeLabel(code: number | null | undefined): string {
  const c = Number(code);
  if (!Number.isFinite(c)) return "conditions unclear";
  if (c === 0) return "clear sky";
  if (c === 1) return "mostly clear";
  if (c === 2) return "partly cloudy";
  if (c === 3) return "overcast";
  if (c === 45 || c === 48) return "foggy";
  if (c >= 51 && c <= 55) return "drizzle";
  if (c >= 56 && c <= 57) return "freezing drizzle";
  if (c >= 61 && c <= 65) return c >= 65 ? "heavy rain" : "rain";
  if (c >= 66 && c <= 67) return "freezing rain";
  if (c >= 71 && c <= 77) return "snow";
  if (c >= 80 && c <= 82) return c === 82 ? "violent rain showers" : "rain showers";
  if (c >= 85 && c <= 86) return "snow showers";
  if (c === 95) return "thunderstorm";
  if (c === 96 || c === 99) return "thunderstorm with hail";
  return "mixed conditions";
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function compass(deg: number | null | undefined): string {
  const d = Number(deg);
  if (!Number.isFinite(d)) return "";
  return COMPASS[Math.round(((d % 360) + 360) % 360 / 45) % 8];
}

export function knots(kmh: number): number {
  return kmh / 1.852;
}

/**
 * Sustained-wind → sea state for small-craft crossings (Gulf of Thailand
 * ferry/speedboat reality, not a formal bulletin):
 *   < 20 km/h (11 kn)  calm — normal crossings
 *   20–35 (11–19 kn)   moderate chop — bumpy speedboats, big ferries fine
 *   35–55 (19–30 kn)   rough — speedboats often suspend, ferries may delay
 *   > 55 (30 kn)       severe — crossings likely suspended
 */
export function marineLine(maxWindKmh: number): string {
  const kn = Math.round(knots(maxWindKmh));
  if (maxWindKmh < 20) {
    return `Sea and ferries: wind peaks near ${Math.round(maxWindKmh)} km/h (${kn} kn) — calm seas on this data, normal ferry and speedboat crossings expected.`;
  }
  if (maxWindKmh < 35) {
    return `Sea and ferries: wind peaks near ${Math.round(maxWindKmh)} km/h (${kn} kn) — noticeable chop; speedboat rides get bumpy, the big ferries normally still run.`;
  }
  if (maxWindKmh < 55) {
    return `Sea and ferries: wind peaks near ${Math.round(maxWindKmh)} km/h (${kn} kn) — rough; speedboats often suspend in this, ferries can delay. Check the operator before committing to a crossing.`;
  }
  return `Sea and ferries: wind peaks near ${Math.round(maxWindKmh)} km/h (${kn} kn) — severe; crossings are likely suspended until it eases.`;
}

/** Contiguous runs ≥ threshold over the next 24h of local hourly stamps. */
export function rainWindows(
  times: string[],
  probs: Array<number | null>,
  fromLocalIso: string,
  threshold = 50,
): Array<{ from: string; to: string; peak: number }> {
  const out: Array<{ from: string; to: string; peak: number }> = [];
  let cur: { from: string; to: string; peak: number } | null = null;
  const horizon = addHours(fromLocalIso, 24);
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t < fromLocalIso || t > horizon) continue;
    const p = Number(probs[i] ?? 0);
    if (p >= threshold) {
      if (!cur) cur = { from: t, to: t, peak: p };
      else { cur.to = t; cur.peak = Math.max(cur.peak, p); }
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.slice(0, 3);
}

function addHours(localIso: string, h: number): string {
  const d = new Date(localIso);
  d.setHours(d.getHours() + h);
  return toLocalIso(d);
}

function toLocalIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function hhmm(localIso: string): string {
  return localIso.slice(11, 16);
}

function dayWords(localIso: string): string {
  const d = new Date(localIso);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

type MeteoData = {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
  };
  hourly: {
    time: string[];
    precipitation_probability: Array<number | null>;
    wind_speed_10m: number[];
  };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
};

async function fetchMeteo(lat: number, lon: number): Promise<MeteoData | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m` +
    `&hourly=precipitation_probability,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min` +
    `&forecast_days=2&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return (await r.json()) as MeteoData;
}

/** Open-Meteo's own geocoder — same provider, no extra key, no extra feed. */
async function geocodePlace(name: string): Promise<{ label: string; lat: number; lon: number; country: string | null } | null> {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`,
  );
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const hit = j?.results?.[0];
  if (!hit) return null;
  return {
    label: String(hit.name ?? name),
    lat: Number(hit.latitude),
    lon: Number(hit.longitude),
    country: hit.country ? String(hit.country) : null,
  };
}

/** Pure composer — kept separate so the shape is testable without a network. */
export function weatherText(place: { label: string; note: string; lat: number; lon: number }, m: MeteoData): string {
  const now = m.current;
  const localNow = now.time;
  const temp = Math.round(now.temperature_2m);
  const feels = Math.round(now.apparent_temperature);
  const wind = Math.round(now.wind_speed_10m);
  const dir = compass(now.wind_direction_10m);

  const maxWindNext12 = Math.max(
    ...m.hourly.time
      .map((t, i) => ({ t, w: Number(m.hourly.wind_speed_10m[i] ?? 0) }))
      .filter((h) => h.t >= localNow && h.t <= addHours(localNow, 12))
      .map((h) => h.w),
    wind,
  );

  const windows = rainWindows(m.hourly.time, m.hourly.precipitation_probability, localNow);
  const wetLine = windows.length
    ? windows
        .map((w) => `${hhmm(w.from)}–${hhmm(addHours(w.to, 1))} (peaks ${w.peak}%)`)
        .join(", ")
    : "no rain window above 50% in the next 24 hours";

  const hi = Math.round(m.daily.temperature_2m_max?.[0] ?? NaN);
  const lo = Math.round(m.daily.temperature_2m_min?.[0] ?? NaN);

  return [
    `Live weather read — ${place.label} (${place.note}, ${place.lat.toFixed(2)}°, ${place.lon.toFixed(2)}°). Model data for ${dayWords(localNow)}, checked ${hhmm(localNow)} local time.`,
    `Now: ${temp}°C, feels like ${feels}°C, ${codeLabel(now.weather_code)}. Wind ${wind} km/h (${Math.round(knots(wind))} kn)${dir ? ` from the ${dir}` : ""}.`,
    Number.isFinite(hi) && Number.isFinite(lo)
      ? `Today: high ${hi}°C, low ${lo}°C. Rain: ${windows.length ? `likely ${wetLine}` : wetLine}.`
      : `Rain: ${windows.length ? `likely ${wetLine}` : wetLine}.`,
    marineLine(maxWindNext12),
    "This is live model telemetry (Open-Meteo) for these exact coordinates — a forecast, not a guarantee. It says nothing about flooding, actual ferry cancellations, or local incidents; an active local watch covers those.",
  ].join("\n");
}

/**
 * The read itself. Place argument wins when it clearly is not the ground;
 * otherwise the stamped ground is the sky we read.
 */
export async function weatherRead(
  sb: SupabaseClient,
  scope: ScopeArgs,
  args: { place?: string | null },
): Promise<string> {
  const asked = (args.place ?? "").trim();
  const ground = await activeGround(sb, scope);

  let place: { label: string; note: string; lat: number; lon: number } | null = null;
  if (asked) {
    const token = asked.toLowerCase();
    const groundMatches = ground &&
      (ground.label.toLowerCase().includes(token) || token.includes(ground.label.toLowerCase()));
    if (groundMatches && ground) {
      place = { label: ground.label, note: "your stamped ground", lat: ground.lat, lon: ground.lon };
    } else {
      const geo = await geocodePlace(asked);
      if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) {
        place = { label: geo.country ? `${geo.label}, ${geo.country}` : geo.label, note: "place you named", lat: geo.lat, lon: geo.lon };
      }
    }
  }
  if (!place && ground) {
    place = { label: ground.label, note: "your stamped ground", lat: ground.lat, lon: ground.lon };
  }
  if (!place) {
    return "I have no ground to read the sky from — no stamped place and no named place I could pin to coordinates. Stamp where you are and I will read it properly.";
  }

  const meteo = await fetchMeteo(place.lat, place.lon);
  if (!meteo?.current) {
    return `I could not pull the live model data for ${place.label} just now — the telemetry source did not answer. That is a failed read, not a weather report.`;
  }
  return weatherText(place, meteo);
}
