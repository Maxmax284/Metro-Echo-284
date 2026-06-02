import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSystemControls } from "@/hooks/useSystemControls";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import {
  AdapterTemplateCard,
  CallbackRegistryTable,
  EventRegistryTable,
} from "@/components/integrations/RegistryTables";
import type { RuntimeSignals } from "@/lib/integrations/status";
import { useSecretsStatus } from "@/hooks/useSecretsStatus";
import { useExternalPlatformDiagnostics } from "@/hooks/useExternalPlatformDiagnostics";

export default function IntegrationsSettings() {
  const { session } = useAuth();
  const isOwner = useIsOwner();
  const { controls, loading } = useSystemControls();
  const [signals, setSignals] = useState<RuntimeSignals>({});
  const { status: secretStatus, refresh: refreshSecrets } = useSecretsStatus(!!session);
  const { diagnostics, refresh: refreshDiagnostics } = useExternalPlatformDiagnostics(!!session && isOwner === true);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const [tg, em] = await Promise.all([
        supabase.from("telegram_chat_links").select("id").eq("user_id", session.user.id).limit(1),
        supabase.from("email_inbound_addresses").select("id").eq("user_id", session.user.id).eq("active", true).limit(1),
      ]);
      setSignals({
        telegramLinked: (tg.data ?? []).length > 0,
        emailLinked: (em.data ?? []).length > 0,
      });
    })();
  }, [session]);

  // Scroll to #integration-<key> on first render and after secret status loads.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.slice(1);
    const tries = [50, 200, 600, 1200];
    tries.forEach((ms) =>
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, ms),
    );
  }, [secretStatus]);


  if (!session) return <div className="p-8 text-sm text-muted-foreground">Sign in required.</div>;
  if (isOwner === null || loading) return <div className="p-8 text-sm text-muted-foreground">Loading integrations…</div>;
  if (!isOwner) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Integrations</h1>
        <p className="mt-2 text-sm text-muted-foreground">Owner-only area. You don't have access.</p>
      </div>
    );
  }

  const connected = INTEGRATIONS.filter((i) => i.bucket === "connected");
  const planned = INTEGRATIONS.filter((i) => i.bucket === "planned");
  const deferred = INTEGRATIONS.filter((i) => i.bucket === "deferred");
  const refreshIntegrationState = async () => {
    await Promise.all([refreshSecrets(), refreshDiagnostics()]);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Platform Integrations</h1>
          <p className="text-xs text-muted-foreground">
            Manage how Vanta receives signals from other systems and what it is allowed to draft.
          </p>
        </div>
      </header>

      <section className="mb-6 rounded-xl bg-primary/10 p-4 ring-1 ring-primary/30">
        <div className="flex items-start gap-2">
          <Radio className="mt-0.5 h-4 w-4 text-primary" />
          <div className="text-[12.5px]">
            <div className="font-medium">Signals land. Vanta drafts. Humans approve.</div>
            <div className="mt-0.5 text-muted-foreground">
              Each source has its own kill switch and audit trail. Nothing executes on its own. Each platform stays sovereign.
            </div>
          </div>
        </div>
      </section>

      {controls?.global_usage_mode === "lockdown" && (
        <div className="mb-6 rounded-lg bg-destructive/10 p-3 text-[12px] ring-1 ring-destructive/30">
          Lockdown is on. New external signals are being ignored. Adjust in Control Room.
        </div>
      )}

      <SectionHeader title="Connected now" subtitle="Live or partially live sources." />
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {connected.map((def) => (
          <IntegrationCard key={def.key} def={def} signals={signals} secretStatus={secretStatus} diagnostic={def.sourcePlatform ? diagnostics[def.sourcePlatform] : undefined} onSecretsChanged={refreshIntegrationState} />
        ))}
      </div>

      <SectionHeader title="Planned next" subtitle="Configured or staged. Not live until you flip the switch and the adapter ships." />
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {planned.map((def) => (
          <IntegrationCard key={def.key} def={def} signals={signals} secretStatus={secretStatus} diagnostic={def.sourcePlatform ? diagnostics[def.sourcePlatform] : undefined} onSecretsChanged={refreshIntegrationState} />
        ))}
      </div>

      <SectionHeader title="Deferred" subtitle="On the roadmap. Not now." />
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {deferred.map((def) => (
          <IntegrationCard key={def.key} def={def} signals={signals} secretStatus={secretStatus} diagnostic={def.sourcePlatform ? diagnostics[def.sourcePlatform] : undefined} onSecretsChanged={refreshIntegrationState} />
        ))}
      </div>

      <div className="mb-6">
        <EventRegistryTable />
      </div>
      <div className="mb-6">
        <CallbackRegistryTable />
      </div>
      <div className="mb-6">
        <AdapterTemplateCard />
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Provider kill switches and rate limits live in <Link to="/settings" className="underline">Control Room</Link>.
      </p>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-[12px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}
