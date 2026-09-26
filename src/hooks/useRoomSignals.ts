import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useEnvironmentEdge } from "@/hooks/useEnvironmentEdge";
import { deriveRoomSignals, discoveryKey, discoveryWasSeen, markDiscoverySeen, type RoomSignal } from "@/lib/roomSignals";
import type { RoomKey } from "@/lib/navigation";

type NudgeRow = Parameters<typeof deriveRoomSignals>[0]["nudges"][number];
type ActionRow = Parameters<typeof deriveRoomSignals>[0]["actions"][number];

export function useRoomSignals() {
  const { user } = useAuth();
  const { applyScope, key: scopeKey, matches } = useScope();
  const { edge, sources } = useEnvironmentEdge();
  const [nudges, setNudges] = useState<NudgeRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [completion, setCompletion] = useState<{ id: string; label: string; fresh: boolean } | null>(null);
  const [bubble, setBubble] = useState<{ room: RoomKey; text: string; key: string } | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const since = new Date(Date.now() - 2 * 60_000).toISOString();
    const [n, a, r] = await Promise.all([
      applyScope(supabase.from("nudges").select("id,kind,title,priority,related_entity_type,related_entity_id,dedupe_key,status"))
        .eq("status", "pending").order("priority", { ascending: false }).limit(8),
      applyScope(supabase.from("actions").select("id,title,status"))
        .in("status", ["staged", "proposed"]).order("updated_at", { ascending: false }).limit(8),
      applyScope(supabase.from("audit_log").select("id,event,entity_id,created_at"))
        .gte("created_at", since).order("created_at", { ascending: false }).limit(1),
    ]);
    setNudges((n.data ?? []) as NudgeRow[]);
    setActions((a.data ?? []) as ActionRow[]);
    const receipt = r.data?.[0];
    setCompletion(receipt ? { id: receipt.entity_id ?? receipt.id, label: "A new receipt is ready", fresh: true } : null);
  }, [user, scopeKey, applyScope]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 250); };
    const scoped = (payload: { new?: { organization_id?: string | null }; old?: { organization_id?: string | null } }) => {
      if (matches(payload.new) || matches(payload.old)) refresh();
    };
    const channel = supabase.channel(`room-signals-${scopeKey}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nudges" }, scoped)
      .on("postgres_changes", { event: "*", schema: "public", table: "actions" }, scoped)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, scoped)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "deliveries" }, refresh)
      .subscribe();
    window.addEventListener("metro:attention-changed", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("metro:attention-changed", refresh);
      void supabase.removeChannel(channel);
    };
  }, [user, scopeKey, matches, load]);

  const contextLabel = edge.where
    ? `${edge.where} context is ready with Echo`
    : sources.length > 0 ? "Context is ready with Echo" : null;
  const signals = useMemo(() => deriveRoomSignals({
    nudges,
    actions,
    askContext: contextLabel ? { label: contextLabel, fresh: true } : null,
    completion,
  }), [nudges, actions, contextLabel, completion]);

  useEffect(() => {
    if (!contextLabel || typeof window === "undefined") return;
    const identity = edge.where ?? sources.join("|");
    const key = discoveryKey("ask-context", identity);
    if (!discoveryWasSeen(window.localStorage, key)) setBubble({ room: "ask", text: contextLabel, key });
  }, [contextLabel, edge.where, sources]);

  useEffect(() => {
    if (!bubble) return;
    const timer = window.setTimeout(() => {
      markDiscoverySeen(window.localStorage, bubble.key);
      setBubble(null);
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [bubble]);

  useEffect(() => {
    if (!completion) return;
    const timer = window.setTimeout(() => setCompletion(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [completion?.id]);

  const dismissBubble = useCallback(() => {
    if (bubble && typeof window !== "undefined") markDiscoverySeen(window.localStorage, bubble.key);
    setBubble(null);
  }, [bubble]);

  const acknowledge = useCallback(async (signal: RoomSignal) => {
    dismissBubble();
    if (!user || !signal.dedupeKey) return;
    const nudge = nudges.find((row) => row.dedupe_key === signal.dedupeKey);
    if (nudge) await supabase.from("nudges").update({ status: "seen" }).eq("id", nudge.id).eq("user_id", user.id);
    await supabase.from("deliveries").update({ acted_status: "seen" }).eq("user_id", user.id).eq("dedupe_key", `nudge:${signal.dedupeKey}`);
    setNudges((rows) => rows.filter((row) => row.dedupe_key !== signal.dedupeKey));
    window.dispatchEvent(new Event("metro:attention-changed"));
  }, [dismissBubble, nudges, user]);

  return { signals, bubble, dismissBubble, acknowledge, refresh: load };
}