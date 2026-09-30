// SolariBoard — a split-flap departure board, one character per cell.
//
// Doctrine:
//   - The flip is an event, never a loop. When the words genuinely change,
//     each changed cell riffles through a few flaps and lands on its real
//     character, then holds. One clack per flap that lands.
//   - Nothing is invented: intermediate flaps are motion only (aria-hidden);
//     the board's accessible text is always the real value.
//   - Reduced motion gets the final words at once, no riffle, no sound.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";
import { reducedMotion } from "@/lib/reducedMotion";

const DRUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const STEP_MS = 55;

export function SolariBoard({
  text,
  label,
  tone = "default",
  className,
}: {
  text: string;
  label?: string;
  tone?: "default" | "primary" | "warn" | "danger" | "good";
  className?: string;
}) {
  const target = text.toUpperCase();
  const prev = useRef(target);
  const [shown, setShown] = useState(target);
  const [flipGen, setFlipGen] = useState<number[]>(() => target.split("").map(() => 0));

  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    if (from === target) return;
    if (reducedMotion()) {
      setShown(target);
      return;
    }
    const len = target.length;
    // How many flaps each cell riffles before landing: unchanged cells stay put.
    const flaps = Array.from({ length: len }, (_, i) =>
      from[i] === target[i] || target[i] === " " ? 0 : 3 + Math.min(i, 8),
    );
    const maxSteps = Math.max(0, ...flaps);
    const timers: number[] = [];
    let cur = from.padEnd(len, " ").slice(0, len).split("");
    const gens = Array(len).fill(0);
    for (let s = 1; s <= maxSteps; s++) {
      timers.push(
        window.setTimeout(() => {
          let landed = 0;
          cur = cur.map((c, i) => {
            if (flaps[i] === 0) return target[i];
            if (s < flaps[i]) {
              gens[i]++;
              return DRUM[(DRUM.indexOf(c) + 1 + ((i + s) % 5)) % DRUM.length] ?? DRUM[s % DRUM.length];
            }
            if (s === flaps[i]) {
              gens[i]++;
              landed++;
              return target[i];
            }
            return c;
          });
          setShown(cur.join(""));
          setFlipGen([...gens]);
          // Sound tracks motion: a soft flutter while riffling, a flap as
          // cells land. Kept low — boards should whisper, not rattle.
          if (landed > 0) play("clack", { gain: 0.5 });
          else if (s === 1) play("solari", { gain: 0.6 });
        }, s * STEP_MS),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [target]);

  const toneClass =
    tone === "primary"
      ? "text-primary border-primary/45"
      : tone === "warn"
        ? "text-warn border-warn/45"
        : tone === "danger"
          ? "text-destructive border-destructive/45"
          : tone === "good"
            ? "text-emerald-400 border-emerald-400/40"
            : "text-foreground/85 border-border/60";

  const chars = shown.split("");
  return (
    <div className={cn("space-y-1", className)}>
      {label && <p className="vanta-machine-label text-muted-foreground/80">{label}</p>}
      <div className="flex flex-wrap gap-[2px]" aria-label={text}>
        {chars.map((c, i) => (
          <span
            key={`${i}-${flipGen[i] ?? 0}`}
            aria-hidden
            className={cn(
              "solari-cell relative inline-flex h-5 min-w-[13px] items-center justify-center overflow-hidden rounded-[1px] border bg-muted/30 font-mono text-[11px] leading-none",
              toneClass,
              c === " " && "border-transparent bg-transparent",
            )}
          >
            {c === " " ? "\u00A0" : c}
          </span>
        ))}
      </div>
    </div>
  );
}
