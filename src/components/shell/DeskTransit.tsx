// DeskTransitOverlay — the trackside transfer cover between desks.
//
// A desk tap used to hand you a black screen while the next desk built itself.
// This holds a lit signal box over that gap: the destination riffles onto a
// split-flap drum, a track light runs across, and it lifts as soon as the desk
// is up. It never claims progress it cannot see — it is a cover, not a loader.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SolariWord } from "@/components/today/SignalBeacon";
import { onDeskTransit, type DeskTransit } from "@/lib/deskTransit";
import { play } from "@/lib/streetSound";
import { feelMs } from "@/lib/motion";

export function DeskTransitOverlay() {
  const [transit, setTransit] = useState<DeskTransit | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(
    () =>
      onDeskTransit((t) => {
        timers.current.forEach((x) => window.clearTimeout(x));
        timers.current = [];
        setLeaving(false);
        setTransit(t);
        play("turnstile", { gain: 0.7 });
        const hold = feelMs(t.holdMs ?? 980, { min: 420 });
        timers.current.push(window.setTimeout(() => setLeaving(true), hold));
        timers.current.push(
          window.setTimeout(() => {
            setTransit(null);
            setLeaving(false);
          }, hold + 240),
        );
      }),
    [],
  );

  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  if (!transit) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[90] flex items-center justify-center px-6",
        "desk-transit",
        leaving && "desk-transit-out",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="desk-transit-box w-full max-w-[320px] rounded-md border border-border/70 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="echo-lens echo-lens-live is-lit h-2.5 w-2.5 rounded-full" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Transferring
          </span>
        </div>

        <div className="mt-2.5">
          <SolariWord word={transit.word.slice(0, 14)} />
        </div>

        {transit.line ? (
          <p className="mt-2 text-[11.5px] leading-snug text-muted-foreground">{transit.line}</p>
        ) : null}

        <div className="desk-transit-track mt-3 h-[3px] w-full overflow-hidden rounded-full">
          <span className="desk-transit-run block h-full w-1/3 rounded-full" aria-hidden />
        </div>
      </div>
    </div>
  );
}
