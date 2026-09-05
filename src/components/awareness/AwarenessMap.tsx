// AwarenessMap — the picture that sits under the read, never above it.
//
// Doctrine:
//   - the words come first. This map is confirmation, not the answer.
//   - it shows only what is recorded: places you saved, and the points from
//     trips you started yourself. Nothing is drawn from a guess.
//   - the current pin can be dragged. Dragging it is you telling Vanta where
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
import { placeTruth, placeSourceBadge, type PlaceLike } from "@/lib/placeTruth";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
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

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 12));
  }, [center, map]);
  return null;
}

type PlaceRow = PlaceLike & { id: string; label: string };

export function AwarenessMap({
  places,
  className,
  onMoved,
}: {
  places: PlaceRow[];
  className?: string;
  onMoved?: () => void;
}) {
  const { place, refresh } = useAwareness();
  const { points } = useTrips();
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<[number, number] | null>(null);
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

  /* Trip lines, newest trip first. Only points a person's own trip recorded. */
  const lines = useMemo(() => {
    const byTrip = new Map<string, Array<[number, number]>>();
    for (const pt of points ?? []) {
      const lat = Number((pt as any).lat);
      const lon = Number((pt as any).lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const key = String((pt as any).trip_id ?? "loose");
      const list = byTrip.get(key) ?? [];
      list.push([lat, lon]);
      byTrip.set(key, list);
    }
    return [...byTrip.values()].filter((l) => l.length > 1);
  }, [points]);

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
    const geo = { ...((place.geo ?? {}) as Record<string, unknown>), lat: drag[0], lon: drag[1], acc: 30, source: "manual" };
    const { error } = await supabase
      .from("awareness_places")
      .update({ geo, updated_at: new Date().toISOString() })
      .eq("id", place.id);
    setSaving(false);
    if (error) {
      toast.error(vantaSay.couldntSave());
      return;
    }
    toast.success("Place set by you. Vanta will read from here.");
    setDrag(null);
    /* The name of the new spot has to be looked up again before Vanta says it. */
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
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Recenter center={center} />
            {lines.map((line, i) => (
              <Polyline key={i} positions={line} pathOptions={{ color: "hsl(var(--accent))", weight: 3, opacity: 0.7 }} />
            ))}
            {saved.map((s) => (
              <Marker key={s.id} position={s.at} icon={savedIcon}>
                <Tooltip>{s.label}</Tooltip>
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
              Drag the pin if Vanta has you in the wrong spot. Nothing changes until you say to use it.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
