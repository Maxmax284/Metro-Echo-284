// FlightRadarMapInner — the route on a real map, with the aircraft where the
// airline says it is.
//
// Doctrine:
//   - Airports are drawn from the kept coordinate table. One with no coordinate
//     is not pinned to a guess; the caller lists it in words instead.
//   - The aircraft is drawn only from a filed fix. No fix, no plane — the line
//     still draws, because the route is on record even when the position isn't.
//   - Tapping a stop is a read. Nothing on this map writes anything.
import { useEffect } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlacedStop, RouteStop } from "@/lib/routeMap";

export type Aircraft = {
  lat: number;
  lon: number;
  /** Filed heading in degrees, or null to leave the marker upright. */
  heading: number | null;
  label: string;
};

function stopIcon(on: boolean, role: RouteStop["role"]): L.DivIcon {
  const size = role === "stop" ? 11 : 14;
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${
      on ? "hsl(var(--primary))" : "hsl(var(--background))"
    };border:2px solid hsl(var(--primary));box-shadow:0 0 0 ${on ? 5 : 2}px hsl(var(--primary)/0.25)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function planeIcon(heading: number | null): L.DivIcon {
  /* The glyph points north at rest, so the filed heading turns it directly. */
  const turn = heading === null ? 0 : heading;
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:22px;height:22px;transform:rotate(${turn}deg);color:hsl(var(--primary))">
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
  onSelect,
}: {
  /** Stops with a kept coordinate, in route order. */
  stops: PlacedStop[];
  aircraft: Aircraft | null;
  selected: string | null;
  onSelect: (iata: string) => void;
}) {
  const line = stops.map((s) => [s.point!.lat, s.point!.lon] as [number, number]);
  const all: Array<[number, number]> = aircraft ? [...line, [aircraft.lat, aircraft.lon]] : line;
  if (!line.length) return null;

  return (
    <MapContainer
      center={line[0]}
      zoom={3}
      scrollWheelZoom={false}
      className="h-[240px] w-full"
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
      />
      <Fit points={all} />
      {line.length > 1 && (
        <Polyline positions={line} pathOptions={{ color: "hsl(var(--primary))", weight: 2, opacity: 0.85 }} />
      )}
      {stops.map((s) => (
        <Marker
          key={s.iata}
          position={[s.point!.lat, s.point!.lon]}
          icon={stopIcon(s.iata === selected, s.role)}
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
