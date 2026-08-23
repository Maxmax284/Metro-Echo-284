// LiveBulletin — the board that moves while you watch it.
//
// One line per real change, newest on top, each one naming what happened and
// where it landed so "6 things changed" is never the whole story. Rows arrive
// with a single one-shot animation and then go still. If nothing has landed
// since you opened Vanta, this renders nothing at all — silence is valid.
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Radio } from "lucide-react";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { eventWhere, humanizeEvent } from "@/lib/plainLabels";
import type { LiveEvent } from "@/hooks/useLiveFeed";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { LEAD_BAR, MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function LiveBulletin({
  live,
  connected,
  onNavigate,
}: {
  live: LiveEvent[];
  connected: boolean;
  onNavigate: (k: SurfaceKey) => void;
}) {
  if (live.length === 0) return null;

  return (
    <section className="vanta-focus-card vanta-card vanta-notch border border-transparent p-4">
      <div className="flex items-center gap-2">
        <Radio className={cn("h-3.5 w-3.5 text-primary", connected && "vanta-live-dot")} />
        <MachineLabel className="text-foreground/70">Happening now</MachineLabel>
        <MachineText className="ml-auto text-[10px] text-muted-foreground">
          {connected ? "live" : "reconnecting"}
        </MachineText>
      </div>

      <ul className="mt-3 space-y-1.5">
        {live.slice(0, 5).map((e) => {
          const where = eventWhere(e.entity_type);
          return (
            <li key={e.id}>
              <button
                onClick={() => onNavigate(where.surface as SurfaceKey)}
                className={cn(
                  "flex w-full min-h-[44px] items-center gap-2 vanta-inset px-3 py-2 text-left hover:bg-surface-elevated/70",
                  "vanta-bulletin-row",
                  MOTION_ROW,
                  MOTION_FOCUS,
                  LEAD_BAR,
                  "text-primary/60",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
                  {humanizeEvent(e.event)}
                  <span className="text-muted-foreground"> — filed in {where.label}</span>
                </span>
                <MachineText className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </MachineText>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        Arrivals only. Nothing here ran on its own — every line is something already recorded.
      </p>
    </section>
  );
}
