// AgendaBoard — the agenda as a workspace, not a list.
//
// Doctrine:
//   - Four facts per entry, and only when the entry actually carried them: when,
//     how long, where, who. A blank is honest; a filled-in guess is not.
//   - The same entry arriving from two calendars is one entry. The dedupe rule is
//     the shared one, so the board and Echo's answers agree about a day.
//   - A stay is not an appointment. What you are in the middle of gets its own
//     line at the top with the nights left, instead of repeating on every day.
//   - Feed rows stay read-only sense; only Echo's own entries carry a pencil.
//   - Mobile is the battlefield: 44px cells, one column, no sideways scroll.
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Pencil, Users, BedDouble } from "lucide-react";
import { FlowRail, FLOWS } from "@/components/work/FlowRail";
import { Card } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { EchoEventSheet } from "@/components/schedule/EchoEventSheet";
import { AgendaLiveStrip } from "@/components/schedule/AgendaLiveStrip";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useAgenda, type AgendaEvent } from "@/hooks/useAgenda";
import { useCalendarOpenRefresh } from "@/hooks/useCalendarOpenRefresh";
import { useBody } from "@/hooks/useBody";
import { useBank } from "@/hooks/useBank";
import { useFlightPlans } from "@/hooks/useFlightPlans";
import { useCareNearby } from "@/hooks/useCareNearby";
import { Button } from "@/components/ui/button";
import { vantaToast } from "@/lib/vantaVoice";
import { FLIGHT_LAW, optionWords, planSourceWords, planTitle, sortOptions } from "@/lib/flightPlan";
import { dayMoneyLine } from "@/lib/bankPlan";
import { dosesOn } from "@/lib/bodyLog";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatInTimeZone } from "date-fns-tz";
import {
  boardFacts,
  currentStay,
  dedupeBoard,
  isStay,
  stayLine,
} from "@/lib/agendaBoard";
import { applyLiveFlightTimes, liveMarkerWords } from "@/lib/agendaFlightTimes";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function leadingBlanks(first: Date) {
  return (first.getDay() + 6) % 7;
}

export function AgendaBoard() {
  const { timezone } = useUserTimezone();
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [editing, setEditing] = useState<AgendaEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const from = useMemo(() => startOfMonth(cursor), [cursor]);
  const to = useMemo(() => endOfMonth(cursor), [cursor]);
  const { events, projects, loading, error, refresh } = useAgenda({ from, to });
  useCalendarOpenRefresh(() => { void refresh(); });
  const { meds } = useBody();
  const { transactions } = useBank(31);
  const { plans, confirm } = useFlightPlans();
  const { kept } = useCareNearby();
  const [confirming, setConfirming] = useState(false);

  const rows = useMemo(() => dedupeBoard(events), [events]);
  const stay = useMemo(() => currentStay(rows), [rows]);

  /* A day holds an entry when the entry touches it — a stay touches every day it
     covers, so the board never pretends a stay happened only on arrival day. */
  const byDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>();
    for (const e of rows) {
      const start = new Date(e.starts_at);
      const end = e.ends_at ? new Date(e.ends_at) : start;
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      while (cur.getTime() <= end.getTime()) {
        const k = dayKey(cur);
        (map.get(k) ?? map.set(k, []).get(k)!).push(e);
        cur.setDate(cur.getDate() + 1);
        if (map.size > 400) break;
      }
    }
    return map;
  }, [rows]);

  const monthDays = useMemo(() => {
    const out: Date[] = [];
    const last = endOfMonth(cursor).getDate();
    for (let i = 1; i <= last; i++) out.push(new Date(cursor.getFullYear(), cursor.getMonth(), i));
    return out;
  }, [cursor]);

  /* A filed flight keeps the hours the airline is actually keeping. The rail and
     the list read the same re-timed rows, so they can never disagree about a day. */
  const dayRows = useMemo(() => {
    const rows = (byDay.get(dayKey(selected)) ?? []).slice().sort((a, b) => {
      if (isStay(a) !== isStay(b)) return isStay(a) ? -1 : 1;
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
    return applyLiveFlightTimes(rows, plans).sort((a, b) => {
      if (isStay(a) !== isStay(b)) return isStay(a) ? -1 : 1;
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
  }, [byDay, selected, plans]);

  /* What the day cost, from entries the bank recorded. Silent when it recorded none. */
  const dayMoney = useMemo(
    () => dayMoneyLine(transactions, `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}-${String(selected.getDate()).padStart(2, "0")}`),
    [transactions, selected],
  );

  /* Doses belong to the day, beside the appointments, not in a separate room. */
  const dayDoses = useMemo(() => dosesOn(meds, selected), [meds, selected]);

  /* Flights prepared for this day, still waiting on a yes. Confirming here is
     the person's own tap: it records the flight, it buys nothing. */
  const dayFlights = useMemo(
    () => plans.filter((p) => p.status === "prepared" && p.depart_on === dayKey(selected)),
    [plans, selected],
  );

  const clock = (iso: string) => {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? formatInTimeZone(d, timezone, "HH:mm") : "\u2014";
  };

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const shift = (n: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + n, 1);
    setCursor(next);
    setSelected(next);
  };

  return (
    <div className="space-y-3">
      <FlowRail beats={FLOWS.agenda} className="mb-1" />
      {stay && (
        <Card className="vanta-card flex items-start gap-2 p-3">
          <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="vanta-machine-label text-foreground/70">Where you're staying</p>
            <p className="text-[12.5px] text-foreground/90">{stayLine(stay)}</p>
          </div>
        </Card>
      )}

      <Card className="vanta-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-[13px] font-medium">{monthLabel}</p>
          <span className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shift(-1)}
              className={cn("rounded-[2px] border border-border/60 p-1.5", MOTION_FOCUS)}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shift(1)}
              className={cn("rounded-[2px] border border-border/60 p-1.5", MOTION_FOCUS)}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <span key={`${w}-${i}`} className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
              {w}
            </span>
          ))}
          {Array.from({ length: leadingBlanks(startOfMonth(cursor)) }).map((_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {monthDays.map((d) => {
            const count = (byDay.get(dayKey(d)) ?? []).length;
            const isSelected = dayKey(d) === dayKey(selected);
            const isToday = dayKey(d) === dayKey(new Date());
            return (
              <button
                key={dayKey(d)}
                type="button"
                onClick={() => setSelected(d)}
                aria-label={`${d.toDateString()}, ${count} ${count === 1 ? "entry" : "entries"}`}
                aria-pressed={isSelected}
                className={cn(
                  "flex h-11 flex-col items-center justify-center rounded-[2px] border text-[12px]",
                  MOTION_FOCUS,
                  isSelected
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border/50 text-foreground/80 hover:border-border",
                  isToday && !isSelected && "border-primary/30",
                )}
              >
                <span>{d.getDate()}</span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                    <span key={i} className="h-1 w-1 rounded-full bg-current opacity-70" />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="vanta-card p-3">
        <p className="vanta-machine-label mb-2 text-foreground/70">
          {selected.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </p>

        {!loading && !error && dayRows.length > 0 && (
          <AgendaLiveStrip entries={dayRows} selectedDayKey={dayKey(selected)} timezone={timezone} />
        )}

        {loading ? (
          <LoadingState label="Reading the calendars…" />
        ) : error ? (
          <ErrorState detail={error} onRetry={() => void refresh()} />
        ) : dayRows.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            Nothing on this day. Entries land here from the calendars Echo reads, and from anything you add yourself.
          </p>
        ) : (
          <ul className="space-y-2">
            {dayRows.map((e) => {
              const f = boardFacts(e);
              const when = e.all_day
                ? "All day"
                : formatInTimeZone(new Date(e.starts_at), timezone, "HH:mm");
              return (
                <li key={`${e.id}-${dayKey(selected)}`} className="border-l-2 border-border/70 pl-2">
                  <div className="flex items-start gap-2">
                    <span className="w-14 shrink-0 text-[12px] tabular-nums text-foreground/70">{when}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-foreground/90">{e.title ?? "Untitled"}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {f.duration && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden /> {f.duration}
                          </span>
                        )}
                        {f.room && (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{f.room}</span>
                          </span>
                        )}
                        {f.people && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" aria-hidden /> {f.people}
                          </span>
                        )}
                        {liveMarkerWords(e.live) && (
                          <span className="text-primary/85">Airline says {liveMarkerWords(e.live)}</span>
                        )}
                        {e.projectTitle && <span className="text-primary/80">{e.projectTitle}</span>}
                        <span className="text-muted-foreground/70">{e.feedLabel}</span>
                      </div>
                    </div>
                    {e.origin === "echo" && (
                      <button
                        type="button"
                        aria-label="Edit this entry"
                        onClick={() => {
                          setEditing(e);
                          setSheetOpen(true);
                        }}
                        className={cn("shrink-0 rounded-[2px] border border-border/60 p-1.5", MOTION_FOCUS)}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {dayMoney && (
          <div className="mt-3 border-t border-border/50 pt-2">
            <p className="vanta-machine-label mb-1 text-foreground/70">Money this day</p>
            <p className="text-[12px] text-foreground/85">{dayMoney}</p>
          </div>
        )}
        {dayDoses.length > 0 && (
          <div className="mt-3 border-t border-border/50 pt-2">
            <p className="vanta-machine-label mb-1 text-foreground/70">Medication this day</p>
            <ul className="space-y-1">
              {dayDoses.map((d, i) => (
                <li key={`${d.med.id}-${d.time}-${i}`} className="flex items-baseline gap-2 text-[12px]">
                  <span className="w-14 shrink-0 tabular-nums text-foreground/70">{d.time}</span>
                  <span className="truncate text-foreground/90">
                    {d.med.name}
                    {d.med.dose ? ` \u00b7 ${d.med.dose}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dayFlights.length > 0 && (
          <div className="mt-3 border-t border-border/50 pt-2">
            <p className="vanta-machine-label mb-1 text-foreground/70">Flight waiting on your yes</p>
            <ul className="space-y-2">
              {dayFlights.map((p) => (
                <li key={p.id} className="space-y-1.5 border-l-2 border-primary/50 pl-2">
                  <p className="text-[12.5px] text-foreground/90">{planTitle(p)}</p>
                  <p className="text-[11px] text-muted-foreground">{planSourceWords(p)} {FLIGHT_LAW}</p>
                  <ul className="space-y-1">
                    {sortOptions(p.options).map((o) => (
                      <li key={o.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">{optionWords(o, clock)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 text-[11px]"
                          disabled={confirming}
                          onClick={async () => {
                            setConfirming(true);
                            try {
                              await confirm(p, o.id);
                              vantaToast.success("Confirmed on your board. No ticket was bought.");
                              await refresh();
                            } catch (e) {
                              vantaToast.warning(e instanceof Error ? e.message : "That could not be confirmed.");
                            } finally {
                              setConfirming(false);
                            }
                          }}
                        >
                          Add flight to my board
                        </Button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
        {kept.length > 0 && (
          <div className="mt-3 border-t border-border/50 pt-2">
            <p className="vanta-machine-label mb-1 text-foreground/70">Care you kept nearby</p>
            <ul className="space-y-1">
              {kept.slice(0, 6).map((k) => (
                <li key={k.id} className="text-[12px] text-foreground/85">
                  {k.label}
                  {k.address ? <span className="text-muted-foreground"> \u00b7 {k.address}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}
        <AftermathHint text="Tap a day to read it. Echo's own entries can be edited here; a subscribed calendar stays read-only." />
      </Card>

      <EchoEventSheet
        open={sheetOpen}
        onOpenChange={(v) => {
          setSheetOpen(v);
          if (!v) setEditing(null);
        }}
        event={editing}
        projects={projects}
        onSaved={() => void refresh()}
      />
    </div>
  );
}
