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
import { reducedMotion } from "@/lib/reducedMotion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const STEP_MS = 74;

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

export type GpsLive = {
  on: boolean;
  lock: "off" | "search" | "lock" | "lost" | "denied" | "unsupported";
  /** Increments once per real fix from the phone — drives the pulse. */
  beats: number;
  onToggle: () => void;
};

/** Twin-aspect signal head. Lit lamp = the honest state, the other stands dark. */
export function SignalBeacon({
  state,
  label,
  where,
  telemetry,
  gps,
  className,
}: {
  /** Live town from the device fix — flips on the drum when you actually move. */
  where?: string | null;
  state: "clear" | "attention";
  /** The word on the drum — read off the real state, never decorative. */
  label: string;
  /** Extra flaps read off real sensor state. Empty when nothing is known. */
  telemetry?: Array<{ word: string; tone?: "live" | "hold" }>;
  gps?: GpsLive;
  className?: string;
}) {
  const clear = state === "clear";
  const flaps = (telemetry ?? []).filter((t) => t.word);
  const locked = gps?.on && gps.lock === "lock";
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
      {/* Live watch: a sonar scope instead of coordinates. The sweep arm turns
          while the watch is on; a ring pushes out once per real fix. */}
      {gps?.on ? (
        <span
          aria-hidden
          className={cn("echo-sonar", locked ? "is-locked" : "is-searching")}
          title="live gps"
        >
          <span className="echo-sonar-grid" />
          <span className="echo-sonar-sweep" />
          {gps.beats > 0 ? <span key={gps.beats} className="echo-sonar-ping" /> : null}
          <span className="echo-sonar-core" />
        </span>
      ) : null}
      <span className="relative flex flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <SolariWord word={label} tone={clear ? "live" : "hold"} />
          {where ? <SolariWord word={where.replace(/[^A-Za-z ]/g, "").trim().slice(0, 12) || "HERE"} tone="live" /> : null}
        </span>
        {flaps.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {flaps.map((t, i) => (
              <SolariWord key={`${i}-${t.word.split(" ")[1] ?? i}`} word={t.word} tone={t.tone ?? "live"} />
            ))}
          </span>
        ) : null}
        <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {gps ? (
            <button
              type="button"
              onClick={gps.onToggle}
              aria-pressed={gps.on}
              className={cn(
                "inline-flex min-h-[32px] items-center gap-1.5 rounded-sm border px-1.5",
                gps.on ? (locked ? "border-primary/50 text-primary" : "border-warn/50 text-warn") : "border-border/60",
              )}
            >
              {/* When the watch is live the sonar scope carries the heartbeat,
                  so the button keeps a plain lamp. */}
              <span className="relative inline-flex h-2 w-2">
                <span className={cn("relative h-2 w-2 rounded-full", gps.on ? "bg-current" : "bg-muted-foreground/40")} />
              </span>
              {gps.on ? (locked ? "live gps" : "acquiring") : "go live"}
            </button>
          ) : null}
          <span>{clear ? "on watch · no conflicts" : "one thing wants you"}</span>
        </span>
      </span>
    </div>
  );
}
