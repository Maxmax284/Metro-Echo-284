// useLifeDomains — the everyday-life layer, from recorded facts only.
//
// Reads this person's own rows (a calendar being read, a watch reading having
// arrived, a place having been recorded) and hands them to the shared registry.
// It writes nothing, and it never marks a domain live without a record behind it.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { lifeDomains, type LifeDomain } from "@/lib/streetSmart";

export function useLifeDomains(): { domains: LifeDomain[]; loading: boolean; refresh: () => void } {
  const { session } = useAuth();
  const [domains, setDomains] = useState<LifeDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const uid = session?.user?.id ?? null;

  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [feeds, body, place] = await Promise.all([
        supabase.from("calendar_feeds").select("id").eq("user_id", uid).limit(1),
        supabase.from("wearable_readings").select("id").eq("user_id", uid).limit(1),
        supabase.from("awareness_places").select("id").eq("user_id", uid).limit(1),
      ]);
      setDomains(
        lifeDomains({
          calendar: (feeds.data ?? []).length > 0,
          body: (body.data ?? []).length > 0,
          place: (place.data ?? []).length > 0,
          /* Public rates need no account, so the ability is real by construction.
             When the read itself fails, Echo says so on the answer, not here. */
          rates: true,
          /* These wait on credentials that do not exist yet. Never assumed. */
          bank: false,
          flights: false,
          whatsapp: false,
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  return { domains, loading, refresh: () => setNonce((n) => n + 1) };
}
