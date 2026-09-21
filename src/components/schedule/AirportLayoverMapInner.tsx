import { useEffect } from "react";
import { Circle, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Point } from "@/lib/airports";

function HoldAirport({ point }: { point: Point }) {
  const map = useMap();
  useEffect(() => {
    map.setView([point.lat, point.lon], 15, { animate: false });
  }, [map, point.lat, point.lon]);
  return null;
}

export function AirportLayoverMapInner({ point, iata }: { point: Point; iata: string }) {
  return (
    <MapContainer
      center={[point.lat, point.lon]}
      zoom={15}
      minZoom={12}
      maxZoom={18}
      scrollWheelZoom={false}
      attributionControl={false}
      className="h-[210px] w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <HoldAirport point={point} />
      <Circle
        center={[point.lat, point.lon]}
        radius={115}
        pathOptions={{ color: "hsl(var(--primary))", fillColor: "hsl(var(--primary))", fillOpacity: 0.15, weight: 2 }}
      >
        <Tooltip permanent direction="top" offset={[0, -8]} opacity={1}>
          {iata} · airport reference point
        </Tooltip>
      </Circle>
    </MapContainer>
  );
}
