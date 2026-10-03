// useArrivals — everything that landed and has not been filed, read through the
// same lane rules Today uses. It writes nothing and decides nothing: the lane
// says what deserves attention, this hook only fetches the facts.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { readMessageLane, heldBackLine, type Arrival, type LaneItem } from "@/lib/messageLane";

export type ArrivalsRead = {
  items: LaneItem[];
  held: string | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
};

export function useArrivals(): ArrivalsRead {
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [items, setItems] = useState<LaneItem[]>([]);
  const [held, setHeld] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const build = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    setError(false);

    const [files, messages] = await Promise.all([
      applyScope(
        supabase.from("ingested_files").select("id, filename, created_at, source, mime_type, suggested_summary"),
      )
        .in("review_status", ["new", "needs_review", "suggested"])
        .order("created_at", { ascending: false })
        .limit(20),
      applyScope(supabase.from("messages").select("id, content, created_at, metadata"))
        .eq("role", "user")
        .eq("metadata->>needs_review", "true")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    if (files.error && messages.error) {
      setError(true);
      setItems([]);
      setHeld(null);
      setLoading(false);
      return;
    }

    const candidates: Arrival[] = [];
    for (const f of files.data ?? []) {
      const mime = (f as any).mime_type as string | null;
      candidates.push({
        id: f.id,
        text: (f as any).suggested_summary || f.filename || "A capture",
        at: f.created_at,
        channel: f.source === "telegram" ? "telegram" : "upload",
        where: f.source === "telegram" ? "Telegram" : null,
        unfiled: true,
        attachment: f.filename ?? null,
        heardOrRead: mime?.startsWith("audio") ? "heard" : mime ? "read" : "typed",
      });
    }
    for (const m of messages.data ?? []) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      const src = typeof meta.source === "string" ? meta.source : null;
      candidates.push({
        id: m.id,
        text: (m.content ?? "").replace(/\s+/g, " ").trim() || "A message",
        at: m.created_at,
        channel: src === "telegram" ? "telegram" : src === "email" ? "email" : "other",
        where: src === "telegram" ? "Telegram" : src,
        from: typeof meta.from_name === "string" ? (meta.from_name as string) : null,
        unfiled: true,
      });
    }

    /* Larger budget than Today: this room is where arrivals are meant to be
       looked at, so holding them back here would just hide them. */
    const lane = readMessageLane(candidates, { budget: 8 });
    setItems(lane);
    setHeld(heldBackLine(lane));
    setLoading(false);
  }, [session?.user?.id, applyScope, scopeKey]);

  useEffect(() => {
    void build();
  }, [build]);

  return { items, held, loading, error, refresh: build };
}
