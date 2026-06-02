import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type ExternalPlatformDiagnostic = {
  source_platform: string;
  display_name: string;
  webhook_configured: boolean;
  secret_fingerprint: string | null;
  secret_storage_source: "configured" | "wrong_source" | "missing";
  expected_secret_name: string;
  allowed_event_types: string[];
  enabled: boolean;
  last_received_at: string | null;
  last_accepted_at: string | null;
  last_rejected_at: string | null;
  last_rejection_reason: string | null;
  last_event_type: string | null;
  last_idempotency_key: string | null;
  signature_status: "unknown" | "missing" | "valid" | "invalid" | "not_required";
  last_health_status: "unknown" | "healthy" | "warning" | "error" | "disabled";
};

export function useExternalPlatformDiagnostics(enabled: boolean) {
  const { session } = useAuth();
  const [diagnostics, setDiagnostics] = useState<Record<string, ExternalPlatformDiagnostic>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !session) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke("external-platform-diagnostics", { body: {} });
    if (error || data?.error) {
      setError(data?.error ?? error?.message ?? "Diagnostics unavailable");
      setDiagnostics({});
    } else {
      const rows = (data?.platforms ?? []) as ExternalPlatformDiagnostic[];
      setDiagnostics(Object.fromEntries(rows.map((row) => [row.source_platform, row])));
    }
    setLoading(false);
  }, [enabled, session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { diagnostics, loading, error, refresh };
}