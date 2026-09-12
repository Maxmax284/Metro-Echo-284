import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSecretsStatus } from "@/hooks/useSecretsStatus";
import { INTEGRATIONS } from "@/lib/integrations/registry";

/**
 * Home-page banner: lists integrations that have missing webhook secrets and
 * deep-links to the matching card on /settings/integrations.
 * Owner-only. Hidden when everything is configured.
 */
export function MissingSecretsBanner() {
  const { session } = useAuth();
  const isOwner = useIsOwner();
  const { status, loading } = useSecretsStatus(!!session && isOwner === true);

  if (!session || isOwner !== true || loading) return null;

  const missing = INTEGRATIONS
    .filter((i) => i.bucket !== "deferred" && i.expectedSecrets.length > 0)
    .map((i) => ({
      def: i,
      missing: i.expectedSecrets.filter((name) => !status[name]?.present),
    }))
    .filter((row) => row.missing.length > 0);

  if (missing.length === 0) return null;

  return (
    <section className="mx-3 mb-2 rounded-md bg-destructive/10 px-3 py-2 ring-1 ring-destructive/30 md:mx-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12px] font-medium">
              {missing.length === 1
                ? "1 connection needs setup"
                : `${missing.length} connections need setup`}
            </div>
            <Link
              to="/settings/integrations"
              className="inline-flex items-center gap-1 rounded-md bg-background/60 px-2 py-1 text-[11px] font-medium ring-1 ring-border/60 hover:ring-primary/50"
            >
              Fix in Settings <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
