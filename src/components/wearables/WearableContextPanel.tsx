// WearableContextPanel — what a watch is allowed to say, and what it can't.
//
// Reads only. It shows the body Echo is speaking through, the posture you set
// by hand, and which senses you switched on. A watch can feed Echo context;
// it can never approve or run anything, and it never touches messaging.
import { Watch } from "lucide-react";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { DEVICE_LABEL } from "@/lib/deviceClass";
import { POSTURE_LABEL, SENSORS, SENSOR_LABEL, type SensorKey } from "@/lib/awareness";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { LoadingState } from "@/components/ui/state-views";

export function WearableContextPanel() {
  const { context, postureUntil, loading } = useVantaContext();
  const { prefs, loading: prefsLoading } = useUserPreferences();
  const consent = (prefs.sensor_consent ?? {}) as Partial<Record<SensorKey, boolean>>;
  const on = SENSORS.filter((s) => consent[s] === true);

  if (loading || prefsLoading) return <LoadingState label="Reading this body…" />;

  const posture = context.posture ? POSTURE_LABEL[context.posture] : null;

  return (
    <section className="vanta-card p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <Watch className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-tight">The watch feed</h2>
          <p className="text-[12px] text-muted-foreground">
            Context in. Never approval, never execution, never messaging.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <div className="vanta-inset px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <MachineLabel className="text-foreground/70">This body</MachineLabel>
            <MachineText className="text-[10px] text-muted-foreground">
              {DEVICE_LABEL[context.deviceClass ?? "unknown"]}
            </MachineText>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
            Echo knows the kind of screen it is on, nothing more. A watch counts as its own body:
            it gets the short version and the plain version.
          </p>
        </div>

        <div className="vanta-inset px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <MachineLabel className="text-foreground/70">Posture</MachineLabel>
            <MachineText className="text-[10px] text-muted-foreground">
              {posture ?? "not set"}
            </MachineText>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
            {posture
              ? `You told Echo you're in "${posture}"${postureUntil ? ", with an end time set" : ", until you clear it"}. Ordinary notes wait. Anything genuinely time-critical still comes through.`
              : "You haven't told Echo what kind of moment this is. Set one below and ordinary notes will hold while you're busy."}
          </p>
        </div>

        <div className="vanta-inset px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <MachineLabel className="text-foreground/70">Senses on</MachineLabel>
            <MachineText className="text-[10px] text-muted-foreground">
              {on.length} of {SENSORS.length}
            </MachineText>
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
            {on.length
              ? `${on.map((s) => SENSOR_LABEL[s]).join(", ")}. Everything else stays off.`
              : "Nothing is switched on. Echo reads only what you hand it."}
          </p>
        </div>
      </div>

      <AftermathHint text="Anything a wearable sends arrives as context or a draft in your Inbox. Approval only happens on a screen where you can read the whole thing." />
    </section>
  );
}
