import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { keyFor, type AttachedSet } from "@/lib/intakeLifecycle";

/**
 * One-shot read of every project_items row visible to the user, exposed as a
 * set of `${kind}:${id}` keys. Used to demote already-attached intake from
 * Command Center / Inbox Active views. Realtime-subscribed.
 *
 * project_items.item_type values: capture | note | file | finding | commitment | action
 */
export function useAttachedItemIds() {
  const { user } = useAuth();
  const [set, setSet] = useState<AttachedSet>(new Set());

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("project_items")
      .select("item_type, item_id")
      .limit(5000);
    const next = new Set<string>();
    for (const r of (data ?? []) as { item_type: string; item_id: string }[]) {
      // Map project_items.item_type "capture" → matches both "message" and
      // "field_note" lanes; we add both forms so classifier finds it.
      next.add(keyFor(r.item_type, r.item_id));
      if (r.item_type === "capture") {
        next.add(keyFor("message", r.item_id));
        next.add(keyFor("field_note", r.item_id));
      }
    }
    setSet(next);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("attached-items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_items" },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  return { attached: set, refresh };
}
