// routeMap — the flight path as points you can tap.
//
// Doctrine:
//   - Every stop comes off a leg already on record. No stop is invented, and an
//     airport with no kept coordinate is listed as a stop without a place on the
//     map rather than pinned to a guess.
//   - The drawing is a drawing. It carries no status and no position claim; the
//     deck above it owns the live reading.
//
// Pure module: no IO, no React.
import { airport, airportPoint, type Point } from "@/lib/airports";
import type { Journey } from "@/lib/journey";

export type RouteStop = {
  iata: string;
  city: string | null;
  country: string | null;
  /** Where it sits, or null when Echo keeps no coordinate for it. */
  point: Point | null;
  /** First airport of the trip, a change on the way, or the final one. */
  role: "origin" | "stop" | "final";
  /** The leg that leaves this stop, when there is one. */
  outboundFlight: string | null;
  /** The recorded leg that leaves this stop. */
  outboundPlanId: string | null;
  /** The filed instant at this stop — leaving it, or landing at it. Null when none. */
  at: string | null;
};

/** The stops of a journey, in order, without repeats. */
export function routeStops(journey: Journey | null | undefined): RouteStop[] {
  const legs = journey?.legs ?? [];
  const codes: Array<{ iata: string; out: string | null; planId: string | null; at: string | null }> = [];
  for (const leg of legs) {
    const from = (leg.from.iata ?? "").trim().toUpperCase();
    const to = (leg.to.iata ?? "").trim().toUpperCase();
    if (from && codes[codes.length - 1]?.iata !== from) {
      codes.push({ iata: from, out: leg.flight_no ?? null, planId: leg.plan_id, at: leg.from.at ?? null });
    } else if (from && codes.length) {
      codes[codes.length - 1].out = leg.flight_no ?? null;
      codes[codes.length - 1].planId = leg.plan_id;
    }
    if (to && codes[codes.length - 1]?.iata !== to) codes.push({ iata: to, out: null, planId: null, at: leg.to.at ?? null });
  }
  return codes.map((c, i) => {
    const a = airport(c.iata);
    return {
      iata: c.iata,
      city: a?.city ?? null,
      country: a?.country ?? null,
      point: airportPoint(c.iata),
      role: i === 0 ? "origin" : i === codes.length - 1 ? "final" : "stop",
      outboundFlight: c.out,
      outboundPlanId: c.planId,
      at: c.at,
    } as RouteStop;
  });
}

export type PlacedStop = RouteStop & { x: number; y: number };

export type GeoPoint = { lat: number; lon: number };

/**
 * Points along the shortest path over the earth. This is deliberately pure:
 * it draws geography, never an aircraft estimate.
 */
export function greatCirclePoints(a: GeoPoint, b: GeoPoint, steps = 64): GeoPoint[] {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const toDeg = (n: number) => (n * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lon);
  const dot = Math.min(1, Math.max(-1,
    Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1),
  ));
  const angle = Math.acos(dot);
  const count = Math.max(2, Math.round(steps));
  if (angle < 1e-8) return [a, b];

  return Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const sinAngle = Math.sin(angle);
    const wa = Math.sin((1 - t) * angle) / sinAngle;
    const wb = Math.sin(t * angle) / sinAngle;
    const x = wa * Math.cos(lat1) * Math.cos(lon1) + wb * Math.cos(lat2) * Math.cos(lon2);
    const y = wa * Math.cos(lat1) * Math.sin(lon1) + wb * Math.cos(lat2) * Math.sin(lon2);
    const z = wa * Math.sin(lat1) + wb * Math.sin(lat2);
    const lon = ((toDeg(Math.atan2(y, x)) + 540) % 360) - 180;
    return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon };
  });
}

/** Split at the date line so a renderer never closes a Pacific route the long way. */
export function splitAtDateline(points: GeoPoint[]): GeoPoint[][] {
  if (!points.length) return [];
  const lines: GeoPoint[][] = [[points[0]]];
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (Math.abs(current.lon - previous.lon) > 180) lines.push([current]);
    else lines[lines.length - 1].push(current);
  }
  return lines.filter((line) => line.length > 1);
}

export type RouteLegVisual = {
  from: RouteStop & { point: Point };
  to: RouteStop & { point: Point };
  index: number;
  state: "complete" | "current" | "upcoming";
  record: "confirmed" | "proposed";
  paths: GeoPoint[][];
};

/** Visual state comes from the journey's active leg, never from the wall clock. */
export function routeLegVisuals(
  stops: RouteStop[],
  activeLegIndex: number | null,
  confirmedPlanIds: ReadonlySet<string> = new Set(),
): RouteLegVisual[] {
  const legs: RouteLegVisual[] = [];
  for (let i = 0; i < stops.length - 1; i += 1) {
    const from = stops[i];
    const to = stops[i + 1];
    if (!from.point || !to.point) continue;
    const state = activeLegIndex === null ? "upcoming" : i < activeLegIndex ? "complete" : i === activeLegIndex ? "current" : "upcoming";
    legs.push({
      from: from as RouteStop & { point: Point },
      to: to as RouteStop & { point: Point },
      index: i,
      state,
      record: from.outboundPlanId && confirmedPlanIds.has(from.outboundPlanId) ? "confirmed" : "proposed",
      paths: splitAtDateline(greatCirclePoints(from.point, to.point)),
    });
  }
  return legs;
}

/**
 * Stops placed inside a box, equirectangular, fitted to the stops themselves.
 * Longitudes are unwrapped so a Pacific crossing draws as one line instead of
 * jumping the dateline. Stops with no coordinate are dropped from the drawing
 * and reported separately by the caller.
 */
export function placeStops(
  stops: RouteStop[],
  box: { width: number; height: number; pad?: number },
): PlacedStop[] {
  const known = stops.filter((s): s is RouteStop & { point: Point } => !!s.point);
  if (!known.length) return [];

  const lons: number[] = [];
  for (const [i, s] of known.entries()) {
    if (i === 0) {
      lons.push(s.point.lon);
      continue;
    }
    const prev = lons[i - 1];
    let lon = s.point.lon;
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    lons.push(lon);
  }

  const lats = known.map((s) => s.point.lat);
  const pad = box.pad ?? 22;
  const spanX = Math.max(1, Math.max(...lons) - Math.min(...lons));
  const spanY = Math.max(1, Math.max(...lats) - Math.min(...lats));
  const minLon = Math.min(...lons);
  const maxLat = Math.max(...lats);

  return known.map((s, i) => ({
    ...s,
    x: pad + ((lons[i] - minLon) / spanX) * (box.width - pad * 2),
    y: pad + ((maxLat - s.point.lat) / spanY) * (box.height - pad * 2),
  }));
}

/** One bowed segment between two placed stops, the way a track looks on paper. */
export function arcPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  /* Bow perpendicular to the line, a fifth of its length. */
  const bow = Math.min(34, len / 5);
  const cx = mx + (-dy / len) * bow;
  const cy = my + (dx / len) * bow;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}
