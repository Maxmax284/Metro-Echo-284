import { ReactNode } from "react";
import { OperationalState } from "@/lib/operationalState";
import { Compass, MapPin, Moon, Sun } from "lucide-react";
import { PostureGlyph } from "@/components/shell/PostureGlyph";
import { SoundToggle } from "@/components/shell/SoundToggle";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const stateLabel: Record<OperationalState, string> = {
  ambient: "ambient",
  capturing: "capturing",
  planning: "planning",
  executing: "executing",
  moving: "moving",
};

export type AwarenessHeaderState = {
  freshness: "fresh" | "aging" | "stale" | "missing";
  confidence: "low" | "medium" | "high" | null;
};

const freshnessTone: Record<AwarenessHeaderState["freshness"], string> = {
  fresh: "bg-primary/15 text-primary ring-primary/30",
  aging: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  stale: "bg-destructive/15 text-destructive ring-destructive/30",
  missing: "bg-muted/40 text-muted-foreground ring-border/60",
};

const freshnessLabel: Record<AwarenessHeaderState["freshness"], string> = {
  fresh: "fresh",
  aging: "aging",
  stale: "stale",
  missing: "no brief",
};

export function AmbientHeader({
  state,
  place,
  awareness,
  onAwarenessClick,
  right,
  room,
}: {
  state: OperationalState;
  place?: string;
  awareness?: AwarenessHeaderState;
  onAwarenessClick?: () => void;
  right?: ReactNode;
  /** Active surface — the posture glyph leans toward it. */
  room?: string;
}) {
  const hour = new Date().getHours();
  const Time = hour < 6 || hour >= 19 ? Moon : Sun;
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    /* The weather edge: one 1px hairline that carries the tone of the day.
       Cool when calm, warm under pressure. Ambient only — never the source of
       truth for anything the user has to act on. */
    <header className="safe-top sticky top-0 z-30 glass vanta-weather-edge">
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted-foreground md:px-4 md:py-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/80 px-2 py-0.5 text-[10.5px] tracking-wide uppercase",
              "ring-1 ring-border/60"
            )}
            title="Inferred operational posture"
          >
            {/* The one always-on tell that the system is awake: a 4.8s opacity
                breath on the posture glyph. Nothing else in the chrome loops. */}
            <PostureGlyph state={state} room={room} />
            <span className="text-foreground/90 hidden sm:inline">{stateLabel[state]}</span>
          </span>
          {place && (
            <button
              type="button"
              onClick={onAwarenessClick}
              className="inline-flex items-center gap-1 truncate rounded-full px-1.5 py-0.5 hover:bg-surface-elevated/60"
              title="Awareness"
            >
              <MapPin className="h-3 w-3" />
              <span className="truncate max-w-[88px] sm:max-w-[140px]">{place}</span>
              {awareness && (
                <span
                  className={cn(
                    "ml-1 rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1",
                    freshnessTone[awareness.freshness]
                  )}
                >
                  {freshnessLabel[awareness.freshness]}
                  <span className="hidden sm:inline">{awareness.confidence ? ` · ${awareness.confidence}` : ""}</span>
                </span>
              )}
            </button>
          )}
        </div>
        {/* At 384px the control cluster is wider than the room. It scrolls
            inside itself rather than pushing the whole page sideways. */}
        <div className="scrollbar-thin flex min-w-0 shrink items-center gap-2 overflow-x-auto md:gap-3">

          <span className="hidden sm:inline-flex items-center gap-1">
            <Time className="h-3 w-3" />
            {time}
          </span>
          <SoundToggle />
          {right}
        </div>
      </div>
    </header>
  );
}

export function ProductMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
        <Compass className="h-3.5 w-3.5" />
      </span>
      {PRODUCT_NAME}
    </span>
  );
}
