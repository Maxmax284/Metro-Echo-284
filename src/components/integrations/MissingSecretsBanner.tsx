// Today's only connection notice — and it stays silent unless a connection that
// is switched on, or already in use, genuinely needs a person.
//
// An optional integration nobody ever turned on is "Available". It is not
// broken, so it never shows up here and never gets red treatment.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSecretsStatus } from "@/hooks/useSecretsStatus";
import { useSystemControls, type SystemControls } from "@/hooks/useSystemControls";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { needsYou } from "@/lib/reach";

export function MissingSecretsBanner() {
  const { session } = useAuth();
  const isOwner = useIsOwner();
  const { status, loading } = useSecretsStatus(!!session && isOwner === true);
  const { controls } = useSystemControls();
  const [telegramInUse, setTelegramInUse] = useState(false);

  useEffect(() => {
    if (!session || isOwner !== true) return;
    supabase
      .from("telegram_chat_links")
      .select("id")
      .eq("user_id", session.user.id)
      .limit(1)
      .then(({ data }) => setTelegramInUse((data ?? []).length > 0));
  }, [session, isOwner]);

  if (!session || isOwner !== true || loading) return null;

  const attention = INTEGRATIONS.filter((i) => i.bucket !== "deferred" && i.expectedSecrets.length > 0)
    .map((def) => ({
      def,
      missingSecrets: def.expectedSecrets.filter((name) => !status[name]?.present),
    }))
    .filter(({ def, missingSecrets }) =>
      needsYou({
        def,
        switchedOn: def.killSwitchKey && controls ? !!controls[def.killSwitchKey as keyof SystemControls] : null,
        inUse: def.key === "telegram" ? telegramInUse : false,
        missingSecrets,
      }),
    );

  if (attention.length === 0) return null;

  const names = attention.map((row) => row.def.name).join(" and ");

  return (
    <section className="mx-3 mb-2 rounded-md bg-destructive/10 px-3 py-2 ring-1 ring-destructive/30 md:mx-4">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12px] font-medium">
              {attention.length === 1
                ? `${names} is switched on but can't reach Echo yet.`
                : `${names} are switched on but can't reach Echo yet.`}
            </div>
            <Link
              to="/settings/integrations"
              className="inline-flex items-center gap-1 rounded-md bg-background/60 px-2 py-1 text-[11px] font-medium ring-1 ring-border/60 hover:ring-primary/50"
            >
              Fix it <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
