// Trips — the location bones.
//
// A trip is a deliberate span: you tap Start trip, you tap End trip. Nothing
// starts on its own, nothing is inferred from movement, and a trip that was
// left running is closed with a diff ("closed it at the last point recorded"),
// never silently. This module is pure arithmetic and wording so the same rules
// can be tested without a browser or a database.

export type TripPoint = {
  lat: number;
  lon: number;
  accuracy_m?: number | null;
  kind?: string | null;
  label?: string | null;
  recorded_at: string;
};

export type Trip = {
  id: string;
  label: string | null;
  purpose: string | null;
  started_at: string;
  ended_at: string | null;
  start_label: string | null;
  end_label: string | null;
  distance_m: number | null;
  point_count: number;
  closed_by: string;
};

/** How a trip ended. Only "you" is a clean close; the rest are reported. */
export type ClosedBy = "open" | "you" | "auto_stale" | "auto_gap";

const EARTH_M = 6_371_000;

/** Straight-line metres between two fixes. */
export function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance along a recorded path. Fixes closer together than the noise floor
 * are ignored so a phone sitting on a table does not invent kilometres.
 */
const NOISE_FLOOR_M = 25;
export function pathDistanceMeters(points: TripPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const step = metersBetween(points[i - 1], points[i]);
    if (step >= NOISE_FLOOR_M) total += step;
  }
  return total;
}

/** "12.4 km" / "780 m" / "not measured" — never a fake zero. */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return "not measured";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** "1h 12m" / "18m" / "under a minute". */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "unknown";
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function tripDurationMs(trip: Trip, now = Date.now()): number | null {
  const start = new Date(trip.started_at).getTime();
  if (!Number.isFinite(start)) return null;
  const end = trip.ended_at ? new Date(trip.ended_at).getTime() : now;
  if (!Number.isFinite(end)) return null;
  return end - start;
}

/** One plain line for a finished trip in the history list. */
export function tripSummaryLine(trip: Trip, now = Date.now()): string {
  const where =
    trip.start_label && trip.end_label && trip.start_label !== trip.end_label
      ? `${trip.start_label} → ${trip.end_label}`
      : trip.start_label || trip.end_label || "Route not named";
  const parts = [where, formatDistance(trip.distance_m), formatDuration(tripDurationMs(trip, now))];
  return parts.join(" · ");
}

/** What Echo says while a trip is running. Running state is always visible. */
export function runningLine(trip: Trip, liveDistanceM: number | null, now = Date.now()): string {
  const dur = formatDuration(tripDurationMs(trip, now));
  const dist = liveDistanceM === null ? "distance not measured yet" : formatDistance(liveDistanceM);
  return `Trip running for ${dur} · ${dist}`;
}

/**
 * Honest wording for a trip that was left open. An auto-close reports what it
 * did and what it could not know — it never pretends to know where you stopped.
 */
export const STALE_TRIP_MS = 12 * 60 * 60 * 1000;

/**
 * "Keep this trip open" is respected, once. A session the person deliberately
 * held gets its clock measured from the hold instead of from the start, so a
 * long walk is not reaped while it is still happening — but the hold expires,
 * because an indefinite hold is background tracking with extra steps.
 */
export function staleTripDiff(
  trip: Trip,
  lastPointAt: string | null,
  now = Date.now(),
  heldAt: string | null = null,
): string | null {
  if (trip.ended_at) return null;
  const start = new Date(trip.started_at).getTime();
  if (!Number.isFinite(start)) return null;
  const held = heldAt ? new Date(heldAt).getTime() : NaN;
  const clockFrom = Number.isFinite(held) && held > start ? held : start;
  if (now - clockFrom < STALE_TRIP_MS) return null;
  const tail = lastPointAt ? new Date(lastPointAt).getTime() : start;
  const gap = formatDuration(now - tail);
  return `This trip ran for over 12 hours with nothing recorded for ${gap}. Echo closed it at the last point it had. Distance after that point is unknown — you can delete it or correct the end.`;
}


/** Kilometres per calendar week, newest first. Weeks with no trips are absent. */
export function weeklyMileage(trips: Trip[]): Array<{ weekStart: string; meters: number; trips: number }> {
  const buckets = new Map<string, { meters: number; trips: number }>();
  for (const t of trips) {
    const started = new Date(t.started_at);
    if (Number.isNaN(started.getTime())) continue;
    const d = new Date(Date.UTC(started.getUTCFullYear(), started.getUTCMonth(), started.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
    const key = d.toISOString().slice(0, 10);
    const b = buckets.get(key) ?? { meters: 0, trips: 0 };
    b.meters += Number.isFinite(Number(t.distance_m)) ? Number(t.distance_m) : 0;
    b.trips += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()]
    .map(([weekStart, b]) => ({ weekStart, ...b }))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

/** "You've ridden 84 km across 6 trips this week." — or nothing to say. */
export function thisWeekLine(trips: Trip[], now = Date.now()): string | null {
  const weeks = weeklyMileage(trips);
  if (weeks.length === 0) return null;
  const d = new Date(now);
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const key = monday.toISOString().slice(0, 10);
  const week = weeks.find((w) => w.weekStart === key);
  if (!week) return null;
  const measured = week.meters > 0;
  const count = `${week.trips} ${week.trips === 1 ? "trip" : "trips"}`;
  return measured
    ? `${formatDistance(week.meters)} across ${count} this week.`
    : `${count} this week. No distance recorded on them.`;
}

/**
 * The nearest saved place, if the pin is genuinely inside it. Used to say
 * "You're at Lamai" instead of a city name — and only when it is true.
 */
export const AT_PLACE_RADIUS_M = 300;
export function placeYouAreAt(
  fix: { lat: number; lon: number } | null,
  saved: Array<{ label: string; lat?: number | null; lon?: number | null }>,
  radiusM = AT_PLACE_RADIUS_M,
): string | null {
  if (!fix) return null;
  let best: { label: string; d: number } | null = null;
  for (const p of saved) {
    if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lon))) continue;
    const d = metersBetween(fix, { lat: Number(p.lat), lon: Number(p.lon) });
    if (d <= radiusM && (!best || d < best.d)) best = { label: p.label, d };
  }
  return best?.label ?? null;
}
