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

export type LiveFlight = {
  flight_no: string;
  flight_date: string;
  airline: string | null;
  /** The provider's own word: scheduled, active, landed, cancelled, diverted. */
  status: string | null;
  departure: LiveEnd;
  arrival: LiveEnd;
  checked_at: string;
};

function str(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function end(raw: any): LiveEnd {
  const r = raw ?? {};
  return {
    airport: str(r.airport),
    iata: str(r.iata)?.toUpperCase() ?? null,
    terminal: str(r.terminal),
    gate: str(r.gate),
    scheduled: str(r.scheduled),
    estimated: str(r.estimated),
    actual: str(r.actual),
    delay_min: num(r.delay),
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
  const sameNumber = (r: any) =>
    str(r?.flight?.iata)?.replace(/\s+/g, "").toUpperCase() === want ||
    str(r?.flight?.icao)?.replace(/\s+/g, "").toUpperCase() === want;
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
  return {
    flight_no: want,
    flight_date: str(row.flight_date) ?? ask.flight_date,
    airline: str(row?.airline?.name),
    status: str(row.flight_status),
    departure: end(row.departure),
    arrival: end(row.arrival),
    checked_at: checkedAt,
  };
}

function clockOf(iso: string | null, clock: (iso: string) => string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? clock(iso) : null;
}

const STATUS_WORDS: Record<string, string> = {
  scheduled: "scheduled",
  active: "in the air",
  landed: "landed",
  cancelled: "cancelled",
  incident: "flagged by the airline",
  diverted: "diverted",
};

/** What the reading says, in plain English, with its age attached by the caller. */
export function statusWords(live: LiveFlight, clock: (iso: string) => string = (i) => i.slice(11, 16)): string {
  const bits: string[] = [];
  const state = live.status ? (STATUS_WORDS[live.status] ?? live.status) : null;
  if (state) bits.push(state);
  const dep = clockOf(live.departure.estimated ?? live.departure.actual ?? live.departure.scheduled, clock);
  if (dep) {
    const late = live.departure.delay_min;
    bits.push(late && late > 0 ? `leaves ${dep}, ${late} min later than planned` : `leaves ${dep}`);
  }
  if (live.departure.gate) bits.push(`gate ${live.departure.gate}`);
  else if (live.departure.terminal) bits.push(`terminal ${live.departure.terminal}`);
  const arr = clockOf(live.arrival.estimated ?? live.arrival.actual ?? live.arrival.scheduled, clock);
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
  clock: (iso: string) => string = (i) => i.slice(11, 16),
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
          ? `leaves ${Math.abs(moved)} min later, ${clock(depNext)}`
          : `leaves ${Math.abs(moved)} min earlier, ${clock(depNext)}`,
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
      news.push(`lands ${clock(arrNext)}`);
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
