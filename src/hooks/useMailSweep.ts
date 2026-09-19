// useMailSweep — the switch that lets Echo watch your mail for bookings.
//
// Off until the person turns it on. The row is created on first use, so an
// account that never asked for this has nothing on record at all.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type MailSweepState = {
  enabled: boolean;
  lastSweptAt: string | null;
  lastError: string | null;
  /** Bookings read out of mail in the last week, from recorded receipts. */
  found7d: number;
};

const EMPTY: MailSweepState = { enabled: false, lastSweptAt: null, lastError: null, found7d: 0 };

export function useMailSweep() {
  const { session } = useAuth();
  const [state, setState] = useState<MailSweepState>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [{ data: row }, { data: events }] = await Promise.all([
      supabase
        .from("mail_sync_state")
        .select("enabled, last_swept_at, last_error")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("audit_log")
        .select("id")
        .eq("user_id", userId)
        .eq("event", "mail.swept")
        .gte("created_at", since)
        .limit(200),
    ]);
    setState({
      enabled: row?.enabled === true,
      lastSweptAt: row?.last_swept_at ?? null,
      lastError: row?.last_error ?? null,
      found7d: (events ?? []).length,
    });
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const setEnabled = useCallback(async (enabled: boolean) => {
    const userId = session?.user.id;
    if (!userId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("mail_sync_state")
        .upsert({ user_id: userId, enabled }, { onConflict: "user_id" });
      if (error) throw error;
      setState((s) => ({ ...s, enabled }));
      /* Switching it on reads once straight away, so the first answer is not an
         hour away. */
      if (enabled) {
        await supabase.functions.invoke("gmail-sweep", { body: { user_id: userId } }).catch(() => null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }, [session, load]);

  return { ...state, busy, setEnabled, reload: load };
}
