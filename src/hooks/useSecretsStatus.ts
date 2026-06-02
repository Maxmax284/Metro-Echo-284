import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type SecretStatus = Record<string, { present: boolean; allowed: boolean }>;

export function useSecretsStatus(enabled: boolean) {
  const { session } = useAuth();
  const [status, setStatus] = useState<SecretStatus>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !session) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    supabase.functions
      .invoke("secrets-status", { body: {} })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
          setStatus({});
        } else {
          setStatus((data?.secrets ?? {}) as SecretStatus);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, session]);

  return { status, loading, error };
}
