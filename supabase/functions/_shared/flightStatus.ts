// flightStatus — where a flight actually is, from a provider that says so.
//
// Doctrine:
//   - One provider, read only. A status is a reading with a time on it, never a
//     standing truth: every snapshot carries when it was checked.
//   - Nothing is filled in. No gate, no terminal, no estimate unless the
//     provider carried one. A missing arrival stays missing.
//   - A sweep reports a diff, not a status. "Still on time" is not news; forty
//     minutes later is.
//
// Pure module: no IO, no React.

import { airportPoint, distanceKm } from "./airports.ts";
import { airportZone, anchorToZone } from "./travelSense.ts";

export type LiveEnd = {
  airport: string | null;
  iata: string | null;
  terminal: string | null;
  gate: string | null;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  delay_min: number | null;
};

/**
 * The aircraft's own reading: where it is, how high, how fast, which way. Only
 * ever the provider's numbers, with the moment they were taken — a fix has an
 * age, and an old fix is said to be old rather than drawn as now.
 */
export type LivePosition = {
  /** When the provider took this fix. */
  updated: string | null;
  lat: number;
  lon: number;
  /** Metres above sea level, as filed. */
  altitude_m: number | null;
  /** True heading in degrees, 0–360. */
  heading_deg: number | null;
  /** Ground speed, km/h. */
  speed_kmh: number | null;
  /** Climb or descent, km/h. Negative is descending. */
  vertical_kmh: number | null;
  on_ground: boolean | null;
};

/** One name a flight answers to, as a provider stated it. */
export type LiveCarrier = {
  carrier: string | null;
  carrier_code: string | null;
  flight_no: string | null;
};

export type LiveFlight = {
  flight_no: string;
  flight_date: string;
  airline: string | null;
  /** Two-letter code of the airline on the row, when the provider carried one. */
  airline_code?: string | null;
  /**
   * The airline that actually flies the aircraft, when the provider's codeshare
   * block said it is somebody other than the one on the ticket. This is what the
   * boards, the counters and the gate signs will say.
   */
  operated_by?: LiveCarrier | null;
  /** The identity on the ticket, kept when it differs from the operating one. */
  marketed_as?: LiveCarrier | null;
  /** The provider's own word: scheduled, active, landed, cancelled, diverted. */
  status: string | null;
  departure: LiveEnd;
  arrival: LiveEnd;
  /** The aircraft's fix, when the provider carried one. Null is an answer. */
  position?: LivePosition | null;
  /**
   * Facts this reading did not carry that an earlier reading did, kept rather
   * than erased. A provider going quiet about a gate is not the airline pulling
   * it, so the last verified value stays with the date it was verified.
   */
  carried?: CarriedFact[];
  checked_at: string;
};

/** One fact kept from an earlier reading because this one did not carry it. */
export type CarriedFact = {
  field: "departure.gate" | "departure.terminal" | "arrival.gate" | "arrival.terminal";
  value: string;
  /** When the reading that did carry it was taken. */
  since: string;
};

function str(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/* The provider stamps airport wall-clock times with a fake "+00:00". A 1:15 AM
   departure out of Dulles comes back as "01:15+00:00", which is not 1:15 AM in
   Washington — it is the ticket time wearing a UTC costume. Strip the offset so
   everything downstream reads it as what it is: the clock on the airport wall. */
function wall(v: unknown): string | null {
  const t = str(v);
  return t ? t.replace(/(?:[Zz]|[+-]\d{2}:?\d{2})$/, "") : null;
}

function end(raw: any): LiveEnd {
  const r = raw ?? {};
  return {
    airport: str(r.airport),
    iata: str(r.iata)?.toUpperCase() ?? null,
    terminal: str(r.terminal),
    gate: str(r.gate),
    scheduled: wall(r.scheduled),
    estimated: wall(r.estimated),
    actual: wall(r.actual),
    delay_min: num(r.delay),
  };
}

/**
 * The aircraft fix from a provider payload. Null unless it carried a real pair
 * of coordinates — a fix without a place on the earth is no fix at all.
 */
function fix(raw: any): LivePosition | null {
  const r = raw ?? {};
  const lat = num(r.latitude);
  const lon = num(r.longitude);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const heading = num(r.direction);
  return {
    updated: str(r.updated),
    lat,
    lon,
    altitude_m: num(r.altitude),
    heading_deg: heading === null ? null : ((heading % 360) + 360) % 360,
    speed_kmh: num(r.speed_horizontal),
    vertical_kmh: num(r.speed_vertical),
    on_ground: typeof r.is_ground === "boolean" ? r.is_ground : null,
  };
}


/**
 * One AviationStack /v1/flights payload, narrowed to the flight asked about.
 * Null when the provider returned nothing for it — which is reported as
 * "nothing on record", never as "on time".
 */
export function normalizeAviationstack(
  payload: unknown,
  ask: { flight_no: string; flight_date: string },
  checkedAt: string = new Date().toISOString(),
): LiveFlight | null {
  const rows = Array.isArray((payload as any)?.data) ? ((payload as any).data as any[]) : [];
  const want = ask.flight_no.replace(/\s+/g, "").toUpperCase();
  const day = (ask.flight_date ?? "").slice(0, 10);
  const code = (v: unknown) => str(v)?.replace(/\s+/g, "").toUpperCase() ?? null;
  /* A codeshare answers to two numbers. A ticket filed under the marketing
     number must still find the row the provider files under the operating one,
     and the other way round — otherwise the flight reads as nothing on record
     while the terminal boards it happily. */
  const sameNumber = (r: any) =>
    code(r?.flight?.iata) === want ||
    code(r?.flight?.icao) === want ||
    code(r?.flight?.codeshared?.flight_iata) === want ||
    code(r?.flight?.codeshared?.flight_icao) === want;
  /* The day matters as much as the number. A provider that refuses a date filter
     hands back every recent run of this flight; grafting yesterday's run onto
     tomorrow's ticket would invent a departure that already happened. When no
     row carries the day asked about, the answer is nothing on record. */
  const sameDay = (r: any) => {
    const filed = str(r?.flight_date)?.slice(0, 10) ?? null;
    if (filed) return filed === day;
    const dep = str(r?.departure?.scheduled)?.slice(0, 10) ?? null;
    return dep ? dep === day : false;
  };
  const row = day
    ? (rows.find((r) => sameNumber(r) && sameDay(r)) ?? null)
    : (rows.find(sameNumber) ?? null);
  if (!row) return null;
  /* The codeshare block is the airline that actually flies the aircraft. Keeping
     it is the difference between "TG6285" and "look for EVA Air BR3 on the
     board" — and a traveller standing in a departures hall needs the second. */
  const shared = row?.flight?.codeshared ?? null;
  const ticket: LiveCarrier = {
    carrier: str(row?.airline?.name),
    carrier_code: code(row?.airline?.iata),
    flight_no: code(row?.flight?.iata) ?? want,
  };
  const operating: LiveCarrier | null = shared
    ? {
        carrier: str(shared.airline_name),
        carrier_code: code(shared.airline_iata),
        flight_no: code(shared.flight_iata),
      }
    : null;
  const differs = !!operating?.flight_no && operating.flight_no !== ticket.flight_no;
  return anchorLive({
    flight_no: want,
    flight_date: str(row.flight_date) ?? ask.flight_date,
    airline: ticket.carrier,
    airline_code: ticket.carrier_code,
    operated_by: differs ? operating : null,
    marketed_as: differs ? ticket : null,
    status: str(row.flight_status),
    departure: end(row.departure),
    arrival: end(row.arrival),
    position: fix(row.live),
    checked_at: checkedAt,
  });
}

/** A time said out loud, on the clock at the airport it belongs to. */
function clockOf(iso: string | null, iata: string | null, clock: EndClock): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? clock(iso, iata) : null;
}

/**
 * How a time is said. The airport is passed with it, because a departure belongs
 * to the clock at the departure airport and a landing to the clock where it
 * lands — printing both on the traveller's own phone zone is how a Taipei
 * landing came out as an afternoon.
 */
export type EndClock = (iso: string, iata?: string | null) => string;

const STATUS_WORDS: Record<string, string> = {
  scheduled: "scheduled",
  active: "in the air",
  landed: "landed",
  cancelled: "cancelled",
  incident: "flagged by the airline",
  diverted: "diverted",
};

/** What the reading says, in plain English, with its age attached by the caller. */
export function statusWords(live: LiveFlight, clock: EndClock = (i) => i.slice(11, 16)): string {
  const bits: string[] = [];
  const state = live.status ? (STATUS_WORDS[live.status] ?? live.status) : null;
  if (state) bits.push(state);
  const dep = clockOf(live.departure.estimated ?? live.departure.actual ?? live.departure.scheduled, live.departure.iata, clock);
  if (dep) {
    const late = live.departure.delay_min;
    bits.push(late && late > 0 ? `leaves ${dep}, ${late} min later than planned` : `leaves ${dep}`);
  }
  if (live.departure.gate) bits.push(`gate ${live.departure.gate}`);
  else if (live.departure.terminal) bits.push(`terminal ${live.departure.terminal}`);
  const arr = clockOf(live.arrival.estimated ?? live.arrival.actual ?? live.arrival.scheduled, live.arrival.iata, clock);
  if (arr) bits.push(`lands ${arr}`);
  if (live.arrival.gate) bits.push(`arrival gate ${live.arrival.gate}`);
  if (!bits.length) return `${live.flight_no} — the provider carried no times for it.`;
  return `${live.flight_no} — ${bits.join(", ")}.`;
}

/**
 * What changed between two readings. Null when nothing did: a background check
 * that found the flight unchanged has no news, and silence is a valid answer.
 */
export function statusDiff(
  prev: LiveFlight | null | undefined,
  next: LiveFlight,
  clock: EndClock = (i) => i.slice(11, 16),
): string | null {
  if (!prev) return null;
  /* A shift bigger than half a day is a different day's flight, not a delay.
     Two readings that disagree that much are not news — they are a mismatch. */
  if (prev.flight_date && next.flight_date && prev.flight_date !== next.flight_date) return null;
  const SANE_SHIFT_MIN = 12 * 60;
  const news: string[] = [];
  if (prev.status !== next.status && next.status) {
    news.push(`now ${STATUS_WORDS[next.status] ?? next.status}`);
  }
  const depPrev = prev.departure.estimated ?? prev.departure.scheduled;
  const depNext = next.departure.estimated ?? next.departure.scheduled;
  if (depPrev && depNext && depPrev !== depNext) {
    const moved = Math.round((new Date(depNext).getTime() - new Date(depPrev).getTime()) / 60_000);
    if (Number.isFinite(moved) && moved !== 0 && Math.abs(moved) <= SANE_SHIFT_MIN) {
      news.push(
        moved > 0
          ? `leaves ${Math.abs(moved)} min later, ${clock(depNext, next.departure.iata)}`
          : `leaves ${Math.abs(moved)} min earlier, ${clock(depNext, next.departure.iata)}`,
      );
    }
  }
  if (prev.departure.gate !== next.departure.gate && next.departure.gate) {
    news.push(`gate ${next.departure.gate}`);
  }
  const arrPrev = prev.arrival.estimated ?? prev.arrival.scheduled;
  const arrNext = next.arrival.estimated ?? next.arrival.scheduled;
  if (arrPrev && arrNext && arrPrev !== arrNext) {
    const moved = Math.round((new Date(arrNext).getTime() - new Date(arrPrev).getTime()) / 60_000);
    if (Number.isFinite(moved) && moved !== 0 && Math.abs(moved) <= SANE_SHIFT_MIN) {
      news.push(`lands ${clock(arrNext, next.arrival.iata)}`);
    }
  }
  if (!news.length) return null;
  return `${next.flight_no} — ${news.join(", ")}.`;
}

/** How old a reading is, said the way a person would. */
export function readingAge(checkedAt: string, now: Date = new Date()): string {
  const t = new Date(checkedAt).getTime();
  if (!Number.isFinite(t)) return "checked at an unrecorded time";
  const mins = Math.max(0, Math.round((now.getTime() - t) / 60_000));
  if (mins < 1) return "checked just now";
  if (mins < 60) return `checked ${mins} min ago`;
  const h = Math.round(mins / 60);
  return h === 1 ? "checked an hour ago" : `checked ${h} hours ago`;
}

export const STATUS_LAW =
  "Echo reads where a flight is. It never checks you in, never rebooks, and never buys.";

/* ---- Where a flight is in its own arc -------------------------------------
   Only for showing motion on screen. Every value is derived from times the
   provider actually carried; a missing time means no progress is drawn rather
   than a guessed halfway. */

export type FlightPhase = "waiting" | "flying" | "landed" | "stopped" | "unknown";

/** The flight's own arc, from the provider's word first and its times second. */
export function flightPhase(live: LiveFlight, now: Date = new Date()): FlightPhase {
  const s = (live.status ?? "").toLowerCase();
  if (s === "cancelled" || s === "diverted" || s === "incident") return "stopped";
  if (s === "landed") return "landed";
  if (s === "active") return "flying";
  const off = live.departure.actual ?? null;
  const on = live.arrival.actual ?? null;
  if (on) return "landed";
  if (off) return "flying";
  const dep = live.departure.estimated ?? live.departure.scheduled;
  if (!dep) return "unknown";
  const t = new Date(dep).getTime();
  if (!Number.isFinite(t)) return "unknown";
  return now.getTime() < t ? "waiting" : "unknown";
}

/**
 * How far along, 0 to 1. Null when either end has no time on record — a strip
 * with no honest position shows none.
 */
export function flightProgress(live: LiveFlight, now: Date = new Date()): number | null {
  const phase = flightPhase(live, now);
  if (phase === "landed") return 1;
  if (phase === "stopped") return null;
  const depIso = live.departure.actual ?? live.departure.estimated ?? live.departure.scheduled;
  const arrIso = live.arrival.actual ?? live.arrival.estimated ?? live.arrival.scheduled;
  if (!depIso || !arrIso) return null;
  const dep = new Date(depIso).getTime();
  const arr = new Date(arrIso).getTime();
  if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return null;
  const p = (now.getTime() - dep) / (arr - dep);
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return p;
}

export const PHASE_WORDS: Record<FlightPhase, string> = {
  waiting: "on the ground, waiting",
  flying: "in the air",
  landed: "landed",
  stopped: "not flying",
  unknown: "position not on record",
};

/* ---- The aircraft's own telemetry -----------------------------------------
   Altitude, speed and heading are the provider's numbers or nothing. A fix has
   an age: past FIX_FRESH_MS it is still shown, still labelled with its age, but
   it no longer moves the marker as though it were now. */

/** How long a radar fix is treated as current. */
export const FIX_FRESH_MS = 20 * 60_000;

/** Age of a fix in minutes, or null when it carries no time. */
export function fixAgeMin(pos: LivePosition | null | undefined, now: Date = new Date()): number | null {
  const t = pos?.updated ? new Date(pos.updated).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now.getTime() - t) / 60_000));
}

/** A fix with no time on it is taken at face value; a timed one must be recent. */
export function fixIsCurrent(pos: LivePosition | null | undefined, now: Date = new Date()): boolean {
  if (!pos) return false;
  const age = fixAgeMin(pos, now);
  return age === null ? true : age * 60_000 <= FIX_FRESH_MS;
}

/**
 * How far along the track the aircraft actually is, from its own fix measured
 * against both airports. Null unless the fix and both coordinates are on
 * record — the alternative would be a position worked out from a guess.
 */
export function positionProgress(live: LiveFlight, now: Date = new Date()): number | null {
  const pos = live.position ?? null;
  if (!pos || !fixIsCurrent(pos, now)) return null;
  const a = airportPoint(live.departure.iata);
  const b = airportPoint(live.arrival.iata);
  if (!a || !b) return null;
  const whole = distanceKm(a, b);
  if (!Number.isFinite(whole) || whole < 1) return null;
  const flown = distanceKm(a, { lat: pos.lat, lon: pos.lon });
  const left = distanceKm({ lat: pos.lat, lon: pos.lon }, b);
  /* Measured both ways so a fix off to the side of the track still lands
     somewhere sensible along it rather than past the far end. */
  const t = flown / Math.max(whole, flown + left);
  if (!Number.isFinite(t)) return null;
  return Math.min(1, Math.max(0, t));
}

export type TrackSource = "radar" | "clock" | "none";

/** Where to draw the aircraft, and on whose word. Radar first, clock second. */
export function trackProgress(
  live: LiveFlight,
  now: Date = new Date(),
): { value: number | null; source: TrackSource } {
  const radar = positionProgress(live, now);
  if (radar !== null) return { value: radar, source: "radar" };
  const clock = flightProgress(live, now);
  return { value: clock, source: clock === null ? "none" : "clock" };
}

const M_TO_FT = 3.28084;
const KMH_TO_MPH = 0.621371;
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** "291° WNW", or null when the provider filed no heading. */
export function headingWords(pos: LivePosition | null | undefined): string | null {
  const d = pos?.heading_deg;
  if (d === null || d === undefined) return null;
  return `${Math.round(d)}° ${COMPASS[Math.round(d / 22.5) % 16]}`;
}

/** Altitude in feet, the way a board prints it. Null when none was filed. */
export function altitudeWords(pos: LivePosition | null | undefined): string | null {
  const m = pos?.altitude_m;
  if (m === null || m === undefined) return null;
  const ft = Math.round((m * M_TO_FT) / 100) * 100;
  return `${ft.toLocaleString("en-US")} ft`;
}

/** Ground speed in mph. Null when none was filed. */
export function speedWords(pos: LivePosition | null | undefined): string | null {
  const k = pos?.speed_kmh;
  if (k === null || k === undefined) return null;
  return `${Math.round(k * KMH_TO_MPH)} mph`;
}

/** Climbing, descending or level — only when a vertical rate was filed. */
export function climbWords(pos: LivePosition | null | undefined): string | null {
  const v = pos?.vertical_kmh;
  if (v === null || v === undefined) return null;
  if (Math.abs(v) < 1) return "level";
  return v > 0 ? "climbing" : "descending";
}

/** One line on the fix and its age, for the card to print under the track. */
export function fixWords(pos: LivePosition | null | undefined, now: Date = new Date()): string | null {
  if (!pos) return null;
  const age = fixAgeMin(pos, now);
  const when =
    age === null
      ? "the airline filed no time with it"
      : age < 1
        ? "taken moments ago"
        : age === 1
          ? "taken a minute ago"
          : age < 60
            ? `taken ${age} min ago`
            : "taken over an hour ago";
  const where = `${pos.lat.toFixed(2)}, ${pos.lon.toFixed(2)}`;
  const stale = age !== null && age * 60_000 > FIX_FRESH_MS ? " The track is drawn from the clock until a newer fix lands." : "";
  return `Radar fix ${where} — ${when}.${stale}`;
}

/**
 * Keep what an earlier reading verified when this one is simply quiet about it.
 *
 * A gate that vanishes from a provider response has not been withdrawn by the
 * airline — the provider just did not say. Erasing it would make the deck
 * contradict itself an hour before boarding, so the last verified value is kept
 * with the moment it was verified, and named as kept.
 *
 * Nothing is carried when the airline has cancelled the flight: then a missing
 * gate is the answer.
 */
export function carryFiled(previous: LiveFlight | null, live: LiveFlight): LiveFlight {
  if (!previous) return live;
  const provider = (live.status ?? "").trim().toLowerCase();
  if (provider === "cancelled") return live;

  const since = previous.checked_at;
  const carried: CarriedFact[] = [];
  const next: LiveFlight = {
    ...live,
    departure: { ...live.departure },
    arrival: { ...live.arrival },
  };

  const keep = (
    end: "departure" | "arrival",
    key: "gate" | "terminal",
  ) => {
    const had = (previous[end]?.[key] ?? "").trim();
    const has = (next[end][key] ?? "").trim();
    if (!had || has) return;
    next[end][key] = had;
    carried.push({ field: `${end}.${key}` as CarriedFact["field"], value: had, since });
  };

  keep("departure", "gate");
  keep("departure", "terminal");
  keep("arrival", "gate");
  keep("arrival", "terminal");

  next.carried = carried.length ? carried : undefined;
  return next;
}

/** True when this reading is showing a value it kept rather than one it read. */
export function isCarried(live: LiveFlight | null, field: CarriedFact["field"]): CarriedFact | null {
  return (live?.carried ?? []).find((c) => c.field === field) ?? null;
}

/**
 * Pin every time on a reading to the airport it belongs to.
 *
 * A provider hands back airport wall-clock times with no zone on them — "the
 * board at Taoyuan says 05:21". `wall()` above deliberately strips the fake
 * "+00:00" so nothing downstream reads a Dulles departure as UTC. The cost of
 * that honesty is that the string on its own is not an instant: subtracting it
 * from now uses whatever zone the phone happens to be sitting in, and a phone
 * that left Washington on an aircraft is still on Washington time. That is how a
 * landing in Taipei read as twelve hours further away than it was.
 *
 * So the reading is anchored once, here, at the seam: each end's times become
 * real instants in that airport's own zone. Idempotent — a time that already
 * carries a zone is left exactly as it is, and an airport Echo has no zone for
 * stays unanchored rather than being guessed at.
 */
export function anchorLive<T extends LiveFlight | null | undefined>(live: T): T {
  if (!live) return live;
  const pin = (e: LiveEnd): LiveEnd => {
    const tz = airportZone(e.iata);
    if (!tz) return e;
    return {
      ...e,
      scheduled: anchorToZone(e.scheduled, tz),
      estimated: anchorToZone(e.estimated, tz),
      actual: anchorToZone(e.actual, tz),
    };
  };
  return { ...live, departure: pin(live.departure), arrival: pin(live.arrival) } as T;
}

/**
 * True when this time cannot be turned into a real instant: a wall clock with no
 * zone behind it. Used to say "not pinned" instead of counting down from a
 * number that quietly assumes the phone's own zone.
 */
export function isPinned(at: string | null | undefined): boolean {
  return !!at && /(?:[Zz]|[+-]\d{2}:?\d{2})$/.test(at) && Number.isFinite(Date.parse(at));
}
