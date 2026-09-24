// useWorkBriefing — the records behind the Work briefing.
//
// Every query is scope-filtered through `applyScope`. Nothing here scores or
// decides; it hands real rows to `buildWorkBriefing`, which owns the judgment.
// Arrivals carry a suggested home from the deterministic `suggestHome` matcher.
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
import { suggestHome, type HomeProject } from "@/lib/arrivalHome";

const EMPTY: BriefingInput = { needsYou: [], arrived: [], due: [], drifting: [] };

/** A project is "drifting" once it has been untouched this long and still open. */
const QUIET_DAYS = 10;
const CLOSED = new Set(["archived", "done", "complete"]);

type Raw = { id: string; type: "note" | "capture"; label: string; text: string; at: string };

/** Pure: unsorted arrivals with a suggested home, minus attached/dismissed. */
export function arrivalsWithHomes(
  raw: Raw[],
  projects: HomeProject[],
  attached: Set<string>,
  dismissed: Set<string>,
): BriefingItem[] {
  return raw
    .filter((r) => !attached.has(`${r.type}:${r.id}`))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 6)
    .map((r) => {
      const open = projects.filter((p) => !dismissed.has(`${p.id}:${r.type}:${r.id}`));
      const s = suggestHome(r.text, open);
      return {
        id: r.id,
        label: r.label,
        surface: "inbox" as const,
        itemType: r.type,
        suggestion: s ? { projectId: s.projectId, title: s.title } : null,
      };
    });
}

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

      const [actions, notes, tgMsgs, commitments, projects, openProjects] = await Promise.all([
        applyScope(supabase.from("actions").select("id, title, status"))
          .in("status", ["proposed", "staged"])
          .order("created_at", { ascending: false })
          .limit(8),
        applyScope(supabase.from("notes").select("id, title, body, created_at"))
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(30),
        /* Telegram text that nothing routed lands as a user message. */
        applyScope(supabase.from("messages").select("id, content, created_at, metadata"))
          .eq("role", "user")
          .eq("metadata->>source", "telegram")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(20),
        applyScope(supabase.from("commitments").select("id, summary, due_at, status"))
          .eq("status", "open")
          .not("due_at", "is", null)
          .order("due_at", { ascending: true })
          .limit(8),
        applyScope(supabase.from("projects").select("id, title, status, updated_at"))
          .lt("updated_at", quietBefore)
          .order("updated_at", { ascending: true })
          .limit(8),
        applyScope(supabase.from("projects").select("id, title, summary, status"))
          .order("updated_at", { ascending: false })
          .limit(40),
      ]);

      const noteRows = (notes.data ?? []) as { id: string; title: string | null; body: string; created_at: string }[];
      const msgRows = ((tgMsgs.data ?? []) as { id: string; content: string; created_at: string; metadata: any }[])
        .filter((m) => !m.metadata?.routed_to && (m.content ?? "").trim().length > 2);

      const raw: Raw[] = [
        ...noteRows.map((n) => ({
          id: n.id,
          type: "note" as const,
          label: n.title?.trim() || n.body.split("\n")[0].slice(0, 70) || "Untitled capture",
          text: `${n.title ?? ""} ${n.body ?? ""}`,
          at: n.created_at,
        })),
        ...msgRows.map((m) => ({
          id: m.id,
          type: "capture" as const,
          label: m.content.split("\n")[0].slice(0, 70),
          text: m.content,
          at: m.created_at,
        })),
      ];

      const ids = raw.map((r) => r.id);
      const [linked, dism] = ids.length
        ? await Promise.all([
            supabase.from("project_items").select("item_type, item_id").in("item_id", ids),
            supabase.from("project_suggestion_dismissals").select("project_id, item_type, item_id").in("item_id", ids),
          ])
        : [{ data: [] }, { data: [] }];
      const attached = new Set(((linked.data ?? []) as any[]).map((r) => `${r.item_type}:${r.item_id}`));
      const dismissed = new Set(((dism.data ?? []) as any[]).map((r) => `${r.project_id}:${r.item_type}:${r.item_id}`));
      const homes = ((openProjects.data ?? []) as { id: string; title: string; summary: string | null; status: string }[])
        .filter((p) => !CLOSED.has(p.status));

      const needsYou: BriefingItem[] = ((actions.data ?? []) as { id: string; title: string }[]).map((a) => ({
        id: a.id,
        label: a.title,
        surface: "actions" as const,
      }));

      const arrived = arrivalsWithHomes(raw, homes, attached, dismissed);

      const due: BriefingItem[] = (
        (commitments.data ?? []) as { id: string; summary: string; due_at: string | null }[]
      ).map((c) => ({ id: c.id, label: c.summary, dueAt: c.due_at, surface: "commitments" as const }));

      const drifting: BriefingItem[] = (
        (projects.data ?? []) as { id: string; title: string; status: string; updated_at: string }[]
      )
        .filter((p) => !CLOSED.has(p.status))
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
