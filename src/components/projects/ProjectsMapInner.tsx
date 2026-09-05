// ProjectsMapInner — the picture of where the work is.
//
// It draws only places a person set on a project. Nothing is inferred from a
// device fix, and a project with no place simply isn't on the map. In picking
// mode a tap moves the pin; the tap is the person saying where it is.
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pin = L.divIcon({
  className: "",
  html:
    '<span style="display:block;width:14px;height:14px;border-radius:9999px;background:hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--background))"></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export type MapPin = { id: string; lat: number; lon: number; label: string };

function Fit({ pins, center }: { pins: MapPin[]; center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, Math.max(map.getZoom(), 12));
      return;
    }
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lon], 12);
      return;
    }
    if (pins.length > 1) {
      map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lon] as [number, number])).pad(0.25));
    }
  }, [pins, center, map]);
  return null;
}

function Picker({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function ProjectsMapInner({
  pins,
  center,
  onPick,
  onOpen,
  className,
}: {
  pins: MapPin[];
  /** Force the view somewhere, e.g. the pin being placed. */
  center?: [number, number] | null;
  /** When given, a tap on the map reports a new coordinate. */
  onPick?: (lat: number, lon: number) => void;
  onOpen?: (id: string) => void;
  className?: string;
}) {
  const start = useMemo<[number, number]>(() => {
    if (center) return center;
    if (pins.length > 0) return [pins[0].lat, pins[0].lon];
    return [13.7563, 100.5018];
  }, [center, pins]);

  return (
    <div className={className}>
      <MapContainer
        center={start}
        zoom={pins.length > 0 || center ? 11 : 4}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
        className="rounded-xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Fit pins={pins} center={center ?? null} />
        {onPick ? <Picker onPick={onPick} /> : null}
        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={pin}
            eventHandlers={onOpen ? { click: () => onOpen(p.id) } : undefined}
          >
            {p.label ? <Tooltip direction="top">{p.label}</Tooltip> : null}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
