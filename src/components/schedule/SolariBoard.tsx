// SolariBoard — a split-flap departure board, one character per cell.
//
// Doctrine:
//   - The flip is an event, never a loop. Cells turn over once when the words
//     genuinely change, then hold.
//   - Nothing is invented: the board renders exactly the text it is handed.
//   - Reduced motion gets the same words with no movement (handled in index.css).
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";

export function SolariBoard({
  text,
  label,
  tone = "default",
  className,
}: {
  /** The words to show. Rendered uppercase, one cell per character. */
  text: string;
  /** Screen-reader / machine label shown above the cells. */
  label?: string;
  tone?: "default" | "primary" | "warn" | "danger" | "good";
  className?: string;
}) {
  const chars = text.toUpperCase().split("");
  const prev = useRef(text);
  /* A generation counter re-keys the cells so the flip animation replays only
     when the wording actually changed. */
  const [gen, setGen] = useState(0);

  useEffect(() => {
    if (prev.current !== text) {
      prev.current = text;
      setGen((g) => g + 1);
      // The clatter follows the flaps, one clack per settled cell.
      const n = Math.min(text.replace(/\s/g, "").length, 13);
      const timers = Array.from({ length: n }, (_, i) =>
        window.setTimeout(() => play("clack"), i * 32 + 120),
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [text]);

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

  return (
    <div className={cn("space-y-1", className)}>
      {label && <p className="vanta-machine-label text-muted-foreground/80">{label}</p>}
      <div className="flex flex-wrap gap-[2px]" aria-label={text}>
        {chars.map((c, i) => (
          <span
            key={`${gen}-${i}`}
            aria-hidden
            className={cn(
              "solari-cell inline-flex h-5 min-w-[13px] items-center justify-center rounded-[1px] border bg-muted/30 font-mono text-[11px] leading-none",
              toneClass,
              c === " " && "border-transparent bg-transparent",
            )}
            style={{ animationDelay: `${Math.min(i, 12) * 32}ms` }}
          >
            {c === " " ? "\u00A0" : c}
          </span>
        ))}
      </div>
    </div>
  );
}
