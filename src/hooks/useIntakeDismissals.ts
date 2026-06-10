import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { keyFor, type DismissedSet } from "@/lib/intakeLifecycle";

type Row = {
  id: string;
  item_kind: string;
  item_id: string;
  dismissed_at: string;
  restored_at: string | null;
  reason: string | null;
  payload: any;
};

/**
 * Cross-kind dismissal store. Dismiss writes a row; restore stamps
 * `restored_at`. An item is "dismissed" iff the most recent row has
 * restored_at IS NULL. Realtime keeps the set in sync.
 */
export function useIntakeDismissals() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("intake_dismissals" as any)
      .select("id, item_kind, item_id, dismissed_at, restored_at, reason, payload")
      .order("dismissed_at", { ascending: false })
      .limit(1000);
    setRows((data ?? []) as any as Row[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`intake-dismissals-${user.id}-${Math.random().toString(36).slice(2, 8)}`);
    ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "intake_dismissals" },
      () => refresh(),
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  // Build a dismissed set from the LATEST row per (kind,id).
  const dismissed: DismissedSet = useMemo(() => {
    const latest = new Map<string, Row>();
    for (const r of rows) {
      const k = keyFor(r.item_kind, r.item_id);
      const prev = latest.get(k);
      if (!prev || new Date(r.dismissed_at) > new Date(prev.dismissed_at)) {
        latest.set(k, r);
      }
    }
    const out = new Set<string>();
    for (const [k, r] of latest) {
      if (!r.restored_at) out.add(k);
    }
    return out;
  }, [rows]);

  const dismiss = useCallback(
    async (
      kind:
        | "message"
        | "file"
        | "field_note"
        | "capture_group"
        | "note"
        | "commitment"
        | "action"
        | "sherlock"
        | "audit",
      id: string,
      opts?: { reason?: string; payload?: any },
    ) => {
      if (!user) return;
      // Optimistic: append a synthetic row
      setRows((r) => [
        {
          id: `tmp-${Date.now()}`,
          item_kind: kind,
          item_id: id,
          dismissed_at: new Date().toISOString(),
          restored_at: null,
          reason: opts?.reason ?? null,
          payload: opts?.payload ?? {},
        } as Row,
        ...r,
      ]);
      await supabase.from("intake_dismissals" as any).insert({
        user_id: user.id,
        item_kind: kind,
        item_id: id,
        reason: opts?.reason ?? null,
        payload: opts?.payload ?? {},
      } as any);
      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: kind === "capture_group" ? "capture" : kind,
        entity_id: null,
        event: "intake.dismissed",
        payload: { kind, item_id: id, ...(opts?.payload ?? {}) },
      });
    },
    [user],
  );

  const restore = useCallback(
    async (kind: string, id: string) => {
      if (!user) return;
      await supabase
        .from("intake_dismissals" as any)
        .update({ restored_at: new Date().toISOString() } as any)
        .eq("user_id", user.id)
        .eq("item_kind", kind)
        .eq("item_id", id)
        .is("restored_at", null);
      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: kind === "capture_group" ? "capture" : kind,
        entity_id: null,
        event: "intake.restored",
        payload: { kind, item_id: id },
      });
      refresh();
    },
    [user, refresh],
  );

  return { dismissed, dismiss, restore, loading, refresh };
}
