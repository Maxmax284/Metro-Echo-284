import { ReactNode } from "react";
import { OperationalState } from "@/lib/operationalState";
import { Activity, Compass, MapPin, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const stateLabel: Record<OperationalState, string> = {
  ambient: "ambient",
  capturing: "capturing",
  planning: "planning",
  executing: "executing",
  moving: "moving",
};

export function AmbientHeader({
  state,
  place,
  right,
}: {
  state: OperationalState;
  place?: string;
  right?: ReactNode;
}) {
  const hour = new Date().getHours();
  const Time = hour < 6 || hour >= 19 ? Moon : Sun;
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <header className="safe-top sticky top-0 z-30 glass">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-surface-elevated/80 px-2 py-0.5 text-[10.5px] tracking-wide uppercase",
              "ring-1 ring-border/60"
            )}
            title="Inferred operational posture"
          >
            <Activity className="h-3 w-3 text-primary" />
            <span className="text-foreground/90">{stateLabel[state]}</span>
          </span>
          {place && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{place}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Time className="h-3 w-3" />
            {time}
          </span>
          {right}
        </div>
      </div>
    </header>
  );
}

export function VantaMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
        <Compass className="h-3.5 w-3.5" />
      </span>
      Vanta
    </span>
  );
}
