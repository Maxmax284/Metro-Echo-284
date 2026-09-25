// SignalBeacon — the trackside signal at the top of Today.
//
// Doctrine:
//   - It reports state, never mood: green aspect only when nothing needs you,
//     amber when something does. It never invents a third meaning.
//   - The word drum riffles once, on a real state change, then rests. No loops
//     that fake activity.
//   - The raster sweep is the only repeating motion: proof Echo is on watch,
//     slow enough to read as idle, disabled under reduced motion.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STEP_MS = 74;

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** A short word on a split-flap drum. Turns only when the word really changes. */
export function SolariWord({ word, tone = "live" }: { word: string; tone?: "live" | "hold" }) {
  const target = word.toUpperCase();
  const prev = useRef<string | null>(null);
  const [shown, setShown] = useState(target);
  const [gen, setGen] = useState(0);

  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    if (reducedMotion()) { setShown(target); return; }
    const len = target.length;
    const flaps = target.split("").map((_, i) => 2 + (i % 4));
    const maxStep = Math.max(...flaps);
    const timers: number[] = [];
    let cur = new Array(len).fill(" ");
    for (let s = 1; s <= maxStep; s++) {
      timers.push(
        window.setTimeout(() => {
          let landed = 0;
          cur = cur.map((c, i) => {
            if (s < flaps[i]) return GLYPHS[(s * 7 + i * 3) % GLYPHS.length];
            if (s === flaps[i]) { landed += 1; return target[i]; }
            return target[i];
          });
          setShown(cur.join(""));
          setGen((g) => g + 1);
          if (landed > 0) play("clack", { gain: 0.8 });
          else play("tick", { gain: 0.5 });
        }, s * STEP_MS),
      );
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [target]);

  return (
    <span className="solari-drum inline-flex gap-[2px] align-middle" data-size="sm" aria-label={target}>
      {shown.split("").map((c, i) => (
        <span
          key={`${i}-${gen}`}
          aria-hidden
          className={cn(
            "solari-digit relative inline-flex h-[19px] min-w-[13px] items-center justify-center overflow-hidden rounded-[1px] border bg-background/80 font-mono text-[11px] font-bold leading-none",
            tone === "live" ? "border-primary/45 text-primary" : "border-warn/45 text-warn",
          )}
        >
          {c}
        </span>
      ))}
    </span>
  );
}

/** Twin-aspect signal head. Lit lamp = the honest state, the other stands dark. */
export function SignalBeacon({
  state,
  label,
  className,
}: {
  state: "clear" | "attention";
  /** The word on the drum — read off the real state, never decorative. */
  label: string;
  className?: string;
}) {
  const clear = state === "clear";
  return (
    <div
      className={cn(
        "echo-signal relative inline-flex items-center gap-2.5 rounded-md border px-2.5 py-1.5",
        clear ? "border-primary/30" : "border-warn/40",
        className,
      )}
      role="status"
    >
      <span aria-hidden className="echo-signal-raster" />
      {/* The head: two lenses in a cast housing, one lit. */}
      <span aria-hidden className="echo-signal-head">
        <span className={cn("echo-lens", clear ? "echo-lens-live is-lit" : "echo-lens-dark")} />
        <span className={cn("echo-lens", clear ? "echo-lens-dark" : "echo-lens-warn is-lit")} />
      </span>
      <span className="relative flex flex-col gap-0.5">
        <SolariWord word={label} tone={clear ? "live" : "hold"} />
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {clear ? "on watch · no conflicts" : "one thing wants you"}
        </span>
      </span>
    </div>
  );
}
