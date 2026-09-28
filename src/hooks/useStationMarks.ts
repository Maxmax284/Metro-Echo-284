// useStationMarks — reads the deliberate-mark receipts (place stamps and
// journey wraps) through the active scope and folds them into the marks
// still standing. null while unknown (loading, offline, error) — callers
// never show a guessed count.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { STATION_MARK_EVENTS, stationMarks, type StationMark } from "@/lib/stationMarks";

export function useStationMarks(): { marks: StationMark[] | null; loading: boolean } {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [marks, setMarks] = useState<StationMark[] | null>(null);

  useEffect(() => {
    if (!user) {
      setMarks(null);
      return;
    }
    let alive = true;
    (async () => {
      const { data, error } = await applyScope(
        supabase
          .from("audit_log")
          .select("entity_id, event, payload, created_at")
          .in("event", [...STATION_MARK_EVENTS])
          .order("created_at", { ascending: true })
          .limit(500),
      );
      if (!alive) return;
      setMarks(error ? null : stationMarks(data ?? []));
    })();
    return () => {
      alive = false;
    };
  }, [user, applyScope, scopeKey]);

  return { marks, loading: marks === null };
}
