import { useMemo } from "react";
import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { greatCirclePoints, routeLegVisuals, type GeoPoint, type RouteStop } from "@/lib/routeMap";
import type { Aircraft } from "./FlightRadarMapInner";

const W = 320;
const H = 224;
const R = 92;
const CX = W / 2;
const CY = H / 2;

function meanCenter(stops: RouteStop[]): GeoPoint {
  const points = stops.flatMap((stop) => stop.point ? [stop.point] : []);
  if (!points.length) return { lat: 0, lon: 0 };
  /* Centre the full journey's endpoints, not every connection. Repeated stops
     near the destination would otherwise push a long-haul origin behind the
     globe even though both ends fit on one hemisphere. */
  const anchors = points.length > 1 ? [points[0], points[points.length - 1]] : points;
  const xyz = anchors.reduce((sum, point) => {
    const lat = point.lat * Math.PI / 180;
    const lon = point.lon * Math.PI / 180;
    return {
      x: sum.x + Math.cos(lat) * Math.cos(lon),
      y: sum.y + Math.cos(lat) * Math.sin(lon),
      z: sum.z + Math.sin(lat),
    };
  }, { x: 0, y: 0, z: 0 });
  return {
    lat: Math.atan2(xyz.z, Math.hypot(xyz.x, xyz.y)) * 180 / Math.PI,
    lon: Math.atan2(xyz.y, xyz.x) * 180 / Math.PI,
  };
}

function project(point: GeoPoint, center: GeoPoint) {
  const lat = point.lat * Math.PI / 180;
  const lon = point.lon * Math.PI / 180;
  const lat0 = center.lat * Math.PI / 180;
  const lon0 = center.lon * Math.PI / 180;
  const dLon = lon - lon0;
  const visible = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(dLon) >= 0;
  return {
    x: CX + R * Math.cos(lat) * Math.sin(dLon),
    y: CY - R * (Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(dLon)),
    visible,
  };
}

function visiblePaths(points: GeoPoint[], center: GeoPoint): string[] {
  const paths: string[] = [];
  let current = "";
  points.forEach((point) => {
    const p = project(point, center);
    if (!p.visible) {
      if (current) paths.push(current);
      current = "";
      return;
    }
    current += `${current ? " L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  });
  if (current) paths.push(current);
  return paths;
}

export function FlightRouteGlobe({
  stops,
  aircraft,
  activeLegIndex,
  confirmedPlanIds,
  selected,
  onSelect,
}: {
  stops: RouteStop[];
  aircraft: Aircraft | null;
  activeLegIndex: number | null;
  confirmedPlanIds: ReadonlySet<string>;
  selected: string | null;
  onSelect: (iata: string) => void;
}) {
  const center = useMemo(() => meanCenter(stops), [stops]);
  const legs = useMemo(() => routeLegVisuals(stops, activeLegIndex, confirmedPlanIds), [stops, activeLegIndex, confirmedPlanIds]);
  const plane = aircraft ? project({ lat: aircraft.lat, lon: aircraft.lon }, center) : null;

  return (
    <div className="relative h-[224px] overflow-hidden bg-background/60" data-testid="route-globe">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Globe view of your journey">
        <defs>
          <radialGradient id="route-globe-atmosphere" cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.15" />
            <stop offset="72%" stopColor="hsl(var(--surface))" stopOpacity="0.9" />
            <stop offset="100%" stopColor="hsl(var(--background))" />
          </radialGradient>
          <clipPath id="route-globe-clip"><circle cx={CX} cy={CY} r={R} /></clipPath>
        </defs>
        <circle cx={CX} cy={CY} r={R + 5} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.12" className="flight-route-pulse" />
        <circle cx={CX} cy={CY} r={R} fill="url(#route-globe-atmosphere)" stroke="hsl(var(--border))" />
        <g clipPath="url(#route-globe-clip)" opacity="0.35" aria-hidden>
          {[-60, -30, 0, 30, 60].map((lat) => {
            const points = Array.from({ length: 121 }, (_, i) => ({ lat, lon: -180 + i * 3 }));
            return visiblePaths(points, center).map((d, j) => <path key={`lat-${lat}-${j}`} d={d} fill="none" stroke="hsl(var(--border))" />);
          })}
          {[-120, -60, 0, 60, 120, 180].map((lon) => {
            const points = Array.from({ length: 61 }, (_, i) => ({ lat: -90 + i * 3, lon }));
            return visiblePaths(points, center).map((d, j) => <path key={`lon-${lon}-${j}`} d={d} fill="none" stroke="hsl(var(--border))" />);
          })}
        </g>
        {legs.flatMap((leg) => visiblePaths(greatCirclePoints(leg.from.point, leg.to.point), center).map((d, j) => (
          <path
            key={`${leg.index}-${j}`}
            d={d}
            fill="none"
            stroke={leg.state === "complete" ? "hsl(var(--signal))" : "hsl(var(--primary))"}
            strokeOpacity={leg.state === "upcoming" ? 0.38 : 0.95}
            strokeWidth={leg.state === "current" ? 2.4 : 1.6}
            strokeDasharray={leg.record === "proposed" ? "4 4" : undefined}
            className={leg.state === "current" ? "flight-arc-draw" : undefined}
          />
        )))}
        {stops.map((stop) => {
          if (!stop.point) return null;
          const p = project(stop.point, center);
          if (!p.visible) return null;
          const on = selected === stop.iata;
          return (
            <g key={stop.iata} role="button" tabIndex={0} aria-label={`${stop.iata}${stop.city ? ` · ${stop.city}` : ""}`} onClick={() => onSelect(stop.iata)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(stop.iata); }} className="cursor-pointer outline-none">
              <circle cx={p.x} cy={p.y} r="12" fill="transparent" />
              <circle cx={p.x} cy={p.y} r={on ? 4 : 3} fill={on ? "hsl(var(--primary))" : "hsl(var(--background))"} stroke="hsl(var(--primary))" strokeWidth="1.5" />
              <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="9" fill="hsl(var(--foreground))" className="font-mono">{stop.iata}</text>
            </g>
          );
        })}
      </svg>
      {plane?.visible && aircraft && (
        <Plane
          aria-label={aircraft.label}
          className={cn("pointer-events-none absolute h-5 w-5 text-primary flight-plane-position", aircraft.heading !== null && "flight-plane-heading")}
          style={{ left: `${(plane.x / W) * 100}%`, top: `${(plane.y / H) * 100}%`, transform: `translate(-50%, -50%) rotate(${aircraft.heading ?? 0}deg)` }}
        />
      )}
    </div>
  );
}