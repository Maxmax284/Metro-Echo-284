// useTrips — reads and writes trips. Deliberate only.
//
// Start trip and End trip are taps. While a trip is running the page samples a
// fix on a slow timer, and only while the tab is open — Vanta does not follow
// you in the background and it does not start a trip because you moved.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { useActiveScope } from "@/hooks/useActiveScope";
import {
  pathDistanceMeters,
  staleTripDiff,
  type Trip,
  type TripPoint,
} from "@/lib/trips";

const SAMPLE_MS = 60_000;

function fixNow(): Promise<{ lat: number; lon: number; accuracy_m: number | null } | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy_m: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

export function useTrips() {
  const { session } = useAuth();
  const { organizationId } = useActiveScope();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [running, setRunning] = useState<Trip | null>(null);
  const [points, setPoints] = useState<TripPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [autoCloseNote, setAutoCloseNote] = useState<string | null>(null);
  const sampling = useRef(false);

  const load = useCallback(async () => {
    if (!session?.user?.id) {
      setTrips([]);
      setRunning(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("trips")
      .select("id, label, purpose, started_at, ended_at, start_label, end_label, distance_m, point_count, closed_by")
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) {
      setLoading(false);
      return;
    }
    const rows = (data ?? []).map((t) => ({ ...t, distance_m: t.distance_m === null ? null : Number(t.distance_m) })) as Trip[];
    setTrips(rows);
    const open = rows.find((t) => !t.ended_at) ?? null;
    setRunning(open);
    if (open) {
      const p = await supabase
        .from("trip_points")
        .select("lat, lon, accuracy_m, kind, label, recorded_at")
        .eq("trip_id", open.id)
        .order("recorded_at", { ascending: true });
      const list = (p.data ?? []) as TripPoint[];
      setPoints(list);
      // A trip left running is closed with a diff, never quietly dropped.
      const diff = staleTripDiff(open, list.at(-1)?.recorded_at ?? null);
      if (diff) {
        const endedAt = list.at(-1)?.recorded_at ?? open.started_at;
        await supabase
          .from("trips")
          .update({
            ended_at: endedAt,
            closed_by: "auto_stale",
            distance_m: pathDistanceMeters(list),
            point_count: list.length,
          })
          .eq("id", open.id);
        setAutoCloseNote(diff);
        setRunning(null);
        void load();
        return;
      }
    } else {
      setPoints([]);
    }
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const recordPoint = useCallback(
    async (tripId: string, kind: string, label?: string | null) => {
      if (!session?.user?.id) return null;
      const fix = await fixNow();
      if (!fix) return null;
      const row = {
        trip_id: tripId,
        user_id: session.user.id,
        lat: fix.lat,
        lon: fix.lon,
        accuracy_m: fix.accuracy_m,
        kind,
        label: label ?? null,
        recorded_at: new Date().toISOString(),
      };
      await supabase.from("trip_points").insert(row);
      setPoints((prev) => [...prev, row as TripPoint]);
      return row as TripPoint;
    },
    [session?.user?.id],
  );

  const startTrip = useCallback(
    async (input: { label?: string | null; purpose?: string | null; startLabel?: string | null }) => {
      if (!session?.user?.id || running) return null;
      setBusy(true);
      const { data, error } = await supabase
        .from("trips")
        .insert({
          user_id: session.user.id,
          organization_id: organizationId ?? null,
          label: input.label ?? null,
          purpose: input.purpose ?? null,
          start_label: input.startLabel ?? null,
          closed_by: "open",
        })
        .select("id, label, purpose, started_at, ended_at, start_label, end_label, distance_m, point_count, closed_by")
        .single();
      setBusy(false);
      if (error || !data) return null;
      const trip = data as Trip;
      setRunning(trip);
      setPoints([]);
      setTrips((prev) => [trip, ...prev]);
      await recordPoint(trip.id, "start", input.startLabel ?? null);
      return trip;
    },
    [session?.user?.id, organizationId, running, recordPoint],
  );

  const endTrip = useCallback(
    async (endLabel?: string | null) => {
      if (!running) return null;
      setBusy(true);
      const last = await recordPoint(running.id, "end", endLabel ?? null);
      const all = last ? [...points, last] : points;
      const distance = all.length > 1 ? pathDistanceMeters(all) : null;
      await supabase
        .from("trips")
        .update({
          ended_at: new Date().toISOString(),
          end_label: endLabel ?? null,
          distance_m: distance,
          point_count: all.length,
          closed_by: "you",
        })
        .eq("id", running.id);
      setBusy(false);
      setRunning(null);
      await load();
      return distance;
    },
    [running, points, recordPoint, load],
  );

  const markStop = useCallback(
    async (label?: string | null) => {
      if (!running) return;
      await recordPoint(running.id, "stop", label ?? null);
    },
    [running, recordPoint],
  );

  const deleteTrip = useCallback(
    async (id: string) => {
      await supabase.from("trips").delete().eq("id", id);
      await load();
    },
    [load],
  );

  /* Slow sampling, only while a trip is running and the tab is open. */
  useEffect(() => {
    if (!running) return;
    const tick = async () => {
      if (sampling.current || document.hidden) return;
      sampling.current = true;
      await recordPoint(running.id, "sample");
      sampling.current = false;
    };
    const id = window.setInterval(tick, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [running, recordPoint]);

  const liveDistanceM = points.length > 1 ? pathDistanceMeters(points) : null;

  return {
    trips,
    running,
    points,
    liveDistanceM,
    loading,
    busy,
    autoCloseNote,
    dismissAutoCloseNote: () => setAutoCloseNote(null),
    startTrip,
    endTrip,
    markStop,
    deleteTrip,
    reload: load,
  };
}
