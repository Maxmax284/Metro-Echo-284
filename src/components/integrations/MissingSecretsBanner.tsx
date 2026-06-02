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
    <section className="mx-3 mb-2 rounded-xl bg-warning/10 p-3 ring-1 ring-warning/40 md:mx-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12.5px] font-medium">
              {missing.length === 1
                ? "1 integration needs a secret"
                : `${missing.length} integrations need secrets`}
            </div>
            <Link
              to="/settings/integrations"
              className="inline-flex items-center gap-1 rounded-md bg-background/60 px-2 py-1 text-[11px] font-medium ring-1 ring-border/60 hover:ring-primary/50"
            >
              Open Integrations <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="mt-2 space-y-1">
            {missing.map(({ def, missing: names }) => (
              <li key={def.key} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                <Link
                  to={`/settings/integrations#integration-${def.key}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {def.name}
                </Link>
                <span className="text-muted-foreground">missing:</span>
                {names.map((n) => (
                  <code
                    key={n}
                    className="rounded bg-background/60 px-1 py-0.5 text-[10.5px] ring-1 ring-border/40"
                  >
                    {n}
                  </code>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
