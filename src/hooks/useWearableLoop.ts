// useWearableLoop — the records behind the watch feed.
//
// Reads only, always scope-filtered. Facts go to the pure helpers in
// `@/lib/wearable`, which decide what can honestly be claimed.
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useVantaContext } from "@/providers/VantaContextProvider";
import type { SensorKey } from "@/lib/awareness";
import {
  bodySummary,
  buildWearableWalk,
  describeWearableSweep,
  latest,
  stepsForDay,
  suggestPosture,
  walkProgress,
  type Reading,
  type WalkStep,
  type WearableSweep,
} from "@/lib/wearable";

export interface WearableLoop {
  readings: Reading[];
  heartRate: Reading | null;
  stepsToday: number | null;
  sleep: Reading | null;
  sweep: WearableSweep | null;
  sweepLine: string;
  lastSyncAgo: string | null;
  consent: Partial<Record<SensorKey, boolean>>;
  anySensorOn: boolean;
  suggestion: ReturnType<typeof suggestPosture>;
  steps: WalkStep[];
  progress: { done: number; total: number };
  summary: string;
}

const EMPTY: WearableLoop = {
  readings: [],
  heartRate: null,
  stepsToday: null,
  sleep: null,
  sweep: null,
  sweepLine: "",
  lastSyncAgo: null,
  consent: {},
  anySensorOn: false,
  suggestion: null,
  steps: [],
  progress: { done: 0, total: 5 },
  summary: "",
};

function ago(at: string | null | undefined): string | null {
  if (!at) return null;
  try {
    return `${formatDistanceToNow(new Date(at))} ago`;
  } catch {
    return null;
  }
}

export function useWearableLoop(): {
  loop: WearableLoop;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const { applyScope, key } = useScope();
  const { prefs } = useUserPreferences();
  const { context } = useVantaContext();
  const [loop, setLoop] = useState<WearableLoop>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const consentKey = JSON.stringify(prefs.sensor_consent ?? {});

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, sweepRow, acted] = await Promise.all([
        /* Readings are yours, not a workspace's: the watch has no idea which
           room you are standing in, so ingest never stamps a scope. Filtering
           them by scope here showed an empty body panel inside a workspace,
           which read as lost data. Own rows only, every scope. */
        supabase
          .from("wearable_readings")
          .select("kind, value, unit, measured_at, source")
          .eq("user_id", user.id)
          .gte("measured_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
          .order("measured_at", { ascending: false })
          .limit(300),
        applyScope(supabase.from("audit_log").select("created_at, payload"))
          .eq("event", "wearable.sweep")
          .order("created_at", { ascending: false })
          .limit(1),
        applyScope(supabase.from("audit_log").select("created_at"))
          .in("event", ["awareness.held", "awareness.delivered"])
          .order("created_at", { ascending: false })
          .limit(1),
      ]);

      const readings = ((rows.data ?? []) as Reading[]).map((r) => ({
        ...r,
        value: Number(r.value),
      }));

      const sweepPayload = ((sweepRow.data ?? [])[0] ?? null) as
        | { created_at: string; payload: any }
        | null;
      const sweep: WearableSweep | null = sweepPayload
        ? {
            at: sweepPayload.created_at,
            heart_rate: Number(sweepPayload.payload?.heart_rate ?? 0),
            steps: Number(sweepPayload.payload?.steps ?? 0),
            sleep: Number(sweepPayload.payload?.sleep ?? 0),
            workout: Number(sweepPayload.payload?.workout ?? 0),
          }
        : null;

      const consent = (prefs.sensor_consent ?? {}) as Partial<Record<SensorKey, boolean>>;
      const anySensorOn = consent.heart_rate === true || consent.activity === true;
      const heartRate = latest(readings, "heart_rate");
      const posture = context.posture ?? null;
      const postureActedAt = ((acted.data ?? [])[0] as any)?.created_at ?? null;

      const facts = { anySensorOn, readings, posture, sweep, postureActedAt };
      const steps = buildWearableWalk(facts);

      setLoop({
        readings,
        heartRate,
        stepsToday: stepsForDay(readings),
        sleep: latest(readings, "sleep"),
        sweep,
        sweepLine: describeWearableSweep(sweep),
        lastSyncAgo: ago(sweep?.at ?? null),
        consent,
        anySensorOn,
        suggestion: suggestPosture(posture, heartRate, consent.heart_rate === true),
        steps,
        progress: walkProgress(steps),
        summary: bodySummary(facts),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The watch feed could not be read.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, consentKey, context.posture]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, consentKey, context.posture, nonce]);

  return { loop, loading, error, refresh: () => setNonce((n) => n + 1) };
}
