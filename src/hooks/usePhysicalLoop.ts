// usePhysicalLoop — the records behind the paper-and-phone panel.
//
// Every query is scope-filtered. Nothing is inferred here: the hook hands real
// rows to `buildPromiseWalk`, which decides what can honestly be claimed.
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import {
  buildPromiseWalk,
  describeSweep,
  walkProgress,
  type LoopPromise,
  type LoopStep,
  type SweepReading,
} from "@/lib/physicalLoop";

export interface PhysicalLoop {
  linked: boolean;
  chatLabel: string | null;
  lastMessageAt: string | null;
  sweep: SweepReading | null;
  sweepLine: string;
  pendingPages: number;
  readPages: number;
  promise: LoopPromise | null;
  steps: LoopStep[];
  progress: { done: number; total: number };
}

const EMPTY: PhysicalLoop = {
  linked: false,
  chatLabel: null,
  lastMessageAt: null,
  sweep: null,
  sweepLine: "",
  pendingPages: 0,
  readPages: 0,
  promise: null,
  steps: [],
  progress: { done: 0, total: 5 },
};

function ago(at: string | null | undefined): string | null {
  if (!at) return null;
  try {
    return `${formatDistanceToNow(new Date(at))} ago`;
  } catch {
    return null;
  }
}

export function usePhysicalLoop(): {
  loop: PhysicalLoop;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const { applyScope, key } = useScope();
  const [loop, setLoop] = useState<PhysicalLoop>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [chat, inbound, sweepRow, pending, done, landed] = await Promise.all([
        supabase.from("user_channel_links")
          .select("external_channel_id, status, last_seen_at, metadata")
          .eq("channel", "telegram").eq("status", "active")
          .order("last_seen_at", { ascending: false })
          .limit(1),
        applyScope(supabase.from("audit_log").select("created_at"))
          .eq("event", "telegram.message_in")
          .order("created_at", { ascending: false })
          .limit(1),
        applyScope(supabase.from("audit_log").select("created_at, payload"))
          .eq("event", "physical.sweep")
          .order("created_at", { ascending: false })
          .limit(1),
        applyScope(supabase.from("ingested_files").select("id", { count: "exact", head: true }))
          .like("mime_type", "image/%")
          .is("note_id", null),
        applyScope(supabase.from("ingested_files").select("id", { count: "exact", head: true }))
          .like("mime_type", "image/%")
          .not("note_id", "is", null),
        applyScope(supabase.from("audit_log").select("created_at, entity_id, payload"))
          .in("event", ["capture.routed", "reminder.scheduled"])
          .eq("payload->>source", "telegram")
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      /* The most recent promise that actually arrived from the phone. */
      let promiseId: string | null = null;
      for (const row of (landed.data ?? []) as { entity_id: string | null; payload: any }[]) {
        const fromPayload = row.payload?.commitment_id;
        const dest = row.payload?.destination;
        if (typeof fromPayload === "string") { promiseId = fromPayload; break; }
        if (dest === undefined && row.entity_id) { promiseId = row.entity_id; break; }
      }

      let promise: LoopPromise | null = null;
      let reminderSentAt: string | null = null;
      let closedFromChat = false;
      if (promiseId) {
        const [{ data: comm }, reminded, closed] = await Promise.all([
          supabase.from("commitments")
            .select("id, summary, status").eq("id", promiseId).maybeSingle(),
          supabase.from("audit_log").select("created_at")
            .eq("entity_id", promiseId).eq("event", "reminder.telegram_sent")
            .order("created_at", { ascending: false }).limit(1),
          supabase.from("audit_log").select("created_at, payload")
            .eq("entity_id", promiseId).eq("event", "commitment.completed")
            .order("created_at", { ascending: false }).limit(1),
        ]);
        if (comm) promise = { id: comm.id, summary: comm.summary, status: comm.status };
        reminderSentAt = ago((reminded.data ?? [])[0]?.created_at ?? null);
        const closeRow = (closed.data ?? [])[0] as { payload: any } | undefined;
        closedFromChat = (closeRow?.payload?.source ?? "") === "telegram_callback";
      }

      const chatRow = (chat.data ?? [])[0] as
        | { external_channel_id: string; last_seen_at: string | null; metadata: any }
        | undefined;
      const sweepPayload = ((sweepRow.data ?? [])[0] ?? null) as
        | { created_at: string; payload: any }
        | null;
      const sweep: SweepReading | null = sweepPayload
        ? {
            at: sweepPayload.created_at,
            read: Number(sweepPayload.payload?.read ?? 0),
            unreadable: Number(sweepPayload.payload?.unreadable ?? 0),
            scanned: Number(sweepPayload.payload?.scanned ?? 0),
          }
        : null;
      const pendingPages = (pending as any)?.count ?? 0;

      const facts = {
        linked: !!chatRow,
        lastMessageAt: ago(((inbound.data ?? [])[0] as any)?.created_at ?? null),
        promise,
        reminderSentAt,
        closedFromChat,
      };
      const steps = buildPromiseWalk(facts);

      setLoop({
        linked: facts.linked,
        chatLabel: chatRow?.metadata?.username ? `@${chatRow.metadata.username}` : null,
        lastMessageAt: facts.lastMessageAt,
        sweep,
        sweepLine: describeSweep(sweep, pendingPages),
        pendingPages,
        readPages: (done as any)?.count ?? 0,
        promise,
        steps,
        progress: walkProgress(steps),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The loop could not be read.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, key, nonce]);

  return { loop, loading, error, refresh: () => setNonce((n) => n + 1) };
}
