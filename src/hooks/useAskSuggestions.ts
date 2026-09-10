// useAskSuggestions — reads current state once and turns it into live Ask
// questions. One pass on open, no polling, no watchers. If nothing is on
// record, Ask stays quiet.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { askSuggestions, type AskSuggestion } from "@/lib/askSuggestions";

export function useAskSuggestions() {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const uid = user?.id ?? null;
  const [items, setItems] = useState<AskSuggestion[]>([]);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const [changes, waiting, promises, next, noticed] = await Promise.all([
        applyScope(
          supabase
            .from("audit_log")
            .select("id", { count: "exact", head: true })
            .gte("created_at", dayStart.toISOString()) as any,
        ),
        applyScope(
          supabase
            .from("actions")
            .select("id", { count: "exact", head: true })
            .in("status", ["proposed", "staged"]) as any,
        ),
        applyScope(
          supabase
            .from("commitments")
            .select("id", { count: "exact", head: true })
            .eq("status", "open") as any,
        ),
        applyScope(
          supabase
            .from("calendar_events")
            .select("title,starts_at")
            .gte("starts_at", nowIso) as any,
        )
          .order("starts_at", { ascending: true })
          .limit(1),
        applyScope(
          supabase
            .from("nudges")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending") as any,
        ),
      ]);

      if (cancelled) return;
      const row = (next as { data?: { title: string | null; starts_at: string }[] }).data?.[0];
      setItems(
        askSuggestions({
          changesToday: (changes as { count: number | null }).count ?? 0,
          waitingOnYou: (waiting as { count: number | null }).count ?? 0,
          openPromises: (promises as { count: number | null }).count ?? 0,
          nextEvent: row?.title ? { title: row.title, startsAt: row.starts_at } : null,
          noticed: (noticed as { count: number | null }).count ?? 0,
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, scopeKey]);

  return items;
}
