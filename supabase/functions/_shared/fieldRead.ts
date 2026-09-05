// fieldRead — how an open trip is described while you are still in it.
//
// Doctrine:
//   - the trip IS the session. Nothing here invents a second one.
//   - three parts, in the same order as an arrival: the read (what is running
//     and how far it has gone), the summary (the last recorded fact), and the
//     one next move ("I'm here" closes it).
//   - only recorded points are described. No interpolation, no guessing where
//     you went between them, no claim about where you are heading.
//   - distance to next is the distance to the nearest saved place from the last
//     recorded point. If nothing is saved nearby, it says so instead of padding.
//
// Pure module: no IO, no React. Today, the Aware room and Telegram all read
// from this, so a running trip never gets two different descriptions.

import {
  formatDistance,
  formatDuration,
  metersBetween,
  pathDistanceMeters,
  tripDurationMs,
  type Trip,
  type TripPoint,
} from "./trips.ts";

export type FieldPlace = { id: string; label: string; lat: number; lon: number };

export type FieldPointRead = {
  at: string;
  kind: string;
  label: string | null;
  lat: number;
  lon: number;
  /** "Stop · 18:42 · 1.2 km in" */
  line: string;
};

export type FieldRead = {
  /** "Walk running for 22 min · 1.4 km" */
  headline: string;
  isWalk: boolean;
  distanceM: number | null;
  points: FieldPointRead[];
  /** Nearest saved place to the last recorded point. */
  nextPlace: { id: string; label: string; distanceM: number } | null;
  /** "Lamai is 1.2 km from your last point." */
  nextLine: string;
  /** The same three-part shape the arrivals lane uses. */
  read: string;
  summary: string;
  nextStep: string;
};

/** Trips whose purpose marks them as a walk session. Frozen wire value. */
const WALK = "walk_with_me";

function clock(at: string): string {
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return "time not recorded";
  return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function kindWord(kind: string): string {
  if (kind === "start") return "Started";
  if (kind === "end") return "Ended";
  if (kind === "stop") return "Stop";
  if (kind === "checkin") return "Checked in";
  return "Point";
}

function ageWords(at: string, now: number): string {
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return "at an unrecorded time";
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)} days ago`;
}

function nearest(
  from: { lat: number; lon: number },
  places: FieldPlace[],
): { id: string; label: string; distanceM: number } | null {
  let best: { id: string; label: string; distanceM: number } | null = null;
  for (const p of places) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const d = metersBetween(from, { lat: p.lat, lon: p.lon });
    if (!best || d < best.distanceM) best = { id: p.id, label: p.label, distanceM: d };
  }
  return best;
}

/**
 * Read an open trip. Returns null when there is nothing running — field mode is
 * only ever a state you started on purpose.
 */
export function fieldRead(
  trip: Trip | null,
  points: TripPoint[],
  places: FieldPlace[] = [],
  now = Date.now(),
): FieldRead | null {
  if (!trip || trip.ended_at) return null;

  const isWalk = (trip.purpose ?? "") === WALK;
  const ordered = [...points].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );
  const distanceM = ordered.length > 1 ? pathDistanceMeters(ordered) : null;
  const noun = isWalk ? "Walk" : "Trip";
  const dur = formatDuration(tripDurationMs(trip, now));

  const pointReads: FieldPointRead[] = ordered.map((pt, i) => {
    const so_far = i > 0 ? pathDistanceMeters(ordered.slice(0, i + 1)) : 0;
    const lat = Number(pt.lat);
    const lon = Number(pt.lon);
    const bits = [kindWord(pt.kind), clock(pt.recorded_at)];
    if (i > 0) bits.push(`${formatDistance(so_far)} in`);
    if (pt.label) bits.push(pt.label);
    return { at: pt.recorded_at, kind: pt.kind, label: pt.label ?? null, lat, lon, line: bits.join(" · ") };
  });

  const last = ordered.length ? ordered[ordered.length - 1] : null;
  const nextPlace =
    last && Number.isFinite(Number(last.lat)) && Number.isFinite(Number(last.lon))
      ? nearest({ lat: Number(last.lat), lon: Number(last.lon) }, places)
      : null;

  const nextLine = !last
    ? "No point recorded yet, so there's no distance to measure from."
    : nextPlace
      ? nextPlace.distanceM <= 120
        ? `You're at ${nextPlace.label} by your last point.`
        : `${nextPlace.label} is ${formatDistance(nextPlace.distanceM)} from your last point.`
      : "No saved place near your last point, so there's nothing to measure against.";

  const headline = `${noun} running for ${dur} · ${
    distanceM === null ? "distance not measured yet" : formatDistance(distanceM)
  }`;

  const started = trip.start_label ? `from ${trip.start_label}` : "without a place name";
  const read = `${noun} you started ${started}, still open — ${
    distanceM === null ? "no distance measured yet" : formatDistance(distanceM)
  } over ${dur}.`;

  const summary = last
    ? `Last point ${ageWords(last.recorded_at, now)} · ${pointReads[pointReads.length - 1].line}. ${nextLine}`
    : `Nothing recorded yet. ${nextLine}`;

  const nextStep = nextPlace && nextPlace.distanceM <= 400
    ? `Tap I'm here to close it at ${nextPlace.label}.`
    : "Tap I'm here when you arrive, or mark a stop on the way.";

  return { headline, isWalk, distanceM, points: pointReads, nextPlace, nextLine, read, summary, nextStep };
}
