// useTodayDigest — scope-aware aggregation for the Today surface.
//
// Two waves on purpose: the critical wave (promises + things staged for
// approval) renders as soon as it lands, and the background wave (receipts,
// fresh captures, security) fills in after. A slow or failing background feed
// never blocks Today.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { isDriftKind } from "@/lib/drift";
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

export type NoticedSignal = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  /** When the note was written — day words are re-read against it. */
  created_at?: string | null;
};

export type TodayDigest = {
  loadingCritical: boolean;
  loadingBackground: boolean;
  /** Epoch ms of the last real read, for the freshness line. */
  checkedAt: number | null;
  backgroundError: string | null;
  commitments: DigestCommitment[];
  actions: DigestAction[];
  attention: AttentionItem[];
  groups: AttentionGroup[];
  overdue: DigestCommitment[];
  dueToday: DigestCommitment[];
  upcoming: DigestCommitment[];
  events: DigestEvent[];
  /** Full recent event list, for the "What changed" drill-down. */
  allEvents: DigestEvent[];
  captureCount: number;
  security: ReturnType<typeof securityLine>;
  quiet: boolean;
  quietLine: string;
  /** The single proactive drift signal for this scope, if any. */
  noticed: NoticedSignal | null;
  dismissNoticed: (id: string) => void;
  followNoticed: (signal: NoticedSignal) => void;
  refresh: () => void;
};

const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function useTodayDigest(): TodayDigest {
  const { session } = useAuth();
  const { applyScope, withScope, key: scopeKey } = useScope();

  const [loadingCritical, setLoadingCritical] = useState(true);
  const [loadingBackground, setLoadingBackground] = useState(true);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);
  const [commitments, setCommitments] = useState<DigestCommitment[]>([]);
  const [actions, setActions] = useState<DigestAction[]>([]);
  const [events, setEvents] = useState<DigestEvent[]>([]);
  const [captureCount, setCaptureCount] = useState(0);
  const [noticed, setNoticed] = useState<NoticedSignal | null>(null);
  const [projectOf, setProjectOf] = useState<Record<string, string | undefined>>({});
  const [nonce, setNonce] = useState(0);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  /* A refresh is not a first load. Flipping loading back on every refetch tore
     the whole feed down and rebuilt it — which is what read as flickering. The
     loading state now belongs to the first read of a scope only; after that the
     page holds the rows it has and swaps values in place. */
  const loadedOnce = useRef(false);

  const loadCritical = useCallback(async () => {
    if (!loadedOnce.current) setLoadingCritical(true);
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
    loadedOnce.current = true;
  }, [applyScope]);

  const loadBackground = useCallback(async () => {
    if (!loadedOnce.current) setLoadingBackground(true);
    setBackgroundError(null);
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [e, n] = await Promise.all([
        applyScope(supabase.from("audit_log").select("id, event, entity_type, created_at"))
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(30),
        applyScope(supabase.from("notes").select("id")).gte("created_at", since).limit(50),
      ]);
      if (e.error) throw e.error;
      // One proactive signal, scope-filtered, highest priority first. Anything
      // pending for more than two days is stale, not news.
      const staleCut = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: nudgeRows } = await applyScope(
        supabase
          .from("nudges")
          .select("id, kind, title, body, related_entity_type, related_entity_id, priority, status, created_at"),
      )
        .eq("status", "pending")
        .gte("created_at", staleCut)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
      const drift = ((nudgeRows ?? []) as NoticedSignal[] & { kind: string }[]).find((n) =>
        isDriftKind(n.kind),
      );
      setNoticed(drift ? (drift as NoticedSignal) : null);
      setEvents((e.data as DigestEvent[]) ?? []);
      setCaptureCount((n.data as unknown[])?.length ?? 0);
      setCheckedAt(Date.now());
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
        .select("item_id, project_id, projects(title)")
        .in("item_id", ids);
      const map: Record<string, string | undefined> = {};
      for (const row of (data ?? []) as { item_id: string; projects: { title: string } | null }[]) {
        map[row.item_id] = row.projects?.title;
      }
      setProjectOf(map);
    },
    [],
  );

  /* Changing scope IS a first load: different room, different rows. */
  useEffect(() => {
    loadedOnce.current = false;
  }, [scopeKey]);

  useEffect(() => {
    if (!session) return;
    setProjectOf({});
    loadCritical();
    loadBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey, nonce]);

  /* Everything derived is memoised on the rows it came from. Recomputing these
     on every render handed downstream readers a brand-new array each time,
     which restarted their effects, which set state, which rendered again — the
     loop that read as flickering. Same numbers, one identity. */
  const attention = useMemo(() => buildAttention(commitments, actions), [commitments, actions]);

  useEffect(() => {
    if (!session || loadingCritical) return;
    loadGrouping(attention.map((a) => a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey, loadingCritical, attention.length]);

  const buckets = useMemo(() => {
    const now = new Date();
    return {
      now,
      overdue: commitments.filter((c) => c.due_at && new Date(c.due_at) < now),
      dueToday: commitments.filter(
        (c) => c.due_at && new Date(c.due_at) >= now && isSameDay(new Date(c.due_at), now),
      ),
      upcoming: commitments.filter(
        (c) => !c.due_at || (new Date(c.due_at) >= now && !isSameDay(new Date(c.due_at), now)),
      ),
    };
  }, [commitments]);
  const { now, overdue, dueToday, upcoming } = buckets;

  const security = useMemo(() => securityLine(events), [events]);
  const groups = useMemo(() => groupAttention(attention, projectOf), [attention, projectOf]);
  const recentEvents = useMemo(() => events.slice(0, 6), [events]);
  const next = dueToday[0] ?? upcoming.find((c) => c.due_at) ?? null;

  return {
    loadingCritical,
    loadingBackground,
    checkedAt,
    backgroundError,
    commitments,
    actions,
    attention,
    groups,
    overdue,
    dueToday,
    upcoming,
    events: recentEvents,
    allEvents: events,
    captureCount,
    security,
    quiet: attention.length === 0,
    quietLine: quietSummary({
      commitmentsToday: dueToday.length,
      nextLabel: next?.summary ?? null,
      nextWhen: next?.due_at ? (isSameDay(new Date(next.due_at), now) ? "today" : "later") : null,
      securityTone: security.tone,
    }),
    noticed,
    dismissNoticed: async (id: string) => {
      setNoticed(null);
      await supabase.from("nudges").update({ status: "dismissed" }).eq("id", id);
      if (session?.user?.id) {
        await supabase.from("audit_log").insert(
          withScope({
            user_id: session.user.id,
            entity_type: "nudge",
            entity_id: id,
            event: "nudge.dismissed",
            payload: {},
          }) as never,
        );
      }
    },
    followNoticed: async (signal: NoticedSignal) => {
      setNoticed(null);
      await supabase.from("nudges").update({ status: "acted" }).eq("id", signal.id);
      if (session?.user?.id) {
        await supabase.from("audit_log").insert(
          withScope({
            user_id: session.user.id,
            entity_type: "nudge",
            entity_id: signal.related_entity_id ?? signal.id,
            event: "nudge.followed",
            payload: { kind: signal.kind },
          }) as never,
        );
      }
    },
    refresh: () => setNonce((n) => n + 1),
  };
}
