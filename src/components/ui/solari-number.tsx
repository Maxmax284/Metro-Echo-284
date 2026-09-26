// SolariNumber — a counter on a split-flap drum.
//
// Doctrine:
//   - The roll is an event, never a loop. Digits only turn when the real number
//     changes, and only the digits that actually differ turn.
//   - Nothing is invented: the accessible value is always the real number; the
//     digits spinning past it are motion only.
//   - Reduced motion gets the number, instantly, in silence.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";
import { reducedMotion } from "@/lib/reducedMotion";

const STEP_MS = 62;
const STEP_MS_LG = 88;

export function SolariNumber({
  value,
  tone = "primary",
  size = "sm",
  className,
}: {
  value: number | string;
  tone?: "primary" | "default" | "warn" | "danger";
  /** sm = inline badge. lg = a real board drum, for headline counts. */
  size?: "sm" | "lg";
  className?: string;
}) {
  const target = String(value);
  const prev = useRef(target);
  const [shown, setShown] = useState(target);
  const [gen, setGen] = useState(0);


  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    if (reducedMotion()) {
      setShown(target);
      return;
    }
    const len = target.length;
    const padded = from.padStart(len, "0").slice(-len).split("");
    /* Each differing digit riffles through a few flaps; matching digits hold. */
    const flaps = padded.map((c, i) => (c === target[i] ? 0 : 3 + (i % 3)));
    const maxStep = Math.max(0, ...flaps);
    const timers: number[] = [];
    let cur = [...padded];
    for (let s = 1; s <= maxStep; s++) {
      timers.push(
        window.setTimeout(() => {
          let landed = 0;
          cur = cur.map((c, i) => {
            if (flaps[i] === 0) return target[i];
            if (s < flaps[i]) return String((Number(c) + 3 + s) % 10);
            if (s === flaps[i]) {
              landed += 1;
              return target[i];
            }
            return c;
          });
          setShown(cur.join(""));
          setGen((g) => g + 1);
          const loud = size === "lg" ? 1.9 : 1;
          if (landed > 0) { play("clack", { gain: loud }); if (size === "lg") play("stamp", { gain: 0.35 }); }
          else play(s === 1 ? "solari" : "tick", { gain: size === "lg" ? 1.4 : s === 1 ? 1 : 0 });
        }, s * (size === "lg" ? STEP_MS_LG : STEP_MS)),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [target, size]);

  const toneClass =
    tone === "warn"
      ? "text-warn border-warn/45"
      : tone === "danger"
        ? "text-destructive border-destructive/45"
        : tone === "default"
          ? "text-foreground/90 border-border/60"
          : "text-primary border-primary/50";

  const sizeClass =
    size === "lg"
      ? "h-[52px] min-w-[36px] text-[34px] rounded-[3px] border-2"
      : "h-[22px] min-w-[15px] text-[13px] rounded-[1px]";

  return (
    <span
      className={cn("solari-drum inline-flex gap-[3px] align-middle", className)}
      data-size={size}
      aria-label={target}
    >
      {shown.split("").map((c, i) => (
        <span
          key={`${i}-${gen}`}
          aria-hidden
          className={cn(
            "solari-digit relative inline-flex items-center justify-center overflow-hidden border bg-background/70 font-mono font-semibold leading-none",
            sizeClass,
            toneClass,
          )}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

