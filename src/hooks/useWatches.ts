// useWatches — the long-running jobs standing in this room.
// Scope-isolated like every other capture-side read.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { OPEN_WATCH_STATES, type Watch } from "@/lib/watch";

export function useWatches(opts: { openOnly?: boolean; limit?: number } = {}) {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [items, setItems] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      let q = applyScope(
        supabase
          .from("watches")
          .select("id, goal, kind, subject_id, state, last_check_at, next_check_at, attempts, outcome, last_read, created_at, updated_at") as any,
      )
        .order("updated_at", { ascending: false })
        .limit(opts.limit ?? 20);
      if (opts.openOnly !== false) q = q.in("state", OPEN_WATCH_STATES);
      const { data } = await q;
      if (!cancelled) {
        setItems((data ?? []) as Watch[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, scopeKey, opts.openOnly, opts.limit, tick, applyScope]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { items, loading, refresh };
}
