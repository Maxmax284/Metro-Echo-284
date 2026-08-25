import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type SecretStatus = Record<string, { present: boolean; allowed: boolean }>;

/**
 * Fetch presence of allowlisted secrets. Never throws, and never blanks the
 * screen: an expired session is refreshed once and retried, and anything left
 * over resolves to "unknown" (empty status) with a soft message.
 */
async function fetchStatus(): Promise<{ status: SecretStatus; error: string | null }> {
  // Touch the session first so supabase-js refreshes an expired access token
  // before we sign the function call with it.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) return { status: {}, error: "Sign in again to check this." };

  const call = () => supabase.functions.invoke("secrets-status", { body: {} });

  let { data, error } = await call();
  if (error) {
    // One retry after an explicit refresh covers a token that expired mid-flight.
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed?.session) {
      const retry = await call();
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) return { status: {}, error: "Couldn't check the keys right now." };
  return { status: (data?.secrets ?? {}) as SecretStatus, error: null };
}

export function useSecretsStatus(enabled: boolean) {
  const { session } = useAuth();
  const [status, setStatus] = useState<SecretStatus>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !session) return;
    setLoading(true);
    setError(null);
    const result = await fetchStatus();
    setStatus(result.status);
    setError(result.error);
    setLoading(false);
  }, [enabled, session]);

  useEffect(() => {
    if (!enabled || !session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStatus()
      .then((result) => {
        if (cancelled) return;
        setStatus(result.status);
        setError(result.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, session]);

  return { status, loading, error, refresh };
}
