// PostureSection — tell Vanta what kind of moment this is.
//
// Manual only. Vanta never switches a posture on by itself, and a posture is a
// courtesy: it holds ordinary notes, never anything critical.
import { useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { POSTURE_LABEL, POSTURES, postureHoldsNoise, type Posture } from "@/lib/awareness";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { DEVICE_LABEL } from "@/lib/deviceClass";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { vantaToast } from "@/lib/vantaVoice";

const HOURS = [
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "3 hours", ms: 3 * 60 * 60 * 1000 },
  { label: "Until I clear it", ms: 0 },
];

export function PostureSection() {
  const { context, postureUntil, setPosture, loading } = useVantaContext();
  const [saving, setSaving] = useState<string | null>(null);
  const [window, setWindow] = useState(HOURS[1]);

  const current = context.posture ?? null;

  const choose = async (p: Posture | null) => {
    setSaving(p ?? "clear");
    const until = p && window.ms ? new Date(Date.now() + window.ms).toISOString() : null;
    await setPosture(p, until);
    setSaving(null);
    vantaToast.info({
      title: p ? `Posture set to ${POSTURE_LABEL[p]}.` : "Posture cleared.",
      description:
        p && postureHoldsNoise(p)
          ? "Ordinary notes will hold. Anything critical still reaches you."
          : "Vanta speaks as normal.",
    });
  };

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <Activity className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">What kind of moment is this?</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Set it by hand and it travels with you — {DEVICE_LABEL[context.deviceClass ?? "unknown"]} right now.
            Ordinary notes hold; anything critical still comes through.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {HOURS.map((h) => (
          <button
            key={h.label}
            type="button"
            onClick={() => setWindow(h)}
            className={cn(
              "vanta-focus rounded-full px-2.5 py-1 text-[11px] ring-1 transition-colors",
              window.label === h.label
                ? "bg-primary/15 text-primary ring-primary/40"
                : "bg-muted/20 text-muted-foreground ring-border/50",
            )}
          >
            {h.label}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {POSTURES.map((p) => {
          const active = current === p;
          return (
            <button
              key={p}
              type="button"
              disabled={loading || saving !== null}
              onClick={() => choose(active ? null : p)}
              className={cn(
                "vanta-focus flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[12.5px] ring-1 transition-colors",
                active
                  ? "bg-primary/15 font-medium text-primary ring-primary/40"
                  : "bg-muted/20 ring-border/40 hover:bg-muted/30",
              )}
            >
              <span className="truncate">{POSTURE_LABEL[p]}</span>
              {saving === p ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : postureHoldsNoise(p) ? (
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">holds</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted-foreground">
          {current
            ? postureUntil
              ? `${POSTURE_LABEL[current]} until ${new Date(postureUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
              : `${POSTURE_LABEL[current]} until you clear it.`
            : "No posture set. Vanta speaks as normal."}
        </p>
        {current && (
          <Button variant="ghost" size="sm" onClick={() => choose(null)} disabled={saving !== null}>
            Clear
          </Button>
        )}
      </div>
    </section>
  );
}
