import { cn } from "@/lib/utils";
import {
  Car, Plug, CreditCard, HandHeart, AlertTriangle, ShieldAlert, Wifi, Clock, Mountain,
  type LucideIcon,
} from "lucide-react";
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

const SECTION_ICON: Record<string, LucideIcon> = {
  transport: Car,
  infrastructure: Plug,
  payments: CreditCard,
  etiquette: HandHeart,
  hazards: AlertTriangle,
  scams: ShieldAlert,
  connectivity: Wifi,
  timing: Clock,
};

type Props = {
  onPick: (section: string) => void;
  activeLayer?: string | null;
  className?: string;
};

/**
 * LayerChips — 8 Awareness sections rendered as compact tappable chips.
 * Mobile: horizontally scrollable row with ~44px tap height.
 * Desktop (md+): wraps to multiple rows.
 */
export function LayerChips({ onPick, activeLayer, className }: Props) {
  const { latestBySection } = useAwareness();
  const hasActive = !!activeLayer;

  return (
    <div
      className={cn(
        // Mobile: horizontal scroll snap row with safe overscroll.
        // Desktop: wraps.
        "flex gap-1.5 -mx-1 px-1 overflow-x-auto md:overflow-visible md:flex-wrap snap-x snap-mandatory scrollbar-thin",
        className,
      )}
      role="group"
      aria-label="Awareness layers"
    >
      {AWARENESS_SECTIONS.map((s) => {
        const b = latestBySection[s];
        const f = freshnessOf(b?.generated_at);
        const conf = (b?.confidence ?? "none") as AwarenessConfidence | "none";
        const isActive = activeLayer === s;
        const confLabel = conf === "none" ? "no read yet" : `${conf} confidence`;
        const Icon = SECTION_ICON[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            aria-pressed={isActive}
            className={cn(
              "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full border bg-surface-elevated/60 px-3 py-2 text-[12px] capitalize transition-all hover:bg-surface-elevated",
              "min-h-[36px] md:min-h-0 md:py-1 md:px-2.5 md:text-[11px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              CONF_TINT[conf],
              isActive && "ring-2 ring-primary/60 border-primary/50 bg-primary/10 text-foreground",
              hasActive && !isActive && "opacity-60",
            )}
            aria-label={`${s} layer — ${confLabel}, ${f} data. ${isActive ? "Active filter, tap to clear." : "Tap to filter radar."}`}
            title={`${s} · ${confLabel} · ${f}`}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[f])} aria-hidden />
            {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
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
              "snap-start shrink-0 inline-flex items-center gap-1.5 rounded-full border bg-surface-elevated/60 px-3 py-2 text-[12px] capitalize transition-all hover:bg-surface-elevated",
              "min-h-[36px] md:min-h-0 md:py-1 md:px-2.5 md:text-[11px]",
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
            <Mountain className="h-3 w-3 shrink-0" aria-hidden />
            terrain
          </button>
        );
      })()}
    </div>
  );
}
