// useWearableTrends — 14 days of recorded readings, nothing more.
//
// Reads only, scope-filtered like every other capture-side query. The maths
// lives in `@/lib/wearable` so the page, the panels and the tests agree.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useVantaContext } from "@/providers/VantaContextProvider";
import type { SensorKey, Posture } from "@/lib/awareness";
import {
  bodyCompare,
  heartSeries,
  latest,
  sleepByDay,
  sleepCompare,
  sleepLastNight,
  sleepMedian,
  stepsByDay,
  stepsCompare,
  stepsForDay,
  stepsMedian,
  workoutList,
  type BodyCompareRow,
  type DayBucket,
  type NightBucket,
  type Point,
  type Reading,
  type WorkoutEntry,
} from "@/lib/wearable";

export interface WearableTrends {
  readings: Reading[];
  days: DayBucket[];
  stepsToday: number | null;
  stepsUsual: number | null;
  stepsLine: string;
  heart: Point[];
  heartLast: Reading | null;
  nights: NightBucket[];
  sleepLast: number | null;
  sleepUsual: number | null;
  sleepLine: string;
  compare: BodyCompareRow[];
  workouts: WorkoutEntry[];
  posture: Posture | null;
  consent: Partial<Record<SensorKey, boolean>>;
  anySensorOn: boolean;
  recordedFrom: string | null;
}

const EMPTY: WearableTrends = {
  readings: [],
  days: [],
  stepsToday: null,
  stepsUsual: null,
  stepsLine: "",
  heart: [],
  heartLast: null,
  nights: [],
  sleepLast: null,
  sleepUsual: null,
  sleepLine: "",
  compare: [],
  workouts: [],
  posture: null,
  consent: {},
  anySensorOn: false,
  recordedFrom: null,
};

export function useWearableTrends(days = 14): {
  trends: WearableTrends;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const { applyScope, key } = useScope();
  const { prefs } = useUserPreferences();
  const { context } = useVantaContext();
  const [trends, setTrends] = useState<WearableTrends>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const consentKey = JSON.stringify(prefs.sensor_consent ?? {});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await applyScope(
        supabase.from("wearable_readings").select("kind, value, unit, measured_at, source"),
      )
        .gte("measured_at", new Date(Date.now() - days * 86_400_000).toISOString())
        .order("measured_at", { ascending: false })
        .limit(2000);
      if (err) throw err;

      const readings = ((data ?? []) as Reading[]).map((r) => ({ ...r, value: Number(r.value) }));
      const buckets = stepsByDay(readings, days);
      const nights = sleepByDay(readings, days);
      const consent = (prefs.sensor_consent ?? {}) as Partial<Record<SensorKey, boolean>>;

      setTrends({
        readings,
        days: buckets,
        stepsToday: stepsForDay(readings),
        stepsUsual: stepsMedian(buckets),
        stepsLine: stepsCompare(buckets),
        heart: heartSeries(readings, 48),
        heartLast: latest(readings, "heart_rate"),
        nights,
        sleepLast: sleepLastNight(nights),
        sleepUsual: sleepMedian(nights),
        sleepLine: sleepCompare(nights),
        compare: bodyCompare(readings, days),
        workouts: workoutList(readings, days),
        posture: context.posture ?? null,
        consent,
        anySensorOn: consent.heart_rate === true || consent.activity === true,
        recordedFrom: readings.length
          ? readings[readings.length - 1].measured_at
          : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The watch trends could not be read.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, consentKey, context.posture, days]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, consentKey, context.posture, days, nonce]);

  return { trends, loading, error, refresh: () => setNonce((n) => n + 1) };
}
