// MapPickerDialog — drop a pin on a real map, reverse-geocode it, apply as
// active place. Pure escape hatch when GPS keeps lying about where you are.

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, MapPin, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAwareness } from "@/providers/AwarenessProvider";
import { searchPlaces, type PlaceSearchHit } from "@/lib/locationSanity";
import { vantaSay, vantaToast as toast } from "@/lib/vantaVoice";

// Leaflet default marker icons don't load via bundler — bundled under /vendor.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Initial centre. Falls back to a sane default. */
  initial?: { lat: number; lon: number } | null;
};

type Resolved = {
  display_name: string;
  country: string | null;
  region: string | null;
  city: string | null;
};

const DEFAULT_CENTER: [number, number] = [9.5018, 100.0136]; // Koh Samui

function ClickToPin({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center, Math.max(map.getZoom(), 12)); }, [center, map]);
  return null;
}

export function MapPickerDialog({ open, onOpenChange, initial }: Props) {
  const { session } = useAuth();
  const { refresh, refreshSnapshot } = useAwareness();
  const start: [number, number] = initial
    ? [initial.lat, initial.lon]
    : DEFAULT_CENTER;
  const [pin, setPin] = useState<[number, number]>(start);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [resolving, setResolving] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setPin(start);
      setResolved(null);
      setQuery("");
      setHits([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced reverse-lookup when the pin moves. This goes through the backend
  // rather than straight to the map service, so a dragged pin and a saved place
  // are named by the same code with the same rules.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setResolving(true);
    setResolved(null);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("awareness-geocode", {
          body: { lat: pin[0], lon: pin[1] },
        });
        if (error) throw error;
        if (!data || data.error) throw new Error(data?.reason ?? "reverse_failed");
        setResolved({
          display_name: data.display_name ?? "Unknown location",
          country: data.country ?? null,
          region: data.region ?? null,
          city: data.city ?? null,
        });
      } catch {
        setResolved({ display_name: "Couldn't resolve that point", country: null, region: null, city: null });
      } finally {
        setResolving(false);
      }
    }, 350);

    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [pin, open]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const out = await searchPlaces(query);
      setHits(out);
      if (out.length === 0) toast.error(vantaSay.manualPlaceMiss());
    } catch {
      toast.error(vantaSay.manualPlaceMiss());
    } finally {
      setSearching(false);
    }
  };

  const pickHit = (h: PlaceSearchHit) => {
    setPin([h.lat, h.lon]);
    setHits([]);
    setQuery(h.display_name.split(",").slice(0, 2).join(","));
  };

  const apply = async () => {
    if (!session || !resolved?.country) return;
    setApplying(true);
    try {
      const label = resolved.city
        ? `${resolved.city}${resolved.region ? `, ${resolved.region}` : ""}`
        : resolved.display_name.split(",").slice(0, 2).join(",");
      const { data, error } = await supabase
        .from("awareness_places")
        .insert({
          user_id: session.user.id,
          label,
          geo: {
            lat: pin[0],
            lon: pin[1],
            source: "map_picker",
            city: resolved.city,
            display_name: resolved.display_name,
          },
          country: resolved.country,
          region: resolved.region,
        })
        .select("id")
        .single();
      if (error || !data) throw error;
      toast.success(vantaSay.mapPickerApplied(label));
      await refresh();
      onOpenChange(false);
      // Auto-rescan in background
      refreshSnapshot(true).catch(() => {});
    } catch {
      toast.error(vantaSay.couldntSave());
    } finally {
      setApplying(false);
    }
  };

  const status = useMemo(() => {
    if (resolving) return vantaSay.mapPickerResolving();
    if (!resolved) return "Tap or drag the pin.";
    if (!resolved.country) return "No country at that point — try somewhere on land.";
    return resolved.display_name;
  }, [resolving, resolved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-sm">Pick on map</DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2 shrink-0 space-y-1.5">
          <div className="flex gap-1.5">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search: e.g. Lamai, Koh Samui"
              className="h-9 text-[12px]"
            />
            <Button size="sm" className="h-9 shrink-0" onClick={runSearch} disabled={searching || !query.trim()}>
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {hits.length > 0 && (
            <ul className="max-h-32 overflow-y-auto space-y-1 rounded-md border border-border/40 bg-surface-elevated/40 p-1">
              {hits.map((h, i) => (
                <li key={i}>
                  <button
                    onClick={() => pickHit(h)}
                    className="w-full text-left rounded px-2 py-1 text-[11.5px] hover:bg-surface-elevated/70 truncate"
                  >
                    {h.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex-1 min-h-[260px] relative">
          <MapContainer
            center={start}
            zoom={11}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Recenter center={pin} />
            <ClickToPin onPick={(lat, lon) => setPin([lat, lon])} />
            <Marker
              position={pin}
              draggable
              icon={markerIcon}
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const ll = m.getLatLng();
                  setPin([ll.lat, ll.lng]);
                },
              }}
            />
          </MapContainer>
        </div>

        <div className="px-4 py-3 border-t border-border/60 shrink-0 space-y-2 bg-background">
          <div className="flex items-start gap-2 text-[11.5px] text-muted-foreground min-h-[2.5rem]">
            <MapPin className="h-3.5 w-3.5 mt-0.5 text-primary/80 shrink-0" />
            <span className="leading-snug">{status}</span>
          </div>
          <Button
            className="w-full h-10 gap-2"
            onClick={apply}
            disabled={applying || resolving || !resolved?.country}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Apply as active place
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
