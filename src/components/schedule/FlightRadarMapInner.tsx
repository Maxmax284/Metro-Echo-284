// FlightRadarMapInner — the route on a real map, with the aircraft where the
// airline says it is.
//
// Doctrine:
//   - Airports are drawn from the kept coordinate table. One with no coordinate
//     is not pinned to a guess; the caller lists it in words instead.
//   - The aircraft is drawn only from a filed fix. No fix, no plane — the line
//     still draws, because the route is on record even when the position isn't.
//   - Tapping a stop is a read. Nothing on this map writes anything.
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { routeLegVisuals, type PlacedStop, type RouteStop } from "@/lib/routeMap";

export type Aircraft = {
  lat: number;
  lon: number;
  /** Filed heading in degrees, or null to leave the marker upright. */
  heading: number | null;
  label: string;
};

function stopIcon(on: boolean, role: RouteStop["role"], code: string): L.DivIcon {
  const size = role === "stop" ? 11 : 14;
  return L.divIcon({
    className: "",
    html: `<span style="position:relative;display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${
      on ? "hsl(var(--primary))" : "hsl(var(--background))"
    };border:2px solid hsl(var(--primary));box-shadow:0 0 0 ${on ? 5 : 2}px hsl(var(--primary)/0.25)"><span style="position:absolute;left:50%;top:-18px;transform:translateX(-50%);font:600 10px ui-monospace,monospace;color:hsl(var(--foreground));text-shadow:0 1px 4px hsl(var(--background))">${code}</span></span>`,
    iconSize: [Math.max(size, 30), size],
    iconAnchor: [size / 2, size / 2],
  });
}

function planeIcon(heading: number | null): L.DivIcon {
  /* The glyph points north at rest, so the filed heading turns it directly. */
  const turn = heading === null ? 0 : heading;
  return L.divIcon({
    className: "",
    html: `<span class="flight-plane-position" style="display:block;width:22px;height:22px;transform:rotate(${turn}deg);color:hsl(var(--primary));filter:drop-shadow(0 0 5px hsl(var(--primary)/.45))">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
        <path d="M12 2l2 7 8 3v2l-8-1.5V19l3 2v1l-5-1.5L9 22v-1l3-2v-6.5L4 14v-2l8-3z"/>
      </svg></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function Fit({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 6);
      return;
    }
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points).pad(0.2), { animate: false });
    }
  }, [points, map]);
  return null;
}

export function FlightRadarMapInner({
  stops,
  aircraft,
  selected,
  activeLegIndex,
  confirmedPlanIds,
  onSelect,
}: {
  /** Stops with a kept coordinate, in route order. */
  stops: PlacedStop[];
  aircraft: Aircraft | null;
  selected: string | null;
  activeLegIndex: number | null;
  confirmedPlanIds: ReadonlySet<string>;
  onSelect: (iata: string) => void;
}) {
  const line = stops.map((s) => [s.point!.lat, s.point!.lon] as [number, number]);
  const all: Array<[number, number]> = aircraft ? [...line, [aircraft.lat, aircraft.lon]] : line;
  const legs = useMemo(() => routeLegVisuals(stops, activeLegIndex, confirmedPlanIds), [stops, activeLegIndex, confirmedPlanIds]);
  if (!line.length) return null;

  return (
    <MapContainer
      center={line[0]}
      zoom={3}
      scrollWheelZoom={false}
      className="h-[240px] w-full"
      attributionControl={false}
    >
      {/* Same open tiles the rest of Metro Echo uses — no key, no account. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Fit points={all} />
      {legs.flatMap((leg) => leg.paths.map((path, pathIndex) => (
        <Polyline
          key={`${leg.index}-${pathIndex}`}
          positions={path.map((point) => [point.lat, point.lon] as [number, number])}
          pathOptions={{
            color: leg.state === "complete" ? "hsl(var(--signal))" : "hsl(var(--primary))",
            weight: leg.state === "current" ? 3 : 2,
            opacity: leg.state === "upcoming" ? 0.48 : 0.92,
            dashArray: leg.record === "proposed" ? "6 7" : undefined,
            className: leg.state === "current" ? "flight-arc-draw" : undefined,
          }}
        />
      )))}
      {stops.map((s) => (
        <Marker
          key={s.iata}
          position={[s.point!.lat, s.point!.lon]}
          icon={stopIcon(s.iata === selected, s.role, s.iata)}
          eventHandlers={{ click: () => onSelect(s.iata) }}
          alt={s.iata}
        >
          <Tooltip direction="top" offset={[0, -8]} opacity={1}>
            {s.iata}
            {s.city ? ` · ${s.city}` : ""}
          </Tooltip>
        </Marker>
      ))}
      {aircraft && (
        <Marker position={[aircraft.lat, aircraft.lon]} icon={planeIcon(aircraft.heading)} alt={aircraft.label}>
          <Tooltip direction="top" offset={[0, -10]} opacity={1}>
            {aircraft.label}
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
