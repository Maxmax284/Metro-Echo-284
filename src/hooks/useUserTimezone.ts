import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const browserTz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
};

/**
 * Returns the user's effective timezone. Reads profiles.timezone if set, falls
 * back to the browser timezone. Also exposes the browser TZ for drift banners.
 */
export function useUserTimezone() {
  const { user } = useAuth();
  const [stored, setStored] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const browser = browserTz();

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle()
      .then(({ data }) => { setStored(data?.timezone ?? null); setLoading(false); });
  }, [user]);

  return {
    timezone: stored || browser,
    storedTimezone: stored,
    browserTimezone: browser,
    drifted: !!stored && stored !== browser,
    loading,
  };
}
