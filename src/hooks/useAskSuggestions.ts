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

      /* Tomorrow, local — used only to see whether anything actually collides. */
      const tomorrowStart = new Date(dayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const tomorrowEnd = new Date(tomorrowStart);
      tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

      const [changes, waiting, promises, next, noticed, tomorrow] = await Promise.all([
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
        applyScope(
          supabase
            .from("calendar_events")
            .select("title,starts_at,ends_at")
            .gte("starts_at", tomorrowStart.toISOString())
            .lt("starts_at", tomorrowEnd.toISOString()) as any,
        ).order("starts_at", { ascending: true }),
      ]);

      if (cancelled) return;
      const row = (next as { data?: { title: string | null; starts_at: string }[] }).data?.[0];
      const tomorrowRows =
        (tomorrow as { data?: { starts_at: string; ends_at: string | null }[] }).data ?? [];
      setItems(
        askSuggestions({
          changesToday: (changes as { count: number | null }).count ?? 0,
          waitingOnYou: (waiting as { count: number | null }).count ?? 0,
          openPromises: (promises as { count: number | null }).count ?? 0,
          nextEvent: row?.title ? { title: row.title, startsAt: row.starts_at } : null,
          noticed: (noticed as { count: number | null }).count ?? 0,
          overlapsTomorrow: countOverlaps(tomorrowRows),
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, scopeKey]);

  return items;
}

/**
 * How many entries actually collide, in order. An event with no end is treated
 * as an hour, matching how the rest of the calendar reads it.
 */
function countOverlaps(rows: { starts_at: string; ends_at: string | null }[]): number {
  let overlaps = 0;
  for (let i = 1; i < rows.length; i++) {
    const prevStart = new Date(rows[i - 1].starts_at).getTime();
    const prevEnd = rows[i - 1].ends_at
      ? new Date(rows[i - 1].ends_at as string).getTime()
      : prevStart + 60 * 60 * 1000;
    const start = new Date(rows[i].starts_at).getTime();
    if (Number.isFinite(prevEnd) && Number.isFinite(start) && start < prevEnd) overlaps++;
  }
  return overlaps;
}
