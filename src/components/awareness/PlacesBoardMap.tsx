// PlacesBoardMap — every saved spot on one map. Tapping a pin opens that
// spot's board. Reading only: tapping never moves your own location.
//
// Doctrine:
//   - The map guards itself. Callers filter their spots, but this component
//     never trusts them: a spot without real coordinates is dropped here too.
//   - flyTo on a zero-size map (still hidden, not laid out yet) makes Leaflet
//     compute NaN internally and throw. The fly only happens once the map has
//     a real size.
//   - A map problem can never blank the room. The fence says so in words and
//     everything above the map still holds.
import { Component, useEffect, type ReactNode } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapSpot = { id: string; name: string; lat: number; lon: number };

const MAPBOX_TOKEN = import.meta.env.VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN as string | undefined;
// Mapbox dark basemap when the token is linked; Carto dark as the fallback.
const TILE_URL = MAPBOX_TOKEN
  ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
  : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

/** A spot only earns a pin with real coordinates. (0, 0) is a missing fix, not a place. */
const isRealSpot = (s: MapSpot) =>
  Number.isFinite(s.lat) && Number.isFinite(s.lon) && !(s.lat === 0 && s.lon === 0);

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
    if (!spot || !isRealSpot(spot)) return;
    const go = () => {
      const size = map.getSize();
      if (size.x > 0 && size.y > 0) {
        map.flyTo([spot.lat, spot.lon], Math.max(map.getZoom(), 9), { duration: 0.9 });
      }
    };
    if (map.getSize().x > 0 && map.getSize().y > 0) {
      go();
      return;
    }
    /* No size yet (hidden or mid-layout): wait a beat, re-measure, then fly —
       or leave the view where it is. Never fly blind. */
    const t = window.setTimeout(() => {
      map.invalidateSize();
      go();
    }, 150);
    return () => window.clearTimeout(t);
  }, [spot?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

class MapFence extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    if (this.state.broken) {
      return (
        <div className="vanta-card rounded-xl p-3 text-[11.5px] text-muted-foreground">
          The map didn't load this time. Your places and reads still hold — they come from the records, not the picture.
        </div>
      );
    }
    return this.props.children;
  }
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
  const real = spots.filter(isRealSpot);
  if (real.length === 0) return null;
  const active = real.find((s) => s.id === (activeId ?? liveId)) ?? real[0];
  return (
    <MapFence>
      <div className="field-polaroid relative overflow-hidden rounded-md border border-border/60">
        <div className="h-[200px] w-full">
          <MapContainer center={[active.lat, active.lon]} zoom={9} scrollWheelZoom={false} className="h-full w-full" attributionControl={false}>
            <TileLayer url={TILE_URL} {...(MAPBOX_TOKEN ? { tileSize: 512, zoomOffset: -1 } : {})} />
            <Fly spot={active} />
            {real.map((s) => (
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
    </MapFence>
  );
}
