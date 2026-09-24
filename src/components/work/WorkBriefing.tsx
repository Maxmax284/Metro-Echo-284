// WorkBriefing — Work opens with the state of work, not ten equal choices.
//
// Doctrine: one promoted "Start here", then at most four short lanes. Tapping
// travels; nothing here executes. When the room is genuinely quiet it says so
// in one line instead of manufacturing something to look at.
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CALM_LINE, type WorkBriefing as Briefing } from "@/lib/workBriefing";
import { MachineLabel } from "@/components/ui/instrument";
import { MOTION_FOCUS, MOTION_HOVER_LIFT, MOTION_ROW } from "@/lib/motion";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { WorkBodyNote } from "@/components/work/WorkBodyNote";
import { ArrivalHomes } from "@/components/work/ArrivalHomes";

export function WorkBriefingPanel({
  briefing,
  onNavigate,
  onChanged,
}: {
  briefing: Briefing;
  onNavigate: (k: SurfaceKey) => void;
  onChanged?: () => void;
}) {
  const arrived = briefing.sections.find((s) => s.lane === "arrived")?.items ?? [];
  const go = (surface: string, href?: string | null) => {
    if (href) {
      window.location.href = href;
      return;
    }
    onNavigate(surface as SurfaceKey);
  };

  return (
    <section className="vanta-card p-3" aria-label="The state of work">
      <MachineLabel className="text-foreground/70">Start here</MachineLabel>
      <WorkBodyNote />

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

      {arrived.length > 0 ? (
        <ArrivalHomes items={arrived} onOpenInbox={() => onNavigate("inbox" as SurfaceKey)} onChanged={onChanged} />
      ) : null}

      <p className="mt-2 text-[11px] text-muted-foreground">Echo only suggests. Nothing gets filed or run until you tap.</p>
    </section>
  );
}
