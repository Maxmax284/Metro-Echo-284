// useBody — the person's own recorded body numbers and medication courses.
//
// Doctrine:
//  - Writes only what the person typed. Echo never invents a reading, never
//    fills a gap, never marks a dose taken.
//  - Scope-filtered like every other desk: a workspace body log belongs to that
//    room only.
//  - Reads are numbers; the reading of them stays with the person and their
//    doctor. See BODY_DISCLAIMER.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import type { BodyEntry, Medication } from "@/lib/bodyLog";

const BODY_KINDS = ["weight", "temperature", "bp_systolic", "bp_diastolic", "pulse"];

export function useBody(days = 90) {
  const { user } = useAuth();
  const { applyScope, withScope, key } = useScope();
  const [readings, setReadings] = useState<BodyEntry[]>([]);
  const [meds, setMeds] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const since = useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString(), [days]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const r = await applyScope(
        supabase
          .from("wearable_readings")
          .select("kind,value,unit,measured_at,source")
          .in("kind", BODY_KINDS)
          .gte("measured_at", since)
          .order("measured_at", { ascending: false })
          .limit(500) as never,
      );
      const m = await applyScope(
        supabase
          .from("medications")
          .select("id,name,dose,times_local,rhythm,starts_on,ends_on,active")
          .order("created_at", { ascending: true }) as never,
      );
      if ((r as any).error) throw (r as any).error;
      if ((m as any).error) throw (m as any).error;
      setReadings((((r as any).data ?? []) as BodyEntry[]).map((x) => ({ ...x, value: Number(x.value) })));
      setMeds(((m as any).data ?? []) as Medication[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The body log could not be read.");
    } finally {
      setLoading(false);
    }
  }, [applyScope, since, user]);

  useEffect(() => {
    void load();
  }, [load, key]);

  /** One typed reading, recorded as said, stamped with the moment given. */
  const logReading = useCallback(
    async (rows: Array<{ kind: string; value: number; unit: string }>, measuredAt?: Date) => {
      if (!user || !rows.length) return;
      const measured_at = (measuredAt ?? new Date()).toISOString();
      const payload = rows.map((r) =>
        withScope({ user_id: user.id, source: "typed", measured_at, raw: {}, ...r }),
      );
      const { error: insertError } = await supabase.from("wearable_readings").insert(payload as never);
      if (insertError) throw insertError;
      await load();
    },
    [load, user, withScope],
  );

  const addMedication = useCallback(
    async (med: { name: string; dose: string; times_local: string[]; rhythm?: string; ends_on?: string | null }) => {
      if (!user) return;
      const { error: e } = await supabase
        .from("medications")
        .insert(withScope({ user_id: user.id, rhythm: "daily", ...med }) as never);
      if (e) throw e;
      await load();
    },
    [load, user, withScope],
  );

  const setMedicationActive = useCallback(
    async (id: string, active: boolean) => {
      const { error: e } = await supabase.from("medications").update({ active }).eq("id", id);
      if (e) throw e;
      await load();
    },
    [load],
  );

  const removeMedication = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from("medications").delete().eq("id", id);
      if (e) throw e;
      await load();
    },
    [load],
  );

  return { readings, meds, loading, error, refresh: load, logReading, addMedication, setMedicationActive, removeMedication };
}
