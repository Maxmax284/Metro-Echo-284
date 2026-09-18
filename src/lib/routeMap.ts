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
};

/** The stops of a journey, in order, without repeats. */
export function routeStops(journey: Journey | null | undefined): RouteStop[] {
  const legs = journey?.legs ?? [];
  const codes: Array<{ iata: string; out: string | null }> = [];
  for (const leg of legs) {
    const from = (leg.from.iata ?? "").trim().toUpperCase();
    const to = (leg.to.iata ?? "").trim().toUpperCase();
    if (from && codes[codes.length - 1]?.iata !== from) codes.push({ iata: from, out: leg.flight_no ?? null });
    else if (from && codes.length) codes[codes.length - 1].out = leg.flight_no ?? null;
    if (to && codes[codes.length - 1]?.iata !== to) codes.push({ iata: to, out: null });
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
    } as RouteStop;
  });
}

export type PlacedStop = RouteStop & { x: number; y: number };

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
