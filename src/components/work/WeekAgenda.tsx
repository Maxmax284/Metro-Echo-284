// WeekAgenda — the week Echo can see, and where entries get filed.
//
// Work is the operational room, so this is where an entry becomes structural:
// attach it to a project and the project's brief and re-entry cards can carry it.
// Still read-only against the calendar itself.
import { CalendarClock } from "lucide-react";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { MachineLabel, MachineText, RollingNumber, SectionRail } from "@/components/ui/instrument";
import { AgendaRow } from "@/components/calendar/AgendaRow";
import { useAgenda } from "@/hooks/useAgenda";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

function dayLabel(d: Date): string {
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (same(d, today)) return "Today";
  if (same(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function WeekAgenda({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { days, events, loading, error, refresh, setProject } = useAgenda({ days: 7 });

  return (
    <section className="vanta-card p-3" aria-label="The week ahead">
      <SectionRail
        label="The week ahead"
        icon={<CalendarClock className="h-3.5 w-3.5" />}
        reading={events.length > 0 ? <RollingNumber value={events.length} /> : undefined}
        action={
          onOpenSettings ? (
            <button
              onClick={onOpenSettings}
              className={cn("min-h-[36px] text-xs text-primary hover:underline", MOTION_FOCUS)}
            >
              Calendars
            </button>
          ) : undefined
        }
      />

      {error ? (
        <div className="mt-2.5">
          <ErrorState detail={error} onRetry={refresh} />
        </div>
      ) : loading ? (
        <div className="mt-2.5">
          <LoadingState rows={1} label="Reading the week" />
        </div>
      ) : events.length === 0 ? (
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          Nothing on the next seven days that Echo can see. Link a calendar in Settings and entries land
          here — reading only, and you can file each one under the project it belongs to.
        </p>
      ) : (
        <div className="mt-2.5 space-y-3">
          {days.map((d) => (
            <div key={d.key}>
              <div className="flex items-center gap-2">
                <MachineLabel className="text-foreground/70">{dayLabel(d.date)}</MachineLabel>
                <span className="h-px flex-1 bg-border/50" />
                <MachineText className="text-[10px] text-muted-foreground">{d.events.length}</MachineText>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {d.events.map((e) => (
                  <AgendaRow key={e.id} event={e} onSetProject={(ev, p) => setProject(ev.id, p)} />
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Filing an entry under a project is your own structure — it survives every re-sync and never
            changes the calendar.
          </p>
        </div>
      )}
    </section>
  );
}
