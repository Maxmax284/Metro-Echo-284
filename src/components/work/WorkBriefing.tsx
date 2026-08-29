// WorkBriefing — Work opens with the state of work, not ten equal choices.
//
// Doctrine: one promoted "Start here", then at most four short lanes. Tapping
// travels; nothing here executes. When the room is genuinely quiet it says so
// in one line instead of manufacturing something to look at.
import { AlertCircle, ArrowRight, Clock, Inbox, MoonStar } from "lucide-react";
import { cn } from "@/lib/utils";
import { CALM_LINE, type BriefingLane, type WorkBriefing as Briefing } from "@/lib/workBriefing";
import { MachineLabel } from "@/components/ui/instrument";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { MOTION_FOCUS, MOTION_HOVER_LIFT, MOTION_ROW } from "@/lib/motion";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

const LANE_ICON: Record<BriefingLane, typeof Inbox> = {
  "needs-you": AlertCircle,
  arrived: Inbox,
  due: Clock,
  drifting: MoonStar,
};

const LANE_TONE: Record<BriefingLane, string> = {
  "needs-you": "text-amber-400",
  arrived: "text-primary",
  due: "text-foreground/70",
  drifting: "text-muted-foreground",
};

export function WorkBriefingPanel({
  briefing,
  onNavigate,
}: {
  briefing: Briefing;
  onNavigate: (k: SurfaceKey) => void;
}) {
  const go = (surface: string, href?: string | null) => {
    if (href) {
      window.location.href = href;
      return;
    }
    onNavigate(surface as SurfaceKey);
  };

  return (
    <section className="vanta-card p-3" aria-label="The state of work">
      <MachineLabel className="text-foreground/70">Where things stand</MachineLabel>

      {briefing.start ? (
        <button
          type="button"
          onClick={() => go(briefing.start!.surface, briefing.start!.href)}
          className={cn(
            "mt-2 flex w-full min-h-[44px] items-center gap-2 vanta-inset px-3 py-2 text-left",
            "border-l-2 border-primary/70 hover:bg-surface-elevated/70",
            MOTION_ROW,
            MOTION_HOVER_LIFT,
            MOTION_FOCUS,
          )}
        >
          <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-foreground">
            {briefing.start.line}
          </span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
        </button>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{CALM_LINE}</p>
      )}

      {briefing.sections.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {briefing.sections.map((s) => {
            const Icon = LANE_ICON[s.lane];
            const more = s.total - s.items.length;
            return (
              <li key={s.lane}>
                <button
                  type="button"
                  onClick={() => go(s.surface)}
                  className={cn(
                    "flex w-full min-h-[36px] items-center gap-1.5 text-left",
                    MOTION_FOCUS,
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", LANE_TONE[s.lane])} aria-hidden />
                  <span className="vanta-machine text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    {s.title}
                  </span>
                  <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">{s.total}</span>
                </button>
                <ul className="mt-1 space-y-0.5 pl-5">
                  {s.items.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => go(it.surface, it.href)}
                        className={cn(
                          "block w-full truncate py-1 text-left text-xs text-foreground/85 hover:text-foreground",
                          MOTION_FOCUS,
                        )}
                      >
                        {it.label}
                      </button>
                    </li>
                  ))}
                  {more > 0 && (
                    <li className="py-0.5 text-[10.5px] text-muted-foreground">
                      {more} more at the {s.title.toLowerCase()} desk
                    </li>
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      )}

      <AftermathHint text="Tapping opens the desk that owns the record. Nothing runs from here." />
    </section>
  );
}
