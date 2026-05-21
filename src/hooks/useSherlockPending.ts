// useSherlockPending — cross-surface pending suggestions queue for the Hub.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { SherlockFinding } from "@/lib/sherlock/types";

export function useSherlockPending(opts: { includeLowConfidence?: boolean; limit?: number } = {}) {
  const { user } = useAuth();
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
      let q = supabase
        .from("sherlock_findings")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
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
  }, [user?.id, opts.includeLowConfidence, opts.limit, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { items, loading, refresh };
}
