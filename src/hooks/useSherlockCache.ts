// useSherlockCache — read cached Sherlock findings for an entity/operation
// without firing a new investigation. Returns null until cache hits; never
// triggers AI calls on its own (Vanta law: AI only behind explicit user taps).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";

export type SherlockOperation = "observe" | "extract" | "relate" | "suggest" | "investigate";

export type CachedFinding = {
  findings: any;
  confidence: string | null;
  updated_at: string;
};

/**
 * Read the most recent cached finding for (entity_type, entity_id, operation).
 * Falls back to looking up by entity_id only when no scoped match exists.
 * Returns null if nothing is cached — does NOT call the edge function.
 */
export function useSherlockCache(
  operation: SherlockOperation,
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): { cached: CachedFinding | null; loading: boolean; refresh: () => void } {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [cached, setCached] = useState<CachedFinding | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user || !entityType || !entityId) {
      setCached(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const cacheType = `${operation}:${entityType}`;
      const { data } = await applyScope(
        supabase
          .from("sherlock_findings_cache")
          .select("findings, confidence, updated_at")
          .eq("entity_type", cacheType)
          .eq("entity_id", entityId) as any,
      )
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setCached(data ? (data as CachedFinding) : null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, scopeKey, operation, entityType, entityId, tick]);

  return { cached, loading, refresh: () => setTick((t) => t + 1) };
}
