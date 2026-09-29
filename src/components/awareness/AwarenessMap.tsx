// AwarenessMap — the picture that sits under the read, never above it.
//
// Doctrine:
//   - the words come first. This map is confirmation, not the answer.
//   - it shows only what is recorded: places you saved, and the points from
//     trips you started yourself. Nothing is drawn from a guess.
//   - the current pin can be dragged. Dragging it is you telling Echo where
//     you are, so it is saved as "set by you" — never as a device fix.
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useTrips } from "@/hooks/useTrips";
import { vantaSay, vantaToast as toast } from "@/lib/vantaVoice";
import { placePatchForFix } from "@/lib/placeMove";
import { placeTruth, placeSourceBadge, type PlaceLike } from "@/lib/placeTruth";
import { fieldRead } from "@/lib/fieldRead";
import { formatDistance } from "@/lib/trips";

const MAPBOX_TOKEN = import.meta.env.VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN as string | undefined;

const markerIcon = L.icon({
  iconUrl: "/vendor/leaflet/marker-icon.png",
  iconRetinaUrl: "/vendor/leaflet/marker-icon-2x.png",
  shadowUrl: "/vendor/leaflet/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const savedIcon = L.divIcon({
  className: "",
  html:
    '<span style="display:block;width:12px;height:12px;border-radius:9999px;background:hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--background))"></span>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const tripPointIcon = L.divIcon({
  className: "",
  html:
    '<span style="display:block;width:9px;height:9px;border-radius:9999px;background:hsl(var(--accent));box-shadow:0 0 0 2px hsl(var(--background))"></span>',
  iconSize: [9, 9],
  iconAnchor: [4.5, 4.5],
});

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 12));
  }, [center, map]);
  return null;
}

type PlaceRow = PlaceLike & { id: string; label: string };

/** Named ground around the fix: map-data towns and scanned venues. */
export type NearbyMapPin = {
  key: string;
  name: string;
  detail?: string | null;
  lat: number;
  lon: number;
  distanceM?: number | null;
  source: "map" | "scan";
};

const nearbyIcon = L.divIcon({
  className: "",
  html:
    '<span style="display:block;width:10px;height:10px;border-radius:2px;background:hsl(var(--muted-foreground));box-shadow:0 0 0 2px hsl(var(--background))"></span>',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

export function AwarenessMap({
  places,
  nearby,
  className,
  onMoved,
  onSelectPlace,
}: {
  places: PlaceRow[];
  nearby?: NearbyMapPin[];
  className?: string;
  onMoved?: () => void;
  /** Tapping one of your own pins. Switching is always your tap. */
  onSelectPlace?: (id: string) => void;
}) {
  const { place, refresh } = useAwareness();
  const { points, running } = useTrips();
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const [focus, setFocus] = useState<{ name: string; detail: string } | null>(null);
  const startRef = useRef<[number, number] | null>(null);

  const active = useMemo(() => {
    const g = (place?.geo ?? {}) as { lat?: number; lon?: number };
    const lat = Number(g?.lat);
    const lon = Number(g?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? ([lat, lon] as [number, number]) : null;
  }, [place?.id, place?.geo]);

  const saved = useMemo(
    () =>
      places
        .filter((p) => p.id !== place?.id)
        .map((p) => {
          const g = (p.geo ?? {}) as { lat?: number; lon?: number };
          const lat = Number(g?.lat);
          const lon = Number(g?.lon);
          return Number.isFinite(lat) && Number.isFinite(lon)
            ? { id: p.id, label: p.label, at: [lat, lon] as [number, number] }
            : null;
        })
        .filter((x): x is { id: string; label: string; at: [number, number] } => x !== null),
    [places, place?.id],
  );

  /* The trip you are on right now, drawn from the points it recorded. */
  const lines = useMemo(() => {
    const line = (points ?? [])
      .map((pt) => [Number(pt.lat), Number(pt.lon)] as [number, number])
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
    return line.length > 1 ? [line] : [];
  }, [points]);

  /* Every recorded point of the open trip, so the line can be read and not
     just seen. Labels come from the shared field read — same words as Today. */
  const tripPoints = useMemo(() => {
    const read = fieldRead(running, points, []);
    return (read?.points ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  }, [running, points]);

  if (!active && saved.length === 0) {
    return (
      <div className={className}>
        <div className="vanta-card rounded-xl p-3 text-[11.5px] text-muted-foreground">
          Nothing to draw yet. Set where you are, or save a place you keep coming back to, and it will show up here.
        </div>
      </div>
    );
  }

  const center = drag ?? active ?? saved[0].at;
  if (!startRef.current) startRef.current = center;
  const truth = placeTruth(place as PlaceLike | null);

  const savePin = async () => {
    if (!drag || !place) return;
    setSaving(true);
    /* Drop a pin far from the last one and the old names go with it — Echo
       stays quiet about the spot until the lookup for it answers. */
    const patch = placePatchForFix(place as any, { lat: drag[0], lon: drag[1], acc: 30, source: "manual_fix" });
    const { error } = await supabase
      .from("awareness_places")
      .update(patch)
      .eq("id", place.id);
    setSaving(false);
    if (error) {
      toast.error(vantaSay.couldntSave());
      return;
    }
    toast.success("Place set by you. Echo will read from here.");
    setDrag(null);
    /* The name of the new spot has to be looked up again before Echo says it. */
    supabase.functions.invoke("awareness-geocode", { body: { place_id: place.id, force: true } }).catch(() => {});
    await refresh();
    onMoved?.();
  };

  return (
    <section className={className} aria-label="Map of your places and trips">
      <div className="vanta-card overflow-hidden rounded-xl">
        <div className="flex items-start gap-2 px-3 pt-3">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
          <div className="min-w-0">
            <div className="text-[12px] font-semibold">Where this is coming from</div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {truth.line} {placeSourceBadge(truth)}.
            </p>
          </div>
        </div>
        <div className="mt-2 h-[220px] w-full">
          <MapContainer center={startRef.current} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
            {/* Same dark basemap as the board above, so the room reads as one
                surface instead of two unrelated maps. */}
            <TileLayer
              attribution={
                MAPBOX_TOKEN
                  ? '&copy; Mapbox &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  : '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              }
              url={MAPBOX_TOKEN
                ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`
                : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
              {...(MAPBOX_TOKEN ? { tileSize: 512, zoomOffset: -1 } : {})}
            />
            <Recenter center={center} />
            {lines.map((line, i) => (
              <Polyline key={i} positions={line} pathOptions={{ color: "hsl(var(--accent))", weight: 3, opacity: 0.7 }} />
            ))}
            {tripPoints.map((p) => (
              <Marker key={`${p.at}-${p.kind}`} position={[p.lat, p.lon]} icon={tripPointIcon}>
                <Tooltip>{p.line}</Tooltip>
              </Marker>
            ))}
            {saved.map((s) => (
              <Marker
                key={s.id}
                position={s.at}
                icon={savedIcon}
                eventHandlers={{
                  click: () => {
                    setFocus({ name: s.label, detail: "One of your saved places. Tap again to read from here." });
                    onSelectPlace?.(s.id);
                  },
                }}
              >
                <Tooltip>{s.label}</Tooltip>
              </Marker>
            ))}
            {/* Named ground around the fix. Recorded lookups only — tapping one
                says what it is, it never moves your place. */}
            {(nearby ?? [])
              .filter((n) => Number.isFinite(n.lat) && Number.isFinite(n.lon))
              .map((n) => (
                <Marker
                  key={n.key}
                  position={[n.lat, n.lon]}
                  icon={nearbyIcon}
                  eventHandlers={{
                    click: () =>
                      setFocus({
                        name: Number.isFinite(Number(n.distanceM))
                          ? `${n.name} — ${formatDistance(Number(n.distanceM))} away`
                          : n.name,
                        detail:
                          n.detail?.trim() ||
                          (n.source === "map"
                            ? "From the nearby-places lookup — map data, not a web search."
                            : "Found by the last read of this spot."),
                      }),
                  }}
                >
                  <Tooltip>{n.name}</Tooltip>
                </Marker>
              ))}
            {active && (
              <Marker
                position={drag ?? active}
                draggable
                icon={markerIcon}
                eventHandlers={{
                  dragend: (e) => {
                    const ll = (e.target as L.Marker).getLatLng();
                    setDrag([ll.lat, ll.lng]);
                  },
                }}
              >
                <Tooltip>{place?.label ?? "Where you are"}</Tooltip>
              </Marker>
            )}
          </MapContainer>
        </div>
        {/* What you last tapped on the map, said in words. */}
        {focus ? (
          <div className="border-t border-border/50 px-3 py-2">
            <div className="text-[12.5px] font-medium leading-snug text-foreground">{focus.name}</div>
            <p className="text-[11px] leading-snug text-muted-foreground">{focus.detail}</p>
          </div>
        ) : null}
        <div className="flex items-center gap-2 px-3 py-2">
          {drag ? (
            <>
              <Button size="sm" className="h-9 flex-1 gap-1.5 text-[12px]" onClick={savePin} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Use this spot
              </Button>
              <Button size="sm" variant="ghost" className="h-9 text-[12px]" onClick={() => setDrag(null)}>
                Put it back
              </Button>
            </>
          ) : (
            <p className="text-[10.5px] leading-snug text-muted-foreground/80">
              Drag the pin if Echo has you in the wrong spot. Nothing changes until you say to use it.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
