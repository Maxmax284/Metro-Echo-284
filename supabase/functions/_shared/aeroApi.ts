// aeroApi — FlightAware AeroAPI v4, read only.
//
// Doctrine:
//   - Read only. Nothing here books, holds, checks in or changes anything.
//   - AeroAPI stamps real instants (UTC). Every other part of Echo speaks the
//     clock on the airport wall, so instants are turned into wall time using the
//     zone AeroAPI itself carried, or the airport's kept zone. Never the device's.
//   - An empty answer is an answer: nothing on record, never "on time".
//   - Only rows for the day asked about survive. A neighbouring day's run of the
//     same number is a different flight, not a delay.
//
// Pure apart from one fetch. No React.
import type { LiveCarrier, LiveEnd, LiveFlight, LivePosition } from "./flightStatus.ts";
import { airportZone } from "./travelSense.ts";

/** The provider said this key cannot ask that question. A limit, not a crash. */
export class AeroLimited extends Error {}

function str(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function code(v: unknown): string | null {
  return str(v)?.replace(/\s+/g, "").toUpperCase() ?? null;
}

/**
 * A real instant, rendered as the clock on the wall where it happens. Returns
 * null when the zone is unknown — Echo would rather carry no time than a time
 * read in the wrong city.
 */
export function wallAt(iso: string | null, tz: string | null): string | null {
  if (!iso || !tz) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(t));
    const get = (k: string) => parts.find((p) => p.type === k)?.value ?? null;
    const y = get("year");
    const mo = get("month");
    const d = get("day");
    let h = get("hour");
    const mi = get("minute");
    const s = get("second") ?? "00";
    if (!y || !mo || !d || !h || !mi) return null;
    if (h === "24") h = "00";
    return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  } catch {
    return null;
  }
}

/** Minutes of delay from AeroAPI's seconds, when it carried any. */
function lateMin(v: unknown): number | null {
  const secs = num(v);
  return secs === null ? null : Math.round(secs / 60);
}

function endOf(raw: any, which: "out" | "in"): LiveEnd {
  const r = raw ?? {};
  const port = which === "out" ? r.origin : r.destination;
  const iata = code(port?.code_iata) ?? code(port?.code) ?? null;
  const tz = str(port?.timezone) ?? airportZone(iata);
  const pick = (k: string) => wallAt(str(r[k]), tz);
  return {
    airport: str(port?.name),
    iata,
    terminal: str(which === "out" ? r.terminal_origin : r.terminal_destination),
    gate: str(which === "out" ? r.gate_origin : r.gate_destination),
    scheduled: pick(which === "out" ? "scheduled_out" : "scheduled_in"),
    estimated: pick(which === "out" ? "estimated_out" : "estimated_in"),
    actual: pick(which === "out" ? "actual_out" : "actual_in"),
    delay_min: lateMin(which === "out" ? r.departure_delay : r.arrival_delay),
  };
}

/** AeroAPI's last known fix, in Echo's units. Null unless it carried one. */
function fixOf(raw: any): LivePosition | null {
  const p = raw?.last_position ?? null;
  if (!p) return null;
  const lat = num(p.latitude);
  const lon = num(p.longitude);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const heading = num(p.heading);
  const feet = num(p.altitude); /* hundreds of feet, as filed */
  const knots = num(p.groundspeed);
  return {
    updated: str(p.timestamp),
    lat,
    lon,
    altitude_m: feet === null ? null : Math.round(feet * 100 * 0.3048),
    heading_deg: heading === null ? null : ((heading % 360) + 360) % 360,
    speed_kmh: knots === null ? null : Math.round(knots * 1.852),
    vertical_kmh: null,
    on_ground: null,
  };
}

/** AeroAPI's own word about the flight, folded into Echo's vocabulary. */
function statusOf(r: any): string | null {
  if (r?.cancelled === true) return "cancelled";
  if (r?.diverted === true) return "diverted";
  if (str(r?.actual_in)) return "landed";
  if (str(r?.actual_out)) return "active";
  if (str(r?.scheduled_out)) return "scheduled";
  return str(r?.status)?.toLowerCase() ?? null;
}

/**
 * One AeroAPI /flights/{ident} payload, narrowed to the flight and day asked
 * about. Null when nothing on record matches — which is said plainly.
 */
export function normalizeAeroApi(
  payload: unknown,
  ask: { flight_no: string; flight_date: string },
  checkedAt: string = new Date().toISOString(),
): LiveFlight | null {
  const rows = Array.isArray((payload as any)?.flights) ? ((payload as any).flights as any[]) : [];
  const want = code(ask.flight_no) ?? "";
  const day = (ask.flight_date ?? "").slice(0, 10);

  /* A codeshare answers to two numbers. A ticket filed under the marketing
     number must still find the row AeroAPI files under the operating one. */
  const shares = (r: any) => {
    const list = [
      ...(Array.isArray(r?.codeshares) ? r.codeshares : []),
      ...(Array.isArray(r?.codeshares_iata) ? r.codeshares_iata : []),
    ];
    return list.map(code).filter(Boolean) as string[];
  };
  const sameNumber = (r: any) =>
    code(r?.ident_iata) === want || code(r?.ident_icao) === want || code(r?.ident) === want || shares(r).includes(want);

  /* The day is judged on the wall clock where it leaves, not on UTC — a 1:15 AM
     Dulles departure is still the 19th even though UTC has moved on. */
  const depDay = (r: any) => {
    const port = r?.origin ?? null;
    const tz = str(port?.timezone) ?? airportZone(code(port?.code_iata) ?? code(port?.code));
    const local = wallAt(str(r?.scheduled_out) ?? str(r?.estimated_out) ?? str(r?.actual_out), tz);
    return local?.slice(0, 10) ?? null;
  };
  const rowsBy = rows.filter(sameNumber);
  const row = (day ? rowsBy.find((r) => depDay(r) === day) : rowsBy[0]) ?? null;
  if (!row) return null;

  const operatingNo = code(row?.ident_iata) ?? code(row?.ident) ?? want;
  const operating: LiveCarrier = {
    carrier: str(row?.operator_name) ?? str(row?.operator_iata) ?? str(row?.operator),
    carrier_code: code(row?.operator_iata) ?? code(row?.operator),
    flight_no: operatingNo,
  };
  /* When the number asked about is not the number flying the aircraft, the
     ticket name is kept alongside the one the boards will show. */
  const differs = !!want && !!operatingNo && want !== operatingNo;
  const ticket: LiveCarrier | null = differs ? { carrier: null, carrier_code: want.slice(0, 2), flight_no: want } : null;

  return {
    flight_no: want || operatingNo,
    flight_date: day || (depDay(row) ?? ask.flight_date),
    airline: operating.carrier,
    airline_code: operating.carrier_code,
    operated_by: differs ? operating : null,
    marketed_as: ticket,
    status: statusOf(row),
    departure: endOf(row, "out"),
    arrival: endOf(row, "in"),
    position: fixOf(row),
    checked_at: checkedAt,
  };
}

/**
 * One reading for one flight on one day from AeroAPI. Null when the feed carries
 * nothing for it. Throws AeroLimited when the key is refused, so a caller can
 * fall back rather than treat a limit as a failure.
 */
export async function askAero(key: string, flight_no: string, flight_date: string): Promise<LiveFlight | null> {
  if (!key) return null;
  const ident = code(flight_no) ?? flight_no;
  const day = (flight_date ?? "").slice(0, 10);
  const url = new URL(`https://aeroapi.flightaware.com/aeroapi/flights/${encodeURIComponent(ident)}`);
  /* A one-day window either side keeps the ask small and still catches a flight
     that leaves late on the day before in UTC terms. */
  if (day) {
    const t = Date.parse(`${day}T00:00:00Z`);
    if (Number.isFinite(t)) {
      url.searchParams.set("start", new Date(t - 24 * 3_600_000).toISOString().slice(0, 19) + "Z");
      url.searchParams.set("end", new Date(t + 48 * 3_600_000).toISOString().slice(0, 19) + "Z");
    }
  }
  const res = await fetch(url.toString(), { headers: { "x-apikey": key, Accept: "application/json; charset=UTF-8" } });
  const text = await res.text();
  if (res.status === 401 || res.status === 403 || res.status === 429) throw new AeroLimited(`[${res.status}] ${text}`);
  if (res.status === 404) return null; /* AeroAPI knows the shape, not this flight. */
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  const payload = JSON.parse(text || "{}");
  return normalizeAeroApi(payload, { flight_no: ident, flight_date: day });
}
