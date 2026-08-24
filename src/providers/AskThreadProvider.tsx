// AskThreadProvider — the single thread engine behind every Ask surface.
// The Ask room, the desktop drawer, the mobile sheet and any future voice or
// wearable Ask all read the same active thread from here. Presentation layers
// never invent their own thread state.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { clearAskSession } from "@/lib/askSession";
import {
  autoTitle, bumpOutput, isLive, sortThreads, threadMatchesScope,
  type AskThread, type ThreadContext, type ThreadOutputKind,
} from "@/lib/askThreads";

const COLS =
  "id, title, scope, organization_id, pinned, archived_at, deleted_at, auto_titled, context_kind, context_id, context_label, last_message_at, outputs, created_at, updated_at";

type Ctx = {
  threads: AskThread[];
  archived: AskThread[];
  active: AskThread | null;
  activeId: string | null;
  loading: boolean;
  /** Open an existing thread. */
  openThread: (id: string) => void;
  /** Start a fresh thread in the active scope, optionally bound to context. */
  newThread: (context?: ThreadContext) => Promise<string | null>;
  /** Reuse the open thread if it's empty, otherwise start one. */
  ensureThread: (context?: ThreadContext) => Promise<string | null>;
  rename: (id: string, title: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  archive: (id: string, archived?: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Bind / unbind work context on the active thread. */
  bindContext: (id: string, context: ThreadContext | null) => Promise<void>;
  /** Called by the conversation surface after a message lands. */
  noteActivity: (id: string, firstUserText?: string) => Promise<void>;
  /** Record what a thread produced, so the spine can show its aftermath. */
  recordOutput: (id: string, kind: ThreadOutputKind) => Promise<void>;
  refresh: () => Promise<void>;
};

const AskThreadCtx = createContext<Ctx | null>(null);

export function AskThreadProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { scope, scopeFields } = useScope();
  const [all, setAll] = useState<AskThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) { setAll([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("conversations")
      .select(COLS)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) toast.fromError(error);
    setAll((data ?? []) as unknown as AskThread[]);
    setLoading(false);
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  const inScope = useMemo(
    () => sortThreads(all.filter((t) => threadMatchesScope(t, scope))),
    [all, scope],
  );
  const threads = useMemo(() => inScope.filter(isLive), [inScope]);
  const archived = useMemo(() => inScope.filter((t) => !!t.archived_at && !t.deleted_at), [inScope]);

  // Scope is authoritative: an out-of-scope thread can never stay open.
  useEffect(() => {
    if (activeId && !inScope.some((t) => t.id === activeId)) setActiveId(null);
  }, [activeId, inScope]);

  // Default to the most recent live thread in this scope.
  useEffect(() => {
    if (!loading && !activeId && threads.length) setActiveId(threads[0].id);
  }, [loading, activeId, threads]);

  const active = useMemo(() => inScope.find((t) => t.id === activeId) ?? null, [inScope, activeId]);

  const newThread = useCallback(async (context?: ThreadContext) => {
    if (!session) return null;
    const row = {
      user_id: session.user.id,
      title: context ? context.label : null,
      auto_titled: true,
      ...scopeFields(),
      scope: scope.type === "organization" ? "organization" : "personal",
      context_kind: context?.kind ?? null,
      context_id: context?.id ?? null,
      context_label: context?.label ?? null,
      last_message_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("conversations").insert(row as never).select(COLS).single();
    if (error || !data) { toast.fromError(error ?? new Error("Could not start a thread.")); return null; }
    const t = data as unknown as AskThread;
    setAll((p) => [t, ...p]);
    setActiveId(t.id);
    return t.id;
  }, [session, scope.type, scopeFields]);

  const ensureThread = useCallback(async (context?: ThreadContext) => {
    if (context) {
      const existing = threads.find(
        (t) => t.context_kind === context.kind && t.context_id === (context.id ?? null),
      );
      if (existing) { setActiveId(existing.id); return existing.id; }
      return newThread(context);
    }
    if (activeId) return activeId;
    if (threads.length) { setActiveId(threads[0].id); return threads[0].id; }
    return newThread();
  }, [activeId, threads, newThread]);

  const patch = useCallback(async (id: string, values: Partial<AskThread>) => {
    setAll((p) => p.map((t) => (t.id === id ? { ...t, ...values } as AskThread : t)));
    const { error } = await supabase.from("conversations").update(values as never).eq("id", id);
    if (error) { toast.fromError(error); await load(); }
  }, [load]);

  const rename = useCallback(async (id: string, title: string) => {
    const clean = title.trim().slice(0, 120);
    if (!clean) return;
    await patch(id, { title: clean, auto_titled: false });
  }, [patch]);

  const togglePin = useCallback(async (id: string) => {
    const t = all.find((x) => x.id === id);
    await patch(id, { pinned: !t?.pinned });
  }, [all, patch]);

  const archive = useCallback(async (id: string, archived = true) => {
    await patch(id, { archived_at: archived ? new Date().toISOString() : null });
    if (archived) clearAskSession(id);
    if (archived && activeId === id) setActiveId(null);
  }, [patch, activeId]);

  const remove = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    await patch(id, { deleted_at: now });
    setAll((p) => p.filter((t) => t.id !== id));
    clearAskSession(id);
    if (activeId === id) setActiveId(null);
    // Deleting a thread is a real state change, so it leaves a receipt.
    if (session) {
      await supabase.from("audit_log").insert({
        user_id: session.user.id,
        entity_type: "conversation",
        entity_id: id,
        event: "ask.thread.deleted",
        payload: { scope: scope.type, organization_id: scope.organizationId },
      } as never);
    }
  }, [patch, activeId, session, scope]);

  const bindContext = useCallback(async (id: string, context: ThreadContext | null) => {
    await patch(id, {
      context_kind: context?.kind ?? null,
      context_id: context?.id ?? null,
      context_label: context?.label ?? null,
    });
  }, [patch]);

  const noteActivity = useCallback(async (id: string, firstUserText?: string) => {
    const t = all.find((x) => x.id === id);
    const values: Partial<AskThread> = { last_message_at: new Date().toISOString() };
    if (firstUserText && t && t.auto_titled && (!t.title || t.title === "New thread")) {
      const title = autoTitle(firstUserText);
      if (title) values.title = title;
    }
    await patch(id, values);
  }, [all, patch]);

  const recordOutput = useCallback(async (id: string, kind: ThreadOutputKind) => {
    const t = all.find((x) => x.id === id);
    await patch(id, { outputs: bumpOutput(t?.outputs, kind) });
  }, [all, patch]);

  const value = useMemo<Ctx>(() => ({
    threads, archived, active, activeId, loading,
    openThread: setActiveId,
    newThread, ensureThread, rename, togglePin, archive, remove, bindContext, noteActivity, recordOutput,
    refresh: load,
  }), [threads, archived, active, activeId, loading, newThread, ensureThread, rename, togglePin, archive, remove, bindContext, noteActivity, recordOutput, load]);

  return <AskThreadCtx.Provider value={value}>{children}</AskThreadCtx.Provider>;
}

export function useAskThreads() {
  const v = useContext(AskThreadCtx);
  if (!v) throw new Error("useAskThreads must be inside AskThreadProvider");
  return v;
}
