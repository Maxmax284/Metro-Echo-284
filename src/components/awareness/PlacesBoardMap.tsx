// PlacesBoardMap — every saved spot on one map. Tapping a pin opens that
// spot's board. Reading only: tapping never moves your own location.
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapSpot = { id: string; name: string; lat: number; lon: number };

const MAPBOX_TOKEN = import.meta.env.VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN as string | undefined;
// Mapbox dark basemap when the token is linked; Carto dark as the fallback.
const TILE_URL = MAPBOX_TOKEN
  ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
  : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

const pin = (active: boolean, live: boolean) =>
  L.divIcon({
    className: "",
    html: `<span style="display:block;width:${active ? 18 : 12}px;height:${active ? 18 : 12}px;border-radius:9999px;background:hsl(var(${live ? "--primary" : "--warn"}));box-shadow:0 0 0 3px hsl(var(--background)),0 0 12px hsl(var(${live ? "--primary" : "--warn"}) / .7)"></span>`,
    iconSize: [active ? 18 : 12, active ? 18 : 12],
    iconAnchor: [active ? 9 : 6, active ? 9 : 6],
  });

function Fly({ spot }: { spot: MapSpot | null }) {
  const map = useMap();
  useEffect(() => {
    if (spot) map.flyTo([spot.lat, spot.lon], Math.max(map.getZoom(), 9), { duration: 0.9 });
  }, [spot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function PlacesBoardMap({
  spots,
  activeId,
  liveId,
  onSelect,
}: {
  spots: MapSpot[];
  activeId: string | null;
  liveId: string | null;
  onSelect: (id: string) => void;
}) {
  if (spots.length === 0) return null;
  const active = spots.find((s) => s.id === (activeId ?? liveId)) ?? spots[0];
  return (
    <div className="field-polaroid relative overflow-hidden rounded-md border border-border/60">
      <div className="h-[200px] w-full">
        <MapContainer center={[active.lat, active.lon]} zoom={9} scrollWheelZoom={false} className="h-full w-full" attributionControl={false}>
          <TileLayer url={TILE_URL} {...(MAPBOX_TOKEN ? { tileSize: 512, zoomOffset: -1 } : {})} />
          <Fly spot={active} />
          {spots.map((s) => (
            <Marker
              key={s.id}
              position={[s.lat, s.lon]}
              icon={pin(s.id === active.id, s.id === liveId)}
              eventHandlers={{ click: () => onSelect(s.id) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>{s.name}{s.id === liveId ? " · live" : ""}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p className="px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        Tap a pin to read that spot · your location stays put
        {MAPBOX_TOKEN ? " · © Mapbox © OpenStreetMap" : ""}
      </p>
    </div>
  );
}
