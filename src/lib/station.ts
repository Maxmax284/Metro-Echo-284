// station — the world-station identity layer.
//
// One rule: nothing here is a list. No city table, no per-place branch. Given
// coordinates and the calendar, the same math reads Koh Samui, Bangkok,
// Washington or a town Echo has never seen — hemisphere, latitude band, the
// season as that band knows it, the moon, and the daylight.
//
// Doctrine:
//   - Everything is figured on-device from the date and the fix. No feed, no
//     AI, no network — the cabinet works with no signal at all.
//   - A season read is a generalization and says so: the usual pattern for a
//     band of the world, never a forecast.
//   - Unknown stays unknown. No coordinates, no season; Echo does not guess.

import { daypartFor, type Daypart } from "./daylight";

// --------------------------------------------------------------------------
// Latitude bands and hemisphere
// --------------------------------------------------------------------------

export type LatBand = "equatorial" | "tropical" | "subtropical" | "temperate" | "subpolar" | "polar";

export function latBand(lat: number): LatBand {
  const a = Math.abs(lat);
  if (a < 7) return "equatorial";
  if (a < 23.5) return "tropical";
  if (a < 35) return "subtropical";
  if (a < 55) return "temperate";
  if (a < 66.5) return "subpolar";
  return "polar";
}

export type Hemisphere = "north" | "south";

export function hemisphere(lat: number): Hemisphere {
  return lat < 0 ? "south" : "north";
}

// --------------------------------------------------------------------------
// Season — region-aware by construction: the band picks the model, the
// hemisphere picks the phase, the date picks the spot. No northern-assumption.
// --------------------------------------------------------------------------

export type SeasonKey = "spring" | "summer" | "autumn" | "winter" | "wet" | "dry" | "equatorial";

export type SeasonRead = {
  key: SeasonKey;
  /** Display label: "Wet season". */
  label: string;
  /** Lowercase inline word: "wet season" — drops into a sentence. */
  short: string;
  /** One honest line about what this read is. */
  note: string;
};

const SEASON_WORDS: Record<SeasonKey, { label: string; short: string }> = {
  spring: { label: "Spring", short: "spring" },
  summer: { label: "Summer", short: "summer" },
  autumn: { label: "Autumn", short: "autumn" },
  winter: { label: "Winter", short: "winter" },
  wet: { label: "Wet season", short: "wet season" },
  dry: { label: "Dry season", short: "dry season" },
  equatorial: { label: "No marked season", short: "no marked season" },
};

/** Astronomical bounds, northern reference: Mar 20 / Jun 21 / Sep 22 / Dec 21. */
function temperateKeyNorth(at: Date): SeasonKey {
  const m = at.getUTCMonth() + 1;
  const d = at.getUTCDate();
  if (m < 3 || (m === 3 && d < 20)) return "winter";
  if (m < 6 || (m === 6 && d < 21)) return "spring";
  if (m < 9 || (m === 9 && d < 22)) return "summer";
  if (m < 12 || (m === 12 && d < 21)) return "autumn";
  return "winter";
}

const SOUTH_FLIP: Record<string, SeasonKey> = {
  spring: "autumn",
  summer: "winter",
  autumn: "spring",
  winter: "summer",
};

const PROVENANCE = "From the calendar and the latitude — the usual pattern, not a forecast.";

export function seasonFor(at: Date, lat: number): SeasonRead {
  const band = latBand(lat);
  const hemi = hemisphere(lat);

  if (band === "equatorial") {
    return {
      key: "equatorial",
      ...SEASON_WORDS.equatorial,
      note: `This close to the equator there is no summer or winter — wetter and drier stretches trade off through the year. ${PROVENANCE}`,
    };
  }

  if (band === "tropical") {
    // Monsoon rhythm: northern tropics run wet roughly May–Oct, southern the
    // other half of the year. Onset shifts year to year and the note says so.
    const m = at.getUTCMonth() + 1;
    const northWet = m >= 5 && m <= 10;
    const isWet = hemi === "north" ? northWet : !northWet;
    const key: SeasonKey = isWet ? "wet" : "dry";
    return {
      key,
      ...SEASON_WORDS[key],
      note: `The monsoon rhythm this latitude usually keeps — its edges move around by weeks, year to year. ${PROVENANCE}`,
    };
  }

  let key = temperateKeyNorth(at);
  if (hemi === "south") key = SOUTH_FLIP[key];
  const polarNote =
    band === "polar" || band === "subpolar"
      ? " This far from the equator the light swings harder than the temperature does."
      : "";
  return { key, ...SEASON_WORDS[key], note: `${SEASON_WORDS[key].label} as the calendar keeps it.${polarNote} ${PROVENANCE}` };
}

// --------------------------------------------------------------------------
// Moon — the same cycle everywhere; only the lit side flips with hemisphere.
// --------------------------------------------------------------------------

export type MoonKey =
  | "new"
  | "waxing-crescent"
  | "first-quarter"
  | "waxing-gibbous"
  | "full"
  | "waning-gibbous"
  | "last-quarter"
  | "waning-crescent";

export type MoonRead = {
  key: MoonKey;
  name: string;
  /** 0–1, how much of the face is lit. */
  illumination: number;
  /** Days into the cycle, 0 = new. */
  ageDays: number;
  waxing: boolean;
};

const SYNODIC_DAYS = 29.530588853;
/** A documented new moon: 6 Jan 2000, 18:14 UTC. */
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);

const MOON_NAMES: Record<MoonKey, string> = {
  new: "New moon",
  "waxing-crescent": "Waxing crescent",
  "first-quarter": "First quarter",
  "waxing-gibbous": "Waxing gibbous",
  full: "Full moon",
  "waning-gibbous": "Waning gibbous",
  "last-quarter": "Last quarter",
  "waning-crescent": "Waning crescent",
};

const MOON_KEYS: MoonKey[] = [
  "new",
  "waxing-crescent",
  "first-quarter",
  "waxing-gibbous",
  "full",
  "waning-gibbous",
  "last-quarter",
  "waning-crescent",
];

export function moonPhase(at: Date): MoonRead {
  let age = ((at.getTime() - NEW_MOON_EPOCH_MS) / 86_400_000) % SYNODIC_DAYS;
  if (age < 0) age += SYNODIC_DAYS;
  const illumination = (1 - Math.cos((2 * Math.PI * age) / SYNODIC_DAYS)) / 2;
  const idx = Math.floor(((age + SYNODIC_DAYS / 16) % SYNODIC_DAYS) / (SYNODIC_DAYS / 8)) % 8;
  const key = MOON_KEYS[idx];
  return {
    key,
    name: MOON_NAMES[key],
    illumination,
    ageDays: age,
    waxing: age < SYNODIC_DAYS / 2,
  };
}

// --------------------------------------------------------------------------
// Daylight — sunrise equation, approximate on purpose and labelled that way.
// --------------------------------------------------------------------------

export type DaylightRead = {
  /** Minutes of light today. */
  dayLengthMin: number;
  /** Wall-clock minutes past midnight, local when an offset was supplied, else UTC. Null under polar day/night. */
  sunriseMin: number | null;
  sunsetMin: number | null;
  polar: "midnight-sun" | "polar-night" | null;
};

function utcDayOfYear(at: Date): number {
  const start = Date.UTC(at.getUTCFullYear(), 0, 0);
  return Math.floor((at.getTime() - start) / 86_400_000);
}

export function daylightFor(lat: number, lon: number, at: Date, tzOffsetMin?: number | null): DaylightRead {
  const n = utcDayOfYear(at);
  const decl = (-23.44 * Math.cos((2 * Math.PI * (n + 10)) / 365) * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const cosW = -Math.tan(phi) * Math.tan(decl);

  if (cosW <= -1) return { dayLengthMin: 1440, sunriseMin: null, sunsetMin: null, polar: "midnight-sun" };
  if (cosW >= 1) return { dayLengthMin: 0, sunriseMin: null, sunsetMin: null, polar: "polar-night" };

  const halfDayMin = (Math.acos(cosW) * 180) / Math.PI * 4; // hour angle → minutes
  const noonUtc = 720 - 4 * lon; // solar noon, equation of time ignored by design
  const off = tzOffsetMin ?? 0;
  const norm = (m: number) => ((Math.round(m) % 1440) + 1440) % 1440;
  return {
    dayLengthMin: Math.round(halfDayMin * 2),
    sunriseMin: norm(noonUtc - halfDayMin + off),
    sunsetMin: norm(noonUtc + halfDayMin + off),
    polar: null,
  };
}

/** Offset of an IANA zone from UTC at a moment, in minutes. Null when unknown. */
export function tzOffsetMinutes(at: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return Math.round((asIfUtc - at.getTime()) / 60_000);
  } catch {
    return null;
  }
}

/** Minutes past midnight on the clock at the place. Falls back to the device. */
export function localMinutesNow(at: Date, timeZone?: string | null): number {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(at);
      const h = Number(parts.find((p) => p.type === "hour")?.value) % 24;
      const m = Number(parts.find((p) => p.type === "minute")?.value);
      if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
    } catch {
      /* bad zone — the device clock answers instead */
    }
  }
  return at.getHours() * 60 + at.getMinutes();
}

/** Where the sun sits on the cabinet arc: 0 rising → 1 setting. Null at night or under polar skies. */
export function sunFraction(at: Date, lat: number, lon: number, timeZone?: string | null): number | null {
  const off = timeZone ? tzOffsetMinutes(at, timeZone) : at.getTimezoneOffset() * -1;
  const d = daylightFor(lat, lon, at, off);
  if (d.polar || d.sunriseMin == null || d.sunsetMin == null) return null;
  const now = localMinutesNow(at, timeZone);
  if (now < d.sunriseMin || now > d.sunsetMin) return null;
  return (now - d.sunriseMin) / Math.max(1, d.sunsetMin - d.sunriseMin);
}

// --------------------------------------------------------------------------
// The assembled station read
// --------------------------------------------------------------------------

export type StationRead = {
  band: LatBand;
  hemisphere: Hemisphere;
  season: SeasonRead;
  daypart: Daypart;
  moon: MoonRead;
  daylight: DaylightRead;
  /** One spoken line: "Wet season · night" — for headers and the boot. */
  line: string;
};

export function stationRead(at: Date, lat: number, lon: number, timeZone?: string | null): StationRead {
  const off = timeZone ? tzOffsetMinutes(at, timeZone) : null;
  const season = seasonFor(at, lat);
  const hourLocal = localMinutesNow(at, timeZone) / 60;
  const daypart = daypartFor(hourLocal);
  return {
    band: latBand(lat),
    hemisphere: hemisphere(lat),
    season,
    daypart,
    moon: moonPhase(at),
    daylight: daylightFor(lat, lon, at, off),
    line: `${season.label} · ${daypart}`,
  };
}

/** mm:ss-style clock from minutes past midnight: "06:12". */
export function clockFromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "13h 06m" from a minute count. */
export function hoursFromMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}
