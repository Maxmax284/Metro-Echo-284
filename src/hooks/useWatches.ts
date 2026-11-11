// useWatches — the long-running jobs standing in this room.
// Scope-isolated like every other capture-side read.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { OPEN_WATCH_STATES, type Watch } from "@/lib/watch";
import { readCached, writeCached } from "@/lib/readCache";

export function useWatches(opts: { openOnly?: boolean; limit?: number } = {}) {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const cacheKey = user ? `watches.${user.id}.${scopeKey}.${opts.openOnly !== false ? "open" : "all"}` : null;
  /* No signal on startup: the board opens with the last good read, and the
     shell's offline line says it is held. */
  const [items, setItems] = useState<Watch[]>(() => (cacheKey ? readCached<Watch[]>(cacheKey)?.data ?? [] : []));
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
          .select("id, goal, kind, subject_id, state, last_check_at, next_check_at, attempts, outcome, last_read, telemetry_at, created_at, updated_at") as any,
      )
        .order("updated_at", { ascending: false })
        .limit(opts.limit ?? 20);
      if (opts.openOnly !== false) q = q.in("state", OPEN_WATCH_STATES);
      try {
        const { data, error } = await q;
        if (cancelled) return;
        if (error) throw error;
        setItems((data ?? []) as Watch[]);
        if (cacheKey) writeCached(cacheKey, data ?? []);
      } catch {
        /* The held read stays on the board; a failed refresh never blanks it. */
        if (!cancelled && cacheKey) {
          const cached = readCached<Watch[]>(cacheKey);
          if (cached) setItems(cached.data);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, scopeKey, opts.openOnly, opts.limit, tick, applyScope]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { items, loading, refresh };
}
