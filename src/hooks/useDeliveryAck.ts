// useDeliveryAck — a tapped notification action lands here, not in the service
// worker.
//
// Doctrine: nothing consequential is ever executed from a notification. The
// worker only carries a status in the URL; this hook applies that status to the
// same underlying situation, with the signed-in session standing behind it, and
// then cleans the URL so a refresh cannot replay it.
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const ALLOWED = ["seen", "snoozed", "acted", "muted"] as const;
type Ack = (typeof ALLOWED)[number];

/** Notification statuses map onto the nudge lifecycle that already exists. */
const NUDGE_STATUS: Record<Ack, "seen" | "dismissed" | "acted"> = {
  seen: "seen",
  snoozed: "seen",
  acted: "acted",
  muted: "dismissed",
};

export function useDeliveryAck(): void {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const key = params.get("ack");
    const raw = params.get("as");
    if (!key || !raw) return;
    if (!(ALLOWED as readonly string[]).includes(raw)) return;
    const as = raw as Ack;

    void (async () => {
      const { data: rows } = await supabase
        .from("deliveries")
        .select("id, situation_kind, situation_id")
        .eq("user_id", user.id)
        .eq("dedupe_key", key)
        .order("sent_at", { ascending: false })
        .limit(1);
      const row = rows?.[0];
      if (row) {
        await supabase.from("deliveries").update({ acted_status: as }).eq("id", row.id);
        /* The status belongs to the situation, not to the notification. */
        if (row.situation_kind?.startsWith("nudge") && row.situation_id) {
          await supabase
            .from("nudges")
            .update({ status: NUDGE_STATUS[as] })
            .eq("id", row.situation_id)
            .eq("user_id", user.id);
        }
        window.dispatchEvent(new Event("metro:attention-changed"));
      }

      params.delete("ack");
      params.delete("as");
      const rest = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    })();
  }, [user]);
}
