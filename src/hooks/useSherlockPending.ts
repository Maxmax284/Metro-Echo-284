// useSherlockPending — cross-surface pending suggestions queue for the Hub.
// Scope-isolated: only findings belonging to the room you are standing in.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import type { SherlockFinding } from "@/lib/sherlock/types";

export function useSherlockPending(opts: { includeLowConfidence?: boolean; limit?: number } = {}) {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [items, setItems] = useState<SherlockFinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = applyScope(
        supabase.from("sherlock_findings").select("*").eq("status", "pending") as any,
      )
        .order("updated_at", { ascending: false })
        .limit(opts.limit ?? 100);
      if (!opts.includeLowConfidence) q = q.in("confidence", ["medium", "high"]);
      const { data } = await q;
      if (!cancelled) {
        setItems((data ?? []) as SherlockFinding[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, scopeKey, opts.includeLowConfidence, opts.limit, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { items, loading, refresh };
}
