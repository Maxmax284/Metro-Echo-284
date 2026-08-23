// QuickModes — the switches you actually flip, on the surface where you notice
// you need them. No trip to the control room.
//
// Three things only: what kind of moment this is (posture), whether Vanta may
// speak up at all, and whether it may reach your phone. Everything else stays
// in Settings. Nothing here executes anything.
import { useState } from "react";
import { ChevronDown, MessageCircle, Radio, Timer } from "lucide-react";
import { POSTURE_LABEL, postureHoldsNoise, type Posture } from "@/lib/awareness";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { MachineLabel } from "@/components/ui/instrument";
import { MOTION_FOCUS, MOTION_MICRO, MOTION_PRESS } from "@/lib/motion";
import { vantaToast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

/** The postures worth one tap. The full list stays in Settings. */
const QUICK: Posture[] = ["at_desk", "deep_work", "meeting", "driving"];

const HOLD_MS = 3 * 60 * 60 * 1000;

function Pill({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1 text-[11px] ring-1",
        MOTION_MICRO,
        MOTION_PRESS,
        MOTION_FOCUS,
        active
          ? "bg-primary/15 text-primary ring-primary/40"
          : "bg-muted/20 text-muted-foreground ring-border/50 hover:text-foreground/90",
      )}
    >
      {children}
    </button>
  );
}

export function QuickModes() {
  const { context, setPosture } = useVantaContext();
  const { prefs, update } = useUserPreferences();
  // Open by default: these are the switches worth seeing, and hiding them was
  // just Settings with extra steps.
  const [open, setOpen] = useState(true);

  const current = context.posture ?? null;

  const choosePosture = async (p: Posture) => {
    const next = current === p ? null : p;
    await setPosture(next, next ? new Date(Date.now() + HOLD_MS).toISOString() : null);
    vantaToast.info({
      title: next ? `${POSTURE_LABEL[next]} for the next 3 hours.` : "Posture cleared.",
      description:
        next && postureHoldsNoise(next)
          ? "Ordinary notes will hold. Anything critical still reaches you."
          : "Vanta speaks as normal.",
    });
  };

  const toggleSpeak = async () => {
    const next = !prefs.proactive_awareness_enabled;
    await update({ proactive_awareness_enabled: next });
    vantaToast.info({
      title: next ? "Vanta may speak up." : "Vanta stays quiet.",
      description: next
        ? "One grounded signal at a time, and only when it earns it."
        : "It keeps watching and recording. It just won't interrupt.",
    });
  };

  const toggleReach = async () => {
    const next = !prefs.telegram_awareness_enabled;
    await update({ telegram_awareness_enabled: next });
    vantaToast.info({
      title: next ? "Telegram reach on." : "Telegram reach off.",
      description: next
        ? "Time-sensitive notices go to your linked chat. Nothing runs from chat."
        : "Notices stay inside Vanta.",
    });
  };

  return (
    <section className="vanta-focus-card vanta-card border border-transparent px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn("flex w-full min-h-[36px] items-center gap-2 text-left", MOTION_FOCUS)}
      >
        <Timer className="h-3.5 w-3.5 text-muted-foreground" />
        <MachineLabel className="text-foreground/70">Right now</MachineLabel>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {current ? POSTURE_LABEL[current] : "No posture set"}
          {prefs.proactive_awareness_enabled ? " · may speak" : " · quiet"}
          {prefs.telegram_awareness_enabled ? " · reaches Telegram" : ""}
        </span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((p) => (
              <Pill
                key={p}
                active={current === p}
                onClick={() => choosePosture(p)}
                title={postureHoldsNoise(p) ? "Holds ordinary notes for 3 hours" : "Normal reach"}
              >
                {POSTURE_LABEL[p]}
              </Pill>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Pill active={!!prefs.proactive_awareness_enabled} onClick={toggleSpeak}>
              <Radio className="h-3 w-3" /> Vanta may speak up
            </Pill>
            <Pill active={!!prefs.telegram_awareness_enabled} onClick={toggleReach}>
              <MessageCircle className="h-3 w-3" /> Reach me on Telegram
            </Pill>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            A posture holds ordinary notes for three hours. Anything critical still comes through, and nothing
            ever runs without your approval.
          </p>
        </div>
      ) : null}
    </section>
  );
}
