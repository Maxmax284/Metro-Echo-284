// useEchoAbilities — reach, from recorded facts only.
//
// Reads this person's own connection rows and watch count, then hands them to
// the shared pure module so the panel, Ask and Telegram all describe the same
// powers. It writes nothing and never claims a power without a record behind it.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { echoAbilities, type Ability } from "@/lib/echoAbilities";

export function useEchoAbilities(): { abilities: Ability[]; loading: boolean; refresh: () => void } {
  const { session } = useAuth();
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const uid = session?.user?.id ?? null;

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [google, tg, watches] = await Promise.all([
        supabase.functions.invoke("google-account-status").then((r) => r.data as
          | { services?: Array<{ service: string; connected?: boolean; working?: boolean }> }
          | null)
          .catch(() => null),
        supabase.from("telegram_chat_links").select("id").eq("user_id", uid).limit(1),
        supabase
          .from("watches")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("state", "active"),
      ]);

      const svc = (name: string) => {
        const row = google?.services?.find((s) => s.service === name);
        return !!row && (row.working === true || row.connected === true);
      };

      setAbilities(
        echoAbilities({
          calendar: svc("google_calendar"),
          mail: svc("google_mail"),
          files: svc("google_drive"),
          telegram: (tg.data ?? []).length > 0,
          /* Search keys live on the server; the panel does not probe them, so
             the row states the shape of the ability and Ask states the key. */
          web_search: true,
          watching: watches.count ?? 0,
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  return { abilities, loading, refresh: () => setNonce((n) => n + 1) };
}
