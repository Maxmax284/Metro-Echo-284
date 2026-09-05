// useWorkingContext — scoped, derived "continue where you left off" layer.
//
// No new tables: the signal comes from records that already exist (receipts,
// project_items, open actions, open commitments, fresh notes). The compact
// summary is cached back into projects.metadata.working_context so a later
// session (or Ask Echo) can diff against it.
//
// Scope isolation: every read goes through applyScope, and the cache key
// carries the scope key, so Personal never mixes with a workspace.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import {
  mergeSnapshot,
  rankWorkCandidates,
  readSnapshot,
  snapshotDeltas,
  toSnapshot,
  type WorkSignal,
  type WorkingCandidate,
  type WorkingContextSnapshot,
} from "@/lib/workingContext";

type ProjectRow = { id: string; title: string; pinned: boolean; metadata: unknown; updated_at: string };

export type WorkingContextState = {
  loading: boolean;
  error: string | null;
  candidates: WorkingCandidate[];
  /** projectId -> deltas since the cached snapshot. */
  deltas: Record<string, string[]>;
  refresh: () => void;
  pin: (projectId: string, next: boolean) => Promise<void>;
  dismiss: (projectId: string, hours?: number) => Promise<void>;
  resolve: (projectId: string) => Promise<void>;
};

const WINDOW_DAYS = 14;

export function useWorkingContext(enabled = true): WorkingContextState {
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<WorkingCandidate[]>([]);
  const [deltas, setDeltas] = useState<Record<string, string[]>>({});
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
      const [p, a, c, e] = await Promise.all([
        applyScope(supabase.from("projects").select("id, title, pinned, metadata, updated_at")).neq("status", "archived").limit(60),
        applyScope(supabase.from("actions").select("id, title, status, updated_at"))
          .in("status", ["proposed", "staged", "approved", "executed"])
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(60),
        applyScope(supabase.from("commitments").select("id, summary, due_at, status, updated_at"))
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(60),
        applyScope(supabase.from("audit_log").select("id, event, entity_type, entity_id, created_at"))
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(80),
      ]);
      if (p.error) throw p.error;

      const projects = (p.data ?? []) as ProjectRow[];
      const byId = new Map(projects.map((r) => [r.id, r]));
      const projectIds = projects.map((r) => r.id);

      // item -> project, so loose records inherit the project they belong to.
      const ownerOf = new Map<string, string>();
      if (projectIds.length) {
        const { data: items } = await supabase
          .from("project_items")
          .select("item_id, project_id, added_at")
          .in("project_id", projectIds)
          .limit(500);
        for (const row of (items ?? []) as { item_id: string; project_id: string }[]) {
          ownerOf.set(row.item_id, row.project_id);
        }
      }

      const titleOf = (id: string | null) => (id ? byId.get(id)?.title ?? null : null);
      const signals: WorkSignal[] = [];

      for (const row of (a.data ?? []) as { id: string; title: string; status: string; updated_at: string }[]) {
        const projectId = ownerOf.get(row.id) ?? null;
        signals.push({
          projectId,
          projectTitle: titleOf(projectId),
          kind: "action",
          at: row.updated_at,
          label: row.title,
          unresolved: row.status !== "executed",
          decision: row.status === "approved" || row.status === "executed",
        });
      }

      for (const row of (c.data ?? []) as { id: string; summary: string; due_at: string | null; status: string; updated_at: string }[]) {
        const projectId = ownerOf.get(row.id) ?? null;
        signals.push({
          projectId,
          projectTitle: titleOf(projectId),
          kind: "commitment",
          at: row.updated_at,
          label: row.summary,
          unresolved: row.status === "open",
          hasDueDate: !!row.due_at,
        });
      }

      for (const row of (e.data ?? []) as { id: string; event: string; entity_type: string; entity_id: string | null; created_at: string }[]) {
        const projectId = (row.entity_id && ownerOf.get(row.entity_id)) || (row.entity_type === "project" ? row.entity_id : null);
        if (!projectId) continue;
        signals.push({
          projectId,
          projectTitle: titleOf(projectId),
          kind: "receipt",
          at: row.created_at,
          label: row.event.replace(/[._:]/g, " "),
          decision: /approve|execute/.test(row.event),
        });
      }

      const pinned = new Set(projects.filter((r) => r.pinned || readSnapshot(r.metadata)?.pinned).map((r) => r.id));
      const dismissedUntil: Record<string, string | null | undefined> = {};
      for (const r of projects) dismissedUntil[r.id] = readSnapshot(r.metadata)?.dismissed_until ?? null;

      const ranked = rankWorkCandidates(signals, { pinned, dismissedUntil });

      const nextDeltas: Record<string, string[]> = {};
      for (const cand of ranked.slice(0, 3)) {
        if (!cand.projectId) continue;
        const prev = readSnapshot(byId.get(cand.projectId)?.metadata) as WorkingContextSnapshot | null;
        const d = snapshotDeltas(prev, cand);
        if (d.length) nextDeltas[cand.projectId] = d;
        // Refresh the cache so the next session can diff against this state.
        const merged = mergeSnapshot(byId.get(cand.projectId)?.metadata, {
          ...toSnapshot(cand),
          dismissed_until: prev?.dismissed_until ?? null,
        });
        void supabase.from("projects").update({ metadata: merged as never }).eq("id", cand.projectId);
      }

      setCandidates(ranked);
      setDeltas(nextDeltas);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read recent work.");
    } finally {
      setLoading(false);
    }
  }, [applyScope]);

  useEffect(() => {
    if (!session || !enabled) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey, nonce, enabled]);

  const patchProject = useCallback(
    async (projectId: string, patch: Partial<WorkingContextSnapshot>) => {
      const { data } = await supabase.from("projects").select("metadata").eq("id", projectId).maybeSingle();
      const merged = mergeSnapshot(data?.metadata, patch);
      await supabase.from("projects").update({ metadata: merged as never }).eq("id", projectId);
      setNonce((n) => n + 1);
    },
    [],
  );

  return {
    loading,
    error,
    candidates,
    deltas,
    refresh: () => setNonce((n) => n + 1),
    pin: (projectId, next) => patchProject(projectId, { pinned: next }),
    dismiss: (projectId, hours = 24) =>
      patchProject(projectId, { dismissed_until: new Date(Date.now() + hours * 3600000).toISOString() }),
    resolve: (projectId) => patchProject(projectId, { unresolved: [], dismissed_until: null, pinned: false }),
  };
}
