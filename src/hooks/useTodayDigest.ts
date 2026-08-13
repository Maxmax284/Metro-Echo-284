// useTodayDigest — scope-aware aggregation for the Today surface.
//
// Two waves on purpose: the critical wave (promises + things staged for
// approval) renders as soon as it lands, and the background wave (receipts,
// fresh captures, security) fills in after. A slow or failing background feed
// never blocks Today.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import {
  buildAttention,
  groupAttention,
  quietSummary,
  securityLine,
  type AttentionGroup,
  type AttentionItem,
  type DigestAction,
  type DigestCommitment,
  type DigestEvent,
} from "@/lib/todayDigest";

export type TodayDigest = {
  loadingCritical: boolean;
  loadingBackground: boolean;
  backgroundError: string | null;
  commitments: DigestCommitment[];
  actions: DigestAction[];
  attention: AttentionItem[];
  groups: AttentionGroup[];
  overdue: DigestCommitment[];
  dueToday: DigestCommitment[];
  upcoming: DigestCommitment[];
  events: DigestEvent[];
  captureCount: number;
  security: ReturnType<typeof securityLine>;
  quiet: boolean;
  quietLine: string;
  refresh: () => void;
};

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function useTodayDigest(): TodayDigest {
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();

  const [loadingCritical, setLoadingCritical] = useState(true);
  const [loadingBackground, setLoadingBackground] = useState(true);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [commitments, setCommitments] = useState<DigestCommitment[]>([]);
  const [actions, setActions] = useState<DigestAction[]>([]);
  const [events, setEvents] = useState<DigestEvent[]>([]);
  const [captureCount, setCaptureCount] = useState(0);
  const [projectOf, setProjectOf] = useState<Record<string, string | undefined>>({});
  const [nonce, setNonce] = useState(0);

  const loadCritical = useCallback(async () => {
    setLoadingCritical(true);
    const [c, a] = await Promise.all([
      applyScope(supabase.from("commitments").select("id, summary, due_at, priority"))
        .eq("status", "open")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(30),
      applyScope(supabase.from("actions").select("id, title, risk, status, updated_at"))
        .in("status", ["staged", "proposed"])
        .order("updated_at", { ascending: false })
        .limit(10),
    ]);
    setCommitments((c.data as DigestCommitment[]) ?? []);
    setActions((a.data as DigestAction[]) ?? []);
    setLoadingCritical(false);
  }, [applyScope]);

  const loadBackground = useCallback(async () => {
    setLoadingBackground(true);
    setBackgroundError(null);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [e, n] = await Promise.all([
        applyScope(supabase.from("audit_log").select("id, event, entity_type, created_at"))
          .order("created_at", { ascending: false })
          .limit(30),
        applyScope(supabase.from("notes").select("id")).gte("created_at", since).limit(50),
      ]);
      if (e.error) throw e.error;
      setEvents((e.data as DigestEvent[]) ?? []);
      setCaptureCount((n.data as unknown[])?.length ?? 0);
    } catch (err) {
      setBackgroundError(err instanceof Error ? err.message : "Couldn't read recent activity.");
    } finally {
      setLoadingBackground(false);
    }
  }, [applyScope]);

  // Project names for grouping — best effort, never blocks.
  const loadGrouping = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        setProjectOf({});
        return;
      }
      const { data } = await supabase
        .from("project_items")
        .select("item_id, project_id, projects(name)")
        .in("item_id", ids);
      const map: Record<string, string | undefined> = {};
      for (const row of (data ?? []) as { item_id: string; projects: { name: string } | null }[]) {
        map[row.item_id] = row.projects?.name;
      }
      setProjectOf(map);
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    setProjectOf({});
    loadCritical();
    loadBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey, nonce]);

  const attention = buildAttention(commitments, actions);

  useEffect(() => {
    if (!session || loadingCritical) return;
    loadGrouping(attention.map((a) => a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey, loadingCritical, attention.length]);

  const now = new Date();
  const overdue = commitments.filter((c) => c.due_at && new Date(c.due_at) < now);
  const dueToday = commitments.filter((c) => c.due_at && new Date(c.due_at) >= now && isSameDay(new Date(c.due_at), now));
  const upcoming = commitments.filter(
    (c) => !c.due_at || (new Date(c.due_at) >= now && !isSameDay(new Date(c.due_at), now)),
  );

  const security = securityLine(events);
  const next = dueToday[0] ?? upcoming.find((c) => c.due_at) ?? null;

  return {
    loadingCritical,
    loadingBackground,
    backgroundError,
    commitments,
    actions,
    attention,
    groups: groupAttention(attention, projectOf),
    overdue,
    dueToday,
    upcoming,
    events: events.slice(0, 6),
    captureCount,
    security,
    quiet: attention.length === 0,
    quietLine: quietSummary({
      commitmentsToday: dueToday.length,
      nextLabel: next?.summary ?? null,
      nextWhen: next?.due_at ? (isSameDay(new Date(next.due_at), now) ? "today" : "later") : null,
      securityTone: security.tone,
    }),
    refresh: () => setNonce((n) => n + 1),
  };
}
