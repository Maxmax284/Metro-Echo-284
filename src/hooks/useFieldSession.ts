// useFieldSession — field mode is simply "a trip you started is still open".
//
// It reads the open trip (started here or from Telegram — same row either way),
// its recorded points, and the saved places to measure against. It starts
// nothing on its own: every write below is a tap somewhere in the UI.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useTrips } from "@/hooks/useTrips";
import { fieldRead, type FieldPlace, type FieldRead } from "@/lib/fieldRead";

export type FieldSession = {
  read: FieldRead | null;
  places: FieldPlace[];
  busy: boolean;
  loading: boolean;
  /** Close the trip at the nearest saved place, or with no name if none is near. */
  arrive: () => Promise<string | null>;
  markStop: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useFieldSession(): FieldSession {
  const { session } = useAuth();
  const { running, points, loading, busy, endTrip, markStop, reload } = useTrips();
  const [places, setPlaces] = useState<FieldPlace[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const loadPlaces = useCallback(async () => {
    if (!session?.user?.id) {
      setPlaces([]);
      return;
    }
    const { data } = await supabase.from("awareness_places").select("id, label, geo").is("archived_at", null);
    const rows: FieldPlace[] = [];
    for (const p of data ?? []) {
      const g = (p.geo ?? {}) as { lat?: number; lon?: number };
      const lat = Number(g?.lat);
      const lon = Number(g?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) rows.push({ id: p.id, label: p.label, lat, lon });
    }
    setPlaces(rows);
  }, [session?.user?.id]);

  useEffect(() => {
    void loadPlaces();
  }, [loadPlaces]);

  /* While a trip is open the elapsed line has to stay true. One slow tick. */
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [running]);

  const read = fieldRead(running, points, places, now);

  const arrive = useCallback(async () => {
    if (!running) return null;
    const near = read?.nextPlace && read.nextPlace.distanceM <= 400 ? read.nextPlace.label : null;
    await endTrip(near);
    return near;
  }, [running, read?.nextPlace, endTrip]);

  return {
    read,
    places,
    busy,
    loading,
    arrive,
    markStop: async () => {
      await markStop(read?.nextPlace && read.nextPlace.distanceM <= 400 ? read.nextPlace.label : null);
    },
    refresh: async () => {
      await Promise.all([loadPlaces(), reload()]);
    },
  };
}
