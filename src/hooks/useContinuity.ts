// useContinuity — scoped long-gap continuity.
//
// Reuses everything that already exists: actions, commitments, audit_log
// (receipts), notes, brief_exports, documents, project_items, projects. No new
// tables — the compact snapshot rides in projects.metadata.continuity, keyed by
// scope, and is only rewritten when a meaningful record moved.
//
// Scope isolation: every read goes through applyScope, snapshots carry the scope
// key, and corrections are written scoped.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import {
  changedSince,
  decisionHistory,
  groundedRelations,
  mergeContinuitySnapshot,
  rankContinuity,
  readContinuitySnapshot,
  shouldRefreshSnapshot,
  toContinuitySnapshot,
  unresolvedThreads,
  type ContinuityCandidate,
  type ContinuitySignal,
  type ContinuitySnapshot,
} from "@/lib/continuity";

const WINDOW_DAYS = 90;
const CHANGED_WINDOW_DAYS = 14;

type ProjectRow = {
  id: string;
  title: string;
  pinned: boolean;
  status: string;
  metadata: unknown;
  updated_at: string;
};

export type ContinuityState = {
  loading: boolean;
  error: string | null;
  /** Everything that earned the right to surface, ranked. */
  candidates: ContinuityCandidate[];
  /** Active + recent work (the Today "continue" set). */
  live: ContinuityCandidate[];
  /** Old but still open — quiet unless there's a reason. */
  dormant: ContinuityCandidate[];
  /** projectId (or "loose") -> what changed since the last snapshot. */
  changes: Record<string, string[]>;
  threads: ReturnType<typeof unresolvedThreads>;
  decisions: ReturnType<typeof decisionHistory>;
  refresh: () => void;
  pin: (projectId: string, next: boolean) => Promise<void>;
  dismiss: (projectId: string, hours?: number) => Promise<void>;
  markFinished: (projectId: string) => Promise<void>;
};

export function useContinuity(enabled = true): ContinuityState {
  const { session, user } = useAuth();
  const { applyScope, key: scopeKey, withScope } = useScope();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ContinuityCandidate[]>([]);
  const [changes, setChanges] = useState<Record<string, string[]>>({});
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      const since = new Date(now - WINDOW_DAYS * 86400000).toISOString();

      const [p, a, c, e, n, b, d] = await Promise.all([
        applyScope(supabase.from("projects").select("id, title, pinned, status, metadata, updated_at"))
          .neq("status", "archived")
          .limit(80),
        applyScope(supabase.from("actions").select("id, title, status, risk, updated_at, result"))
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(120),
        applyScope(supabase.from("commitments").select("id, summary, due_at, status, updated_at, priority"))
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(120),
        applyScope(supabase.from("audit_log").select("id, event, entity_type, entity_id, created_at"))
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(150),
        applyScope(supabase.from("notes").select("id, title, body, created_at"))
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(60),
        applyScope(supabase.from("brief_exports").select("id, title, status, project_id, created_at"))
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(40),
        applyScope(supabase.from("documents").select("id, title, status, project_id, updated_at"))
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(40),
      ]);
      if (p.error) throw p.error;

      const projects = (p.data ?? []) as ProjectRow[];
      const byId = new Map(projects.map((r) => [r.id, r]));
      const titleOf = (id: string | null) => (id ? byId.get(id)?.title ?? null : null);
      const projectIds = projects.map((r) => r.id);

      // record -> owning project, so loose rows inherit their project.
      const ownerOf = new Map<string, string>();
      const sharedItems = new Map<string, { projects: string[]; label: string }>();
      if (projectIds.length) {
        const { data: items } = await supabase
          .from("project_items")
          .select("item_id, item_type, project_id, added_at")
          .in("project_id", projectIds)
          .limit(800);
        for (const row of (items ?? []) as { item_id: string; item_type: string; project_id: string }[]) {
          if (!ownerOf.has(row.item_id)) ownerOf.set(row.item_id, row.project_id);
          const entry = sharedItems.get(row.item_id) ?? { projects: [], label: row.item_type };
          entry.projects.push(row.project_id);
          sharedItems.set(row.item_id, entry);
        }
      }

      const signals: ContinuitySignal[] = [];
      const changedProjects = new Set<string>();
      const markChanged = (projectId: string | null, at: string) => {
        if (projectId && now - new Date(at).getTime() < CHANGED_WINDOW_DAYS * 86400000) changedProjects.add(projectId);
      };

      for (const row of (a.data ?? []) as any[]) {
        const projectId = ownerOf.get(row.id) ?? null;
        const open = row.status !== "executed" && row.status !== "cancelled" && row.status !== "audited";
        signals.push({
          projectId,
          projectTitle: titleOf(projectId),
          kind: "action",
          at: row.updated_at,
          label: row.title,
          sourceId: row.id,
          unresolved: open,
          pendingApproval: row.status === "proposed" || row.status === "staged",
          highRisk: row.risk === "high",
          blocked: row.status === "needs_credentials",
          decision: row.status === "approved" || row.status === "executed" || row.status === "audited",
          rationale: typeof row.result?.reason === "string" ? row.result.reason : null,
        });
        markChanged(projectId, row.updated_at);
      }

      for (const row of (c.data ?? []) as any[]) {
        const projectId = ownerOf.get(row.id) ?? null;
        signals.push({
          projectId,
          projectTitle: titleOf(projectId),
          kind: "commitment",
          at: row.updated_at,
          label: row.summary,
          sourceId: row.id,
          unresolved: row.status === "open",
          hasDueDate: !!row.due_at,
          dueAt: row.due_at ?? null,
          userTouch: true,
        });
        markChanged(projectId, row.updated_at);
      }

      for (const row of (e.data ?? []) as any[]) {
        const projectId =
          (row.entity_id && ownerOf.get(row.entity_id)) || (row.entity_type === "project" ? row.entity_id : null);
        if (!projectId) continue;
        const event = String(row.event);
        signals.push({
          projectId,
          projectTitle: titleOf(projectId),
          kind: "receipt",
          at: row.created_at,
          label: event.replace(/[._:]/g, " "),
          sourceId: row.id,
          decision: /approve|execute|rollback|cancel/.test(event),
          userTouch: /approve|execute|update|create/.test(event),
        });
        markChanged(projectId, row.created_at);
      }

      for (const row of (n.data ?? []) as any[]) {
        const projectId = ownerOf.get(row.id) ?? null;
        signals.push({
          projectId,
          projectTitle: titleOf(projectId),
          kind: "note",
          at: row.created_at,
          label: row.title || String(row.body ?? "").slice(0, 70),
          sourceId: row.id,
          userTouch: true,
        });
        markChanged(projectId, row.created_at);
      }

      for (const row of (b.data ?? []) as any[]) {
        signals.push({
          projectId: row.project_id ?? null,
          projectTitle: titleOf(row.project_id ?? null),
          kind: "brief",
          at: row.created_at,
          label: `Brief: ${row.title}`,
          sourceId: row.id,
          unresolved: row.status === "draft" || row.status === "pending",
          userTouch: true,
        });
        markChanged(row.project_id ?? null, row.created_at);
      }

      for (const row of (d.data ?? []) as any[]) {
        const open = ["uploaded", "extracting", "extracted", "reviewing", "drafting", "drafted"].includes(row.status);
        signals.push({
          projectId: row.project_id ?? null,
          projectTitle: titleOf(row.project_id ?? null),
          kind: "document",
          at: row.updated_at,
          label: `${row.title} (${String(row.status).replace(/_/g, " ")})`,
          sourceId: row.id,
          unresolved: open,
          blocked: row.status === "failed",
          userTouch: true,
        });
        markChanged(row.project_id ?? null, row.updated_at);
      }

      // Grounded cross-project relations: the same record sits in two projects.
      const links: { projectId: string; otherProjectId: string; otherTitle: string | null; via: string; at: string }[] = [];
      for (const [, entry] of sharedItems) {
        const uniq = Array.from(new Set(entry.projects));
        if (uniq.length < 2) continue;
        for (const from of uniq) {
          for (const to of uniq) {
            if (from === to) continue;
            links.push({
              projectId: from,
              otherProjectId: to,
              otherTitle: titleOf(to),
              via: entry.label,
              at: new Date(now).toISOString(),
            });
          }
        }
      }

      const snapshots: Record<string, ContinuitySnapshot | null> = {};
      const pinned = new Set<string>();
      const resolved = new Set<string>();
      const dismissedUntil: Record<string, string | null | undefined> = {};
      const priority: Record<string, string | null | undefined> = {};
      for (const r of projects) {
        const snap = readContinuitySnapshot(r.metadata, scopeKey);
        snapshots[r.id] = snap;
        if (r.pinned || snap?.pinned) pinned.add(r.id);
        if (snap?.resolved) resolved.add(r.id);
        dismissedUntil[r.id] = snap?.dismissed_until ?? null;
        priority[r.id] = (r.metadata as any)?.priority ?? null;
      }

      const ranked = rankContinuity(signals, {
        now,
        pinned,
        resolved,
        dismissedUntil,
        priority,
        related: groundedRelations(links, changedProjects),
        snapshots,
      });

      const nextChanges: Record<string, string[]> = {};
      for (const cand of ranked.slice(0, 6)) {
        const prev = cand.projectId ? snapshots[cand.projectId] ?? null : null;
        const delta = changedSince(prev, cand);
        if (delta.length) nextChanges[cand.key] = delta;
        // Incremental refresh: only write when something meaningful moved.
        if (cand.projectId && shouldRefreshSnapshot(prev, cand)) {
          const merged = mergeContinuitySnapshot(
            byId.get(cand.projectId)?.metadata,
            {
              ...toContinuitySnapshot(cand, scopeKey, now),
              dismissed_until: prev?.dismissed_until ?? null,
              resolved: prev?.resolved ?? false,
            },
            scopeKey,
          );
          void supabase.from("projects").update({ metadata: merged as never }).eq("id", cand.projectId);
        }
      }

      setCandidates(ranked);
      setChanges(nextChanges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reconstruct recent work.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyScope, scopeKey]);

  useEffect(() => {
    if (!session || !enabled) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey, nonce, enabled]);

  const patchProject = useCallback(
    async (projectId: string, patch: Partial<ContinuitySnapshot>) => {
      const { data } = await supabase.from("projects").select("metadata").eq("id", projectId).maybeSingle();
      const merged = mergeContinuitySnapshot(data?.metadata, patch, scopeKey);
      await supabase.from("projects").update({ metadata: merged as never }).eq("id", projectId);
      setNonce((v) => v + 1);
    },
    [scopeKey],
  );

  /** Corrections steer future continuity — reuse the existing corrections table. */
  const recordCorrection = useCallback(
    async (projectId: string, feedback: string, note: string) => {
      if (!user) return;
      const { data: inserted } = await supabase.from("corrections").insert(
        withScope({
          user_id: user.id,
          scope: "continuity",
          surface: "continuity",
          target_type: "project",
          target_id: projectId,
          feedback_type: feedback,
          user_note: note,
          source_label: "user",
          confidence_impact: "medium",
          status: "active",
        }) as never,
      ).select("id").single();
      // Receipt: a correction is a recorded event, traceable in Receipts.
      await supabase.from("audit_log").insert(
        withScope({
          user_id: user.id,
          entity_type: "correction",
          entity_id: inserted?.id ?? null,
          event: "correction:continuity",
          payload: { surface: "continuity", target_type: "project", target_id: projectId, feedback },
        }) as never,
      );
    },
    [user, withScope],
  );

  const derived = useMemo(() => {
    const live = candidates.filter((c) => c.state === "active" || c.state === "recent");
    const dormant = candidates.filter((c) => c.state !== "active" && c.state !== "recent");
    return {
      live,
      dormant,
      threads: unresolvedThreads(candidates),
      decisions: decisionHistory(candidates),
    };
  }, [candidates]);

  return {
    loading,
    error,
    candidates,
    changes,
    ...derived,
    refresh: () => setNonce((v) => v + 1),
    pin: (projectId, next) => patchProject(projectId, { pinned: next }),
    dismiss: async (projectId, hours = 24 * 7) => {
      await recordCorrection(projectId, "stop_surfacing", "User dismissed this from continuity.");
      await patchProject(projectId, { dismissed_until: new Date(Date.now() + hours * 3600000).toISOString() });
    },
    markFinished: async (projectId) => {
      await recordCorrection(projectId, "already_resolved", "User marked this project finished.");
      await patchProject(projectId, { resolved: true, unresolved: [], dismissed_until: null, pinned: false });
    },
  };
}
