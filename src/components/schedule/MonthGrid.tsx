// MonthGrid — browse the dates Vanta has actually read, one month at a time.
//
// Doctrine:
//  - Read-only. This is a record of what the calendars said, never a planner.
//    Nothing here creates, moves, or writes back to any calendar.
//  - Density first: a month cell says how loaded a day is, not what is on it.
//    Titles belong to the day you tapped, so 384px never turns into mush.
//  - Honest about its own edges: the grid only knows the window Vanta keeps
//    (yesterday to thirty days out), and it says so instead of showing an
//    empty month as if the month were empty.
//  - Mobile is the battlefield: 44px cells, tap targets not hover targets.
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { AgendaRow } from "@/components/calendar/AgendaRow";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useAgenda } from "@/hooks/useAgenda";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Monday-first offset, because a week that starts on Sunday reads wrong here. */
function leadingBlanks(first: Date): number {
  return (first.getDay() + 6) % 7;
}
function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** How loaded a day looks at a glance: nothing, light, busy. */
function load(count: number): "none" | "light" | "busy" {
  if (count === 0) return "none";
  if (count <= 2) return "light";
  return "busy";
}

export function MonthGrid() {
  const today = new Date();
  const [cursor, setCursor] = useState<Date>(startOfMonth(today));
  const [selected, setSelected] = useState<Date | null>(today);

  const from = useMemo(() => startOfMonth(cursor), [cursor]);
  const to = useMemo(() => endOfMonth(cursor), [cursor]);
  const { events, loading, error, refresh, setProject } = useAgenda({ from, to });

  const byDay = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const k = dayKey(new Date(e.starts_at));
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const out: (Date | null)[] = [];
    for (let i = 0; i < leadingBlanks(from); i++) out.push(null);
    const last = endOfMonth(cursor).getDate();
    for (let d = 1; d <= last; d++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return out;
  }, [cursor, from]);

  const monthName = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selectedList = selected ? (byDay.get(dayKey(selected)) ?? []) : [];

  // Vanta keeps a short window, so a month outside it is unread rather than empty.
  const windowEnd = new Date(Date.now() + 30 * 86_400_000);
  const windowStart = new Date(Date.now() - 86_400_000);
  const outsideWindow = to < windowStart || from > windowEnd;

  const step = (n: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
    setCursor(next);
    setSelected(sameDay(next, startOfMonth(today)) ? today : null);
  };

  return (
    <CollapsibleSection
      title="Month"
      storageKey="schedule.month"
      icon={<CalendarDays className="h-3.5 w-3.5" />}
      summary={`${monthName} · ${events.length} ${events.length === 1 ? "entry" : "entries"} read`}
      action={
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => step(-1)}
            aria-label="Previous month"
            className={cn("flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground", MOTION_FOCUS)}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setCursor(startOfMonth(today)); setSelected(today); }}
            className={cn("min-h-[36px] px-1 text-xs text-primary hover:underline", MOTION_FOCUS)}
          >
            This month
          </button>
          <button
            onClick={() => step(1)}
            aria-label="Next month"
            className={cn("flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground", MOTION_FOCUS)}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      }
    >
      {error ? (
        <ErrorState detail={error} onRetry={refresh} />
      ) : (
        <div className="space-y-3">
          <p className="text-center text-[12.5px] font-medium tracking-tight" aria-live="polite">
            {monthName}
          </p>

          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${monthName} calendar`}>
            {WEEKDAYS.map((w, i) => (
              <div key={`${w}${i}`} className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                {w}
              </div>
            ))}

            {cells.map((d, i) => {
              if (!d) return <div key={`blank-${i}`} aria-hidden />;
              const list = byDay.get(dayKey(d)) ?? [];
              const density = load(list.length);
              const isToday = sameDay(d, today);
              const isSelected = selected ? sameDay(d, selected) : false;
              return (
                <button
                  key={dayKey(d)}
                  onClick={() => setSelected(d)}
                  aria-label={`${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} — ${list.length} ${list.length === 1 ? "entry" : "entries"}`}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-[44px] flex-col items-center justify-center rounded-md border text-[12px] transition-colors",
                    MOTION_FOCUS,
                    isSelected
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : density === "busy"
                        ? "border-primary/25 bg-primary/[0.07] text-foreground"
                        : density === "light"
                          ? "border-border/60 bg-surface-elevated/40 text-foreground"
                          : "border-border/40 bg-transparent text-muted-foreground",
                  )}
                >
                  <span className={cn("leading-none", isToday && "font-semibold underline decoration-primary/60 underline-offset-2")}>
                    {d.getDate()}
                  </span>
                  <span className="mt-1 flex h-1.5 items-center gap-0.5" aria-hidden>
                    {list.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={cn("h-1.5 w-1.5 rounded-full", e.project_id ? "bg-primary" : "bg-muted-foreground/50")}
                      />
                    ))}
                    {list.length > 3 && <span className="text-[9px] leading-none text-muted-foreground">+{list.length - 3}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <LoadingState rows={1} label="Reading the month" />
          ) : outsideWindow ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Vanta keeps roughly a month ahead and a day behind, so this month has not been read. Move back to this
              month to see real entries.
            </p>
          ) : events.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Nothing read for {monthName}. Either the linked calendars are genuinely clear, or one of them is not
              answering — the calendar list below says which.
            </p>
          ) : null}

          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {selected
                ? selected.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
                : "Pick a day"}
            </p>
            {!selected ? (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Tap a date to see what is on it.
              </p>
            ) : selectedList.length === 0 ? (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Nothing on that day that Vanta can see.
              </p>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                {selectedList.map((e) => (
                  <AgendaRow key={e.id} event={e} onSetProject={(ev, p) => setProject(ev.id, p)} />
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            A filled dot is an entry you filed under a project. Reading only — nothing here changes any calendar.
          </p>
          <AftermathHint text="Filing an entry under a project keeps it with that work · appears in the project brief" />
        </div>
      )}
    </CollapsibleSection>
  );
}
