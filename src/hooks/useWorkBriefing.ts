// useWorkBriefing — the records behind the Work briefing.
//
// Every query is scope-filtered through `applyScope`. Nothing here scores or
// decides; it hands real rows to `buildWorkBriefing`, which owns the judgment.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/lib/auth";
import {
  buildWorkBriefing,
  type BriefingInput,
  type BriefingItem,
  type WorkBriefing,
} from "@/lib/workBriefing";

const EMPTY: BriefingInput = { needsYou: [], arrived: [], due: [], drifting: [] };

/** A project is "drifting" once it has been untouched this long and still open. */
const QUIET_DAYS = 10;

export function useWorkBriefing(): {
  briefing: WorkBriefing;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const { applyScope, key } = useScope();
  const [input, setInput] = useState<BriefingInput>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const quietBefore = new Date(Date.now() - QUIET_DAYS * 86_400_000).toISOString();

      const [actions, notes, commitments, projects] = await Promise.all([
        applyScope(supabase.from("actions").select("id, title, status"))
          .in("status", ["proposed", "staged"])
          .order("created_at", { ascending: false })
          .limit(8),
        applyScope(supabase.from("notes").select("id, title, body, created_at"))
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(30),
        applyScope(supabase.from("commitments").select("id, summary, due_at, status"))
          .eq("status", "open")
          .not("due_at", "is", null)
          .order("due_at", { ascending: true })
          .limit(8),
        applyScope(supabase.from("projects").select("id, title, status, updated_at"))
          .lt("updated_at", quietBefore)
          .order("updated_at", { ascending: true })
          .limit(8),
      ]);

      /* Arrived means genuinely unsorted: a capture with no project attached. */
      const noteRows = (notes.data ?? []) as { id: string; title: string | null; body: string }[];
      let unsorted = noteRows;
      if (noteRows.length > 0) {
        const { data: linked } = await supabase
          .from("project_items")
          .select("item_id")
          .in(
            "item_id",
            noteRows.map((n) => n.id),
          );
        const attached = new Set(((linked ?? []) as { item_id: string }[]).map((r) => r.item_id));
        unsorted = noteRows.filter((n) => !attached.has(n.id));
      }

      const needsYou: BriefingItem[] = ((actions.data ?? []) as { id: string; title: string }[]).map((a) => ({
        id: a.id,
        label: a.title,
        surface: "actions" as const,
      }));

      const arrived: BriefingItem[] = unsorted.slice(0, 6).map((n) => ({
        id: n.id,
        label: n.title?.trim() || n.body.split("\n")[0].slice(0, 70) || "Untitled capture",
        surface: "inbox" as const,
      }));

      const due: BriefingItem[] = (
        (commitments.data ?? []) as { id: string; summary: string; due_at: string | null }[]
      ).map((c) => ({ id: c.id, label: c.summary, dueAt: c.due_at, surface: "commitments" as const }));

      const drifting: BriefingItem[] = (
        (projects.data ?? []) as { id: string; title: string; status: string; updated_at: string }[]
      )
        .filter((p) => p.status !== "archived" && p.status !== "done" && p.status !== "complete")
        .map((p) => ({
          id: p.id,
          label: p.title,
          lastAt: p.updated_at,
          surface: "projects" as const,
          href: `/projects/${p.id}`,
        }));

      setInput({ needsYou, arrived, due, drifting });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Work could not be read.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, nonce]);

  return {
    briefing: buildWorkBriefing(input),
    loading,
    error,
    refresh: () => setNonce((n) => n + 1),
  };
}
