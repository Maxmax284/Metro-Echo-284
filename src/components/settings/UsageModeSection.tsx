import { KILL_SWITCHES, MODE_DESC, MODE_LABEL, UsageMode, useSystemControls } from "@/hooks/useSystemControls";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";

const MODES: UsageMode[] = ["conservative", "balanced", "power", "custom", "manual", "lockdown"];

/** Overall spending posture plus the individual kill switches. */
export function UsageModeSection() {
  const { controls, loading, update } = useSystemControls();
  if (loading || !controls) return null;

  return (
    <>
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <h2 className="text-sm font-semibold">Global usage mode</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Sets the overall posture for spending and background work.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
          {MODES.map((m) => {
            const active = controls.global_usage_mode === m;
            return (
              <button
                key={m}
                onClick={() => update({ global_usage_mode: m })}
                className={cn(
                  "vanta-focus rounded-lg p-2.5 text-left text-xs ring-1 transition-colors",
                  active
                    ? "bg-primary/15 text-foreground ring-primary/40"
                    : "bg-background/40 ring-border/60 hover:bg-surface-elevated",
                )}
              >
                <div className="font-medium">{MODE_LABEL[m]}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{MODE_DESC[m]}</div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <h2 className="text-sm font-semibold">Kill switches</h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Disable providers and background work individually.
        </p>
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
    </>
  );
}
