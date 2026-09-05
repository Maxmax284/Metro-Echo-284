// useLiveFeed — the dashboard stops waiting.
//
// Echo already records every state change in the audit log. This subscribes to
// that log (plus captures and promises) over realtime, scope-filtered, so the
// board moves as things land instead of on the next reload. It never writes,
// never executes, and never invents an item: every line here is a row that
// already exists.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";

export type LiveEvent = {
  id: string;
  event: string;
  entity_type: string | null;
  entity_id?: string | null;
  created_at: string;
};

const MAX_LIVE = 12;

export function useLiveFeed({ onChange }: { onChange?: () => void } = {}) {
  const { session } = useAuth();
  const { key: scopeKey, matches } = useScope();
  const [live, setLive] = useState<LiveEvent[]>([]);
  const [pulse, setPulse] = useState(0);
  const [connected, setConnected] = useState(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // Coalesce bursts: a webhook can write several rows at once, and the board
  // should refetch once, not five times.
  const nudgeRefresh = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (nudgeRefresh.current) window.clearTimeout(nudgeRefresh.current);
    nudgeRefresh.current = window.setTimeout(() => {
      nudgeRefresh.current = null;
      changeRef.current?.();
    }, 700);
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    setLive([]);

    const channel = supabase
      .channel(`live-feed-${scopeKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as LiveEvent & { organization_id?: string | null };
          if (!matches(row)) return;
          setLive((prev) => [row, ...prev.filter((p) => p.id !== row.id)].slice(0, MAX_LIVE));
          setPulse((p) => p + 1);
          scheduleRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${userId}` },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commitments", filter: `user_id=eq.${userId}` },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "actions", filter: `user_id=eq.${userId}` },
        () => scheduleRefresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "nudges", filter: `user_id=eq.${userId}` },
        () => scheduleRefresh(),
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      if (nudgeRefresh.current) window.clearTimeout(nudgeRefresh.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, scopeKey]);

  return { live, pulse, connected };
}
