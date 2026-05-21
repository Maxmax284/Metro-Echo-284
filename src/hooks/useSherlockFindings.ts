// useSherlockFindings — read durable findings tied to a source object.
// No AI calls; pure read from sherlock_findings.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { SherlockFinding } from "@/lib/sherlock/types";

export function useSherlockFindings(
  sourceObjectType: string | null | undefined,
  sourceObjectId: string | null | undefined,
  opts: { status?: "pending" | "any" } = {},
) {
  const { user } = useAuth();
  const status = opts.status ?? "pending";
  const [findings, setFindings] = useState<SherlockFinding[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !sourceObjectType || !sourceObjectId) {
      setFindings([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("sherlock_findings")
        .select("*")
        .eq("user_id", user.id)
        .eq("source_object_type", sourceObjectType)
        .eq("source_object_id", sourceObjectId)
        .order("updated_at", { ascending: false });
      if (status === "pending") q = q.eq("status", "pending");
      const { data } = await q;
      if (!cancelled) {
        setFindings((data ?? []) as SherlockFinding[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, sourceObjectType, sourceObjectId, status, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { findings, loading, refresh };
}
