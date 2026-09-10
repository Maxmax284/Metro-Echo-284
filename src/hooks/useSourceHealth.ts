// useSourceHealth — proof of life for the feeds Echo actually reads.
//
// Reads recorded facts only (last message, last sync, last reading) and hands
// them to the pure health model. It writes nothing and never claims a feed is
// alive without a recorded moment behind it.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { healthFor, type SourceHealth } from "@/lib/sourceHealth";

export function useSourceHealth(): { sources: SourceHealth[]; loading: boolean; refresh: () => void } {
  const { session } = useAuth();
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const uid = session?.user?.id ?? null;

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);

    const [tgLink, tgMsg, email, feeds, readings] = await Promise.all([
      supabase.from("telegram_chat_links").select("id").eq("user_id", uid).limit(1),
      supabase
        .from("telegram_messages")
        .select("created_at")
        .eq("user_id", uid)
        .eq("direction", "in")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.from("email_inbound_addresses").select("active, last_received_at").eq("user_id", uid).limit(1),
      supabase.from("calendar_feeds").select("active, last_synced_at, last_error").eq("user_id", uid),
      supabase
        .from("wearable_readings")
        .select("measured_at")
        .eq("user_id", uid)
        .order("measured_at", { ascending: false })
        .limit(1),
    ]);

    const out: SourceHealth[] = [];

    const linked = (tgLink.data ?? []).length > 0;
    out.push(
      healthFor({
        key: "telegram",
        label: "Telegram",
        what: "Messages and photos arrive as captures",
        conn: linked ? "connected" : "needs_setup",
        lastAt: tgMsg.data?.[0]?.created_at ?? null,
        expectEveryHours: null,
      }),
    );

    const mail = email.data?.[0];
    if (mail) {
      out.push(
        healthFor({
          key: "email",
          label: "Email",
          what: "Forwarded mail lands as a note",
          conn: mail.active ? "connected" : "off",
          lastAt: mail.last_received_at ?? null,
          expectEveryHours: null,
        }),
      );
    }

    const feedRows = feeds.data ?? [];
    if (feedRows.length > 0) {
      const broken = feedRows.filter((f) => f.last_error).length;
      const active = feedRows.filter((f) => f.active).length;
      const lastSync = feedRows
        .map((f) => f.last_synced_at)
        .filter(Boolean)
        .sort()
        .pop() as string | undefined;
      out.push(
        healthFor({
          key: "calendar",
          label: "Calendar",
          what: "Your meetings, read-only",
          conn: broken > 0 ? "attention" : active === 0 ? "off" : "connected",
          lastAt: lastSync ?? null,
          /* Feeds are checked hourly, so silence past two hours is late, not quiet. */
          expectEveryHours: 1,
        }),
      );
    }

    const lastReading = readings.data?.[0]?.measured_at ?? null;
    if (lastReading) {
      out.push(
        healthFor({
          key: "wearable",
          label: "Body signals",
          what: "Readings from your watch",
          conn: "connected",
          lastAt: lastReading,
          expectEveryHours: 12,
        }),
      );
    }

    setSources(out);
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    void load();
    // Refetch on an explicit refresh only; `load` itself is keyed to the user.
  }, [load, nonce]);

  return { sources, loading, refresh: () => setNonce((n) => n + 1) };
}
