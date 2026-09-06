// useTrips — reads and writes trips. Deliberate only.
//
// Start trip and End trip are taps. While a trip is running the page samples a
// fix on a slow timer, and only while the tab is open — Echo does not follow
// you in the background and it does not start a trip because you moved.
//
// Every write goes through the `trip-session` function, which is the same
// server-side owner Telegram uses. One trip record, one set of receipts, no
// matter which door it came through. This hook supplies the fix (only the
// browser can) and reads the result back.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useActiveOrgId } from "@/providers/WorkspaceProvider";
import {
  pathDistanceMeters,
  type Trip,
  type TripPoint,
} from "@/lib/trips";

const SAMPLE_MS = 60_000;

type Fix = { lat: number; lon: number; accuracy_m: number | null };

function fixNow(): Promise<Fix | null> {
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

type SessionCall = {
  intent: "read" | "start" | "point" | "end" | "hold";
  organization_id?: string | null;
  label?: string | null;
  purpose?: string | null;
  start_label?: string | null;
  end_label?: string | null;
  fix?: (Fix & { kind?: string; label?: string | null }) | null;
};

export function useTrips() {
  const { session } = useAuth();
  const organizationId = useActiveOrgId();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [running, setRunning] = useState<Trip | null>(null);
  const [points, setPoints] = useState<TripPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [autoCloseNote, setAutoCloseNote] = useState<string | null>(null);
  const sampling = useRef(false);

  const callSession = useCallback(
    async (body: SessionCall) => {
      const { data, error } = await supabase.functions.invoke("trip-session", {
        body: { ...body, organization_id: body.organization_id ?? organizationId ?? null },
      });
      if (error) return null;
      return data as {
        trip?: Trip | null;
        points?: TripPoint[];
        autoClosed?: string | null;
        distanceM?: number | null;
      };
    },
    [organizationId],
  );

  const load = useCallback(async () => {
    if (!session?.user?.id) {
      setTrips([]);
      setRunning(null);
      setLoading(false);
      return;
    }
    /* The server owns the open session, including closing a stale one and
       saying so. Ask it first, then read the list for history. */
    const live = await callSession({ intent: "read" });
    if (live?.autoClosed) setAutoCloseNote(live.autoClosed);

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
    const open = live?.trip ?? rows.find((t) => !t.ended_at) ?? null;
    setRunning(open && !open.ended_at ? open : null);
    setPoints(open && !open.ended_at ? (live?.points ?? []) : []);
    setLoading(false);
  }, [session?.user?.id, callSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const recordPoint = useCallback(
    async (kind: string, label?: string | null) => {
      if (!session?.user?.id) return null;
      const fix = await fixNow();
      if (!fix) return null;
      const res = await callSession({ intent: "point", fix: { ...fix, kind, label: label ?? null } });
      if (res?.points) setPoints(res.points);
      return res?.points?.at(-1) ?? null;
    },
    [session?.user?.id, callSession],
  );

  const startTrip = useCallback(
    async (input: { label?: string | null; purpose?: string | null; startLabel?: string | null }) => {
      if (!session?.user?.id || running) return null;
      setBusy(true);
      const fix = await fixNow();
      const res = await callSession({
        intent: "start",
        label: input.label ?? null,
        purpose: input.purpose ?? null,
        start_label: input.startLabel ?? null,
        fix: fix ? { ...fix, kind: "start", label: input.startLabel ?? null } : null,
      });
      setBusy(false);
      const trip = res?.trip ?? null;
      if (!trip) return null;
      setRunning(trip);
      setPoints(res?.points ?? []);
      setTrips((prev) => (prev.some((t) => t.id === trip.id) ? prev : [trip, ...prev]));
      return trip;
    },
    [session?.user?.id, running, callSession],
  );

  const endTrip = useCallback(
    async (endLabel?: string | null) => {
      if (!running) return null;
      setBusy(true);
      const fix = await fixNow();
      const res = await callSession({
        intent: "end",
        end_label: endLabel ?? null,
        fix: fix ? { ...fix, kind: "end", label: endLabel ?? null } : null,
      });
      setBusy(false);
      setRunning(null);
      await load();
      return res?.distanceM ?? null;
    },
    [running, callSession, load],
  );

  const markStop = useCallback(
    async (label?: string | null) => {
      if (!running) return;
      await recordPoint("stop", label ?? null);
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
      await recordPoint("sample");
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
