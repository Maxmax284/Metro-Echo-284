import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useIsOwner } from "@/hooks/useIsOwner";
import { KILL_SWITCHES, MODE_DESC, MODE_LABEL, UsageMode, useSystemControls } from "@/hooks/useSystemControls";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldAlert, Power } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { InstallVantaSection } from "@/components/settings/InstallVantaSection";
import { TimeRemindersSection } from "@/components/settings/TimeRemindersSection";
import { PushReadinessSection } from "@/components/settings/PushReadinessSection";
import { EcosystemSourcesPanel } from "@/components/settings/EcosystemSourcesPanel";
import { CostTelemetryPanel } from "@/components/settings/CostTelemetryPanel";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { SystemMap } from "@/components/tutorial/SystemMap";
import { FollowOneNoteDemo } from "@/components/tutorial/FollowOneNoteDemo";
import { IntakeCleanupSection } from "@/components/settings/IntakeCleanupSection";
import { VerdictDownloadCard } from "@/components/settings/VerdictDownloadCard";
import { OperatorProfileSection } from "@/components/settings/OperatorProfileSection";
import { RecapSettingsPanel } from "@/components/settings/RecapSettingsPanel";
import { DeviceSignalsSection } from "@/components/settings/DeviceSignalsSection";
import { RoomMotionSection } from "@/components/settings/RoomMotionSection";

const MODES: UsageMode[] = ["conservative", "balanced", "power", "custom", "manual", "lockdown"];

type UsageLog = {
  id: string; provider: string; feature: string; status: string;
  cache_hit: boolean; created_at: string; error_message: string | null;
};

type UsageLimit = {
  id: string; provider: string; feature: string;
  limit_per_minute: number | null; limit_per_hour: number | null;
  limit_per_day: number | null; limit_per_month: number | null;
  max_calls_per_task: number | null; enabled: boolean;
};

export default function Settings() {
  const { session } = useAuth();
  const isOwner = useIsOwner();
  const { startTutorial } = useTutorial();
  const { controls, loading, update } = useSystemControls();
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [limits, setLimits] = useState<UsageLimit[]>([]);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    if (!session || !isOwner) return;
    supabase.from("api_usage_logs")
      .select("id,provider,feature,status,cache_hit,created_at,error_message")
      .order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setLogs((data ?? []) as UsageLog[]));
    supabase.from("usage_limits")
      .select("id,provider,feature,limit_per_minute,limit_per_hour,limit_per_day,limit_per_month,max_calls_per_task,enabled")
      .order("provider", { ascending: true })
      .then(({ data }) => setLimits((data ?? []) as UsageLimit[]));
  }, [session, isOwner]);

  if (!session) {
    return <div className="p-8 text-sm text-muted-foreground">Sign in required.</div>;
  }
  if (isOwner === null || loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading control room…</div>;
  }
  if (!isOwner) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Owner-only area. You don't have access.</p>
      </div>
    );
  }
  if (!controls) return null;

  const lockdown = controls.global_usage_mode === "lockdown";

  const emergencyDisable = async () => {
    await update({ external_apis_enabled: false, global_usage_mode: "lockdown" });
    toast.success(vantaSay.lockdown());
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/" className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Control Room</h1>
          <p className="text-xs text-muted-foreground">Owner-only. Rate limits, kill switches, usage logs.</p>
        </div>
        <Button
          size="sm" variant="destructive"
          className="ml-auto gap-1"
          onClick={emergencyDisable}
          disabled={lockdown}
        >
          <Power className="h-3.5 w-3.5" />
          {lockdown ? "Locked down" : "Emergency disable"}
        </Button>
      </header>

      {lockdown && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 ring-1 ring-destructive/30">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="text-xs">
            <div className="font-medium text-destructive">Lockdown active</div>
            <div className="text-muted-foreground">No external API calls will run. Switch mode to resume.</div>
          </div>
        </div>
      )}

      <InstallVantaSection />

      <VerdictDownloadCard />
      <OperatorProfileSection />
      <IntakeCleanupSection />

      {/* How Vanta Works — replayable tutorial + visual system map. */}
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">How Vanta Works</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              The whole flow in plain English. Replay the first-run walkthrough any time.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11.5px]"
              onClick={startTutorial}
            >
              Replay tutorial
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11.5px]"
              onClick={() => setDemoOpen(true)}
            >
              Follow one note
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <SystemMap />
        </div>
      </section>

      <FollowOneNoteDemo open={demoOpen} onOpenChange={setDemoOpen} />


      <TimeRemindersSection />

      <RecapSettingsPanel />

      <DeviceSignalsSection />

      <PushReadinessSection />

      {/* Global mode */}
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <h2 className="text-sm font-semibold">Global usage mode</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Sets the overall posture for spending and background work.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          {MODES.map((m) => {
            const active = controls.global_usage_mode === m;
            return (
              <button
                key={m}
                onClick={() => update({ global_usage_mode: m })}
                className={cn(
                  "rounded-lg p-2.5 text-left text-xs ring-1 transition-colors",
                  active ? "bg-primary/15 text-foreground ring-primary/40" : "bg-background/40 ring-border/60 hover:bg-surface-elevated"
                )}
                >
                <div className="font-medium">{MODE_LABEL[m]}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{MODE_DESC[m]}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Kill switches */}
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <h2 className="text-sm font-semibold">Kill switches</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Disable providers and background work individually.</p>
        <ul className="mt-3 divide-y divide-border/40">
          {KILL_SWITCHES.map(({ key, label, hint }) => (
            <li key={key} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium">{label}</div>
                <div className="text-[11px] text-muted-foreground">{hint}</div>
              </div>
              <Switch
                checked={!!controls[key]}
                onCheckedChange={async (v) => {
                  try {
                    await update({ [key]: v } as any);
                    if (key === "serpapi_enabled") {
                      if (v) toast.success(vantaSay.serpapiResumed());
                      else toast(vantaSay.serpapiPaused());
                    }
                  } catch {
                    if (key === "serpapi_enabled") toast.error(vantaSay.couldntUpdate());
                  }
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Platform Integrations</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              GTH, CampCore, Telegram, Email, Calendar, Fenrir, WhatsApp. One place for status, doctrine, and kill switches.
            </p>
          </div>
          <Link
            to="/settings/integrations"
            className="shrink-0 rounded-md bg-primary/15 px-3 py-1.5 text-[11.5px] font-medium text-primary ring-1 ring-primary/30 hover:bg-primary/20"
          >
            Open →
          </Link>
        </div>
      </section>

      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Workspaces & branding</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              Create lanes, manage members, give each workspace its own short code and accent.
            </p>
          </div>
          <Link
            to="/settings/workspaces"
            className="shrink-0 rounded-md bg-primary/15 px-3 py-1.5 text-[11.5px] font-medium text-primary ring-1 ring-primary/30 hover:bg-primary/20"
          >
            Open →
          </Link>
        </div>
      </section>

      <EcosystemSourcesPanel />

      <CostTelemetryPanel />



      {/* Limits */}
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <h2 className="text-sm font-semibold">Per-feature limits</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Defaults are conservative. Limits are seeded as features come online.
        </p>
        {limits.length === 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">No custom limits yet.</p>
        ) : (
          <table className="mt-3 w-full text-[12px]">
            <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="py-1">Provider</th><th>Feature</th><th>Day</th><th>Month</th><th>Per task</th><th>Enabled</th></tr>
            </thead>
            <tbody>
              {limits.map((l) => (
                <tr key={l.id} className="border-t border-border/40">
                  <td className="py-1.5">{l.provider}</td>
                  <td>{l.feature}</td>
                  <td>{l.limit_per_day ?? "—"}</td>
                  <td>{l.limit_per_month ?? "—"}</td>
                  <td>{l.max_calls_per_task ?? "—"}</td>
                  <td>{l.enabled ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Logs */}
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <h2 className="text-sm font-semibold">Recent API calls</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">Last 50 attempts across all providers.</p>
        {logs.length === 0 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">No calls recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-md bg-background/40 px-2 py-1.5 text-[11.5px] ring-1 ring-border/40">
                <span className="font-mono text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</span>
                <span className="truncate">{l.provider} · {l.feature}</span>
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                  l.status === "success" && "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
                  l.status === "cached" && "bg-primary/15 text-primary ring-primary/30",
                  (l.status === "blocked" || l.status === "rate_limited" || l.status === "disabled" || l.status === "over_budget") && "bg-amber-500/15 text-amber-300 ring-amber-500/30",
                  l.status === "failed" && "bg-destructive/15 text-destructive ring-destructive/30",
                )}>
                  {l.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
