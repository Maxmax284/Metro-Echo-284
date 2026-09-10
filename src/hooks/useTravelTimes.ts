// useTravelTimes — real driving time from the fix Echo is using to your places.
//
// One read per fix and per set of destinations. No watcher, no polling, no
// background tracking. A route the router can't work out stays null and the
// panel says so rather than inventing a number.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TravelLeg = { durationS: number | null; distanceM: number | null };

export function useTravelTimes(
  from: { lat: number; lon: number } | null,
  targets: Array<{ id: string; lat: number; lon: number }>,
): { legs: Record<string, TravelLeg>; loading: boolean } {
  const [legs, setLegs] = useState<Record<string, TravelLeg>>({});
  const [loading, setLoading] = useState(false);

  const fixLat = from && Number.isFinite(from.lat) ? Number(from.lat.toFixed(3)) : null;
  const fixLon = from && Number.isFinite(from.lon) ? Number(from.lon.toFixed(3)) : null;

  const clean = useMemo(
    () => targets.filter((t) => t.id && Number.isFinite(t.lat) && Number.isFinite(t.lon)).slice(0, 12),
    [targets],
  );
  const signature = clean.map((t) => `${t.id}:${t.lat.toFixed(3)},${t.lon.toFixed(3)}`).join("|");

  useEffect(() => {
    if (fixLat === null || fixLon === null || clean.length === 0) {
      setLegs({});
      return;
    }
    let live = true;
    setLoading(true);
    void supabase.functions
      .invoke("awareness-travel-times", {
        body: { from: { lat: fixLat, lon: fixLon }, to: clean },
      })
      .then(({ data }) => {
        if (!live) return;
        const rows = ((data as any)?.legs ?? []) as Array<{
          id: string;
          duration_s?: number | null;
          distance_m?: number | null;
        }>;
        const next: Record<string, TravelLeg> = {};
        for (const r of rows) {
          next[r.id] = {
            durationS: Number.isFinite(Number(r.duration_s)) ? Number(r.duration_s) : null,
            distanceM: Number.isFinite(Number(r.distance_m)) ? Number(r.distance_m) : null,
          };
        }
        setLegs(next);
      })
      .catch(() => {
        /* A missing route stays missing. */
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixLat, fixLon, signature]);

  return { legs, loading };
}

/** "18 min drive" / "2h 5m drive". Words, never a bare number. */
export function driveLabel(durationS: number | null | undefined): string | null {
  const s = Number(durationS);
  if (!Number.isFinite(s) || s <= 0) return null;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min drive`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m drive` : `${h}h drive`;
}
