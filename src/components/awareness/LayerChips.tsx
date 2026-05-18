import { cn } from "@/lib/utils";
import { Mountain } from "lucide-react";
import { AWARENESS_SECTIONS, useAwareness, type AwarenessConfidence } from "@/providers/AwarenessProvider";

const FRESH_MS = 24 * 60 * 60 * 1000;
const AGING_MS = 7 * 24 * 60 * 60 * 1000;

type Freshness = "fresh" | "aging" | "stale" | "missing";
function freshnessOf(generatedAt?: string): Freshness {
  if (!generatedAt) return "missing";
  const age = Date.now() - new Date(generatedAt).getTime();
  if (age < FRESH_MS) return "fresh";
  if (age < AGING_MS) return "aging";
  return "stale";
}

const DOT: Record<Freshness, string> = {
  fresh:   "bg-primary",
  aging:   "bg-accent",
  stale:   "bg-warn",
  missing: "bg-muted-foreground/40",
};

const CONF_TINT: Record<AwarenessConfidence | "none", string> = {
  high:   "border-primary/40 text-foreground/90",
  medium: "border-accent/40 text-foreground/90",
  low:    "border-warn/40 text-foreground/85",
  none:   "border-border/60 text-muted-foreground",
};

type Props = {
  onPick: (section: string) => void;
  activeLayer?: string | null;
  className?: string;
};

/**
 * LayerChips — 8 Awareness sections rendered as compact tappable chips.
 * Acts as a radar filter when `activeLayer` is provided.
 */
export function LayerChips({ onPick, activeLayer, className }: Props) {
  const { latestBySection } = useAwareness();
  const hasActive = !!activeLayer;

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {AWARENESS_SECTIONS.map((s) => {
        const b = latestBySection[s];
        const f = freshnessOf(b?.generated_at);
        const conf = (b?.confidence ?? "none") as AwarenessConfidence | "none";
        const isActive = activeLayer === s;
        const confLabel = conf === "none" ? "no read yet" : `${conf} confidence`;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border bg-surface-elevated/60 px-2.5 py-1 text-[11px] capitalize transition-all hover:bg-surface-elevated",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              CONF_TINT[conf],
              isActive && "ring-2 ring-primary/60 border-primary/50 bg-primary/10 text-foreground",
              hasActive && !isActive && "opacity-60",
            )}
            aria-label={`${s} layer — ${confLabel}, ${f} data. ${isActive ? "Active filter, tap to clear." : "Tap to filter radar."}`}
            title={`${s} · ${confLabel} · ${f}`}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", DOT[f])} aria-hidden />
            {s}
          </button>
        );
      })}
      {/* R4 — Terrain chip (non-section overlay control) */}
      {(() => {
        const isActive = activeLayer === "terrain";
        return (
          <button
            key="terrain"
            type="button"
            onClick={() => onPick("terrain")}
            aria-pressed={isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border bg-surface-elevated/60 px-2.5 py-1 text-[11px] capitalize transition-all hover:bg-surface-elevated",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              "border-accent/40 text-foreground/85",
              isActive && "ring-2 ring-accent/60 border-accent/50 bg-accent/10 text-foreground",
              hasActive && !isActive && "opacity-60",
            )}
            aria-label={
              isActive
                ? "Terrain overlay active — tap to clear. Dims pings and emphasises the radar backdrop."
                : "Show terrain overlay — emphasises radar backdrop and dims pings."
            }
            title="Terrain overlay — emphasises the radar backdrop, dims pings."
          >
            <Mountain className="h-3 w-3" aria-hidden />
            terrain
          </button>
        );
      })()}
    </div>
  );
}
