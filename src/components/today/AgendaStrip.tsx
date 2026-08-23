// AgendaStrip — the next few things on the day, as Vanta sees them.
//
// Today only reads. It shows what starts next and the honest open air between
// entries, then gets out of the way. Filing lives in Work.
import { CalendarClock } from "lucide-react";
import { SectionRail, MachineText } from "@/components/ui/instrument";
import { AgendaRow } from "@/components/calendar/AgendaRow";
import { gapMinutes, useAgenda } from "@/hooks/useAgenda";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

function gapLine(mins: number): string {
  if (mins < 60) return `${mins} min clear`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m clear` : `${h}h clear`;
}

export function AgendaStrip({ onOpenWeek }: { onOpenWeek?: () => void }) {
  const { events, loading } = useAgenda({ days: 2 });

  // Nothing linked, nothing on, or still reading: say nothing. Silence is valid.
  if (loading || events.length === 0) return null;

  const shown = events.slice(0, 3);
  const more = events.length - shown.length;

  return (
    <section className="vanta-focus-card vanta-card border border-transparent p-4" aria-label="Your day">
      <SectionRail
        label="On your day"
        icon={<CalendarClock className="h-3.5 w-3.5" />}
        reading={<MachineText>{events.length}</MachineText>}
        action={
          onOpenWeek ? (
            <button
              onClick={onOpenWeek}
              className={cn("min-h-[36px] text-xs text-primary hover:underline", MOTION_FOCUS)}
            >
              The week
            </button>
          ) : undefined
        }
      />
      <div className="mt-3 space-y-1.5">
        {shown.map((e, i) => {
          const next = shown[i + 1];
          const gap = next ? gapMinutes(e, next) : null;
          return (
            <div key={e.id} className="space-y-1.5">
              <AgendaRow event={e} showFiling={false} />
              {gap ? (
                <div className="flex items-center gap-2 pl-3">
                  <span className="h-3 w-px bg-border/60" />
                  <MachineText className="text-[10px] text-muted-foreground">{gapLine(gap)}</MachineText>
                </div>
              ) : null}
            </div>
          );
        })}
        {more > 0 ? (
          <p className="pt-1 text-[11px] text-muted-foreground">
            <MachineText>{more}</MachineText> more on the calendar. Reading only — nothing here becomes a task
            on its own.
          </p>
        ) : (
          <p className="pt-1 text-[11px] text-muted-foreground">
            Reading only — nothing here becomes a task on its own.
          </p>
        )}
      </div>
    </section>
  );
}
