// TodayLiveMap — where you are, on Today.
//
// Doctrine:
//   - reading only. Tapping a pin never moves your own location; the place desk
//     owns that.
//   - it draws only saved pins and the recorded fix. Nothing is guessed.
//   - folded by default is wrong here: the whole point is a glance. It stays
//     open, but it is one short panel, not a second room.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CloudSun, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAwarenessOptional } from "@/providers/AwarenessProvider";
import { PlacesBoardMap, type MapSpot } from "@/components/awareness/PlacesBoardMap";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

/** Straight-line distance, so a saved pin says how far off it is. */
function haversineKm(a: MapSpot, b: MapSpot) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function TodayLiveMap({ onOpenPlaces }: { onOpenPlaces?: () => void }) {
  const aware = useAwarenessOptional();
  const liveId = aware?.place?.id ?? null;
  const [spots, setSpots] = useState<MapSpot[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase
        .from("awareness_places")
        .select("id,label,geo,category")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (!alive) return;
      const rows = (data ?? [])
        .filter((p: any) => !["care", "nearby"].includes(p.category ?? ""))
        .map((p: any) => ({
          id: p.id as string,
          name: String(p.label ?? "").split(",")[0] || "Spot",
          lat: Number(p.geo?.lat),
          lon: Number(p.geo?.lon),
        }))
        .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon) && !(s.lat === 0 && s.lon === 0));
      setSpots(rows);
    })();
    return () => { alive = false; };
  }, [aware?.place?.updated_at, liveId]);

  if (spots.length === 0) return null;

  const live = spots.find((s) => s.id === liveId) ?? null;
  const others = spots
    .filter((s) => s.id !== live?.id)
    .map((s) => ({ ...s, km: live ? haversineKm(live, s) : null }))
    .slice(0, 4);

  return (
    <CollapsibleSection
      title="Where you are"
      storageKey="today.livemap"
      icon={<MapPin className="h-3.5 w-3.5" />}
      summary={live ? `${live.name} on the map, ${others.length} other saved spots.` : "Your saved spots on the map."}
      action={
        onOpenPlaces ? (
          <button type="button" onClick={onOpenPlaces} className="text-[11px] text-primary">
            Place desk
          </button>
        ) : undefined
      }
    >
      <PlacesBoardMap spots={spots} activeId={null} liveId={liveId} onSelect={() => {}} />
      {others.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {others.map((s) => (
            <li key={s.id} className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
              {s.name}
              {s.km != null ? ` · ${s.km < 1 ? "<1 km" : `${Math.round(s.km)} km`}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        to="/weather"
        className="mt-2 inline-flex min-h-[32px] items-center gap-1 text-[11px] text-primary hover:underline"
      >
        <CloudSun className="h-3.5 w-3.5" />
        Live weather station
      </Link>
    </CollapsibleSection>
  );
}
