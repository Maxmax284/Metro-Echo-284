// WeekPlanner — one week, day by day, so a week can actually be planned.
//
// Doctrine:
//   - Three lanes on a day: what is on the calendar, what you promised, what you
//     wrote. Nothing else, and each lane can be switched off.
//   - Subscribed calendars stay read-only sense. Only Echo's own entries are
//     editable, and the pencil only appears on those.
//   - Google is a stated outcome, never an assumption: the mirror switch says
//     what it does, and an entry Google refused says so on its own row.
//   - Silence is a valid read: an empty day says it is empty.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { useAgenda, type AgendaEvent } from "@/hooks/useAgenda";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useCalendarOpenRefresh } from "@/hooks/useCalendarOpenRefresh";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/state-views";
import { EchoEventSheet } from "@/components/schedule/EchoEventSheet";
import { RemindMeButton } from "@/components/schedule/RemindMeButton";
import { loadRemindedSubjects, watchSubjectFor } from "@/lib/remindMe";
import { CommitmentActions } from "@/components/commitments/CommitmentActions";
import { getGoogleMirrorOn, setGoogleMirrorOn } from "@/lib/echoCalendar";
import { vantaToast as toast } from "@/lib/vantaVoice";
import {
  Bell,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  MapPin,
  Pencil,
  Plus,
} from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import {
  bucketByDay,
  dayKeyLocal,
  daySummary,
  endOfWeek,
  dropEchoedPromises,
  projectNamesForDay,

  shiftWeeks,
  startOfWeek,
  weekDates,
  weekHeading,
} from "@/lib/weekPlan";

type Promise_ = {
  id: string;
  summary: string;
  due_at: string | null;
  remind_at: string | null;
  status: string;
};
type NoteRow = { id: string; title: string | null; body: string | null; created_at: string };

type Lane = "appointments" | "promises" | "notes";

export function WeekPlanner() {
  const { session, user } = useAuth();
  const { timezone } = useUserTimezone();
  const { applyScope, key: scopeKey } = useScope();

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const from = useMemo(() => weekStart, [weekStart]);
  const to = useMemo(() => endOfWeek(weekStart), [weekStart]);

  const { events, projects, loading: eventsLoading, refresh, setProject } = useAgenda({ from, to });

  const [promises, setPromises] = useState<Promise_[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [projectByItem, setProjectByItem] = useState<Record<string, string>>({});
  const [sideLoading, setSideLoading] = useState(true);

  const [lanes, setLanes] = useState<Record<Lane, boolean>>({
    appointments: true,
    promises: true,
    notes: true,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaEvent | null>(null);
  const [newDay, setNewDay] = useState<Date | null>(null);
  const [mirrorOn, setMirrorOn] = useState(true);
  const [mirrorBusy, setMirrorBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void getGoogleMirrorOn(user.id).then(setMirrorOn).catch(() => {});
  }, [user?.id]);

  /* The promises and notes half of the week. The calendar half is useAgenda's. */
  const loadSide = async () => {
    if (!session) return;
    setSideLoading(true);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const [c, n] = await Promise.all([
      applyScope(supabase.from("commitments").select("id, summary, due_at, remind_at, status"))
        .neq("status", "cancelled")
        .or(`and(due_at.gte.${fromIso},due_at.lte.${toIso}),and(remind_at.gte.${fromIso},remind_at.lte.${toIso})`)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(200),
      applyScope(supabase.from("notes").select("id, title, body, created_at"))
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);
    const noteRows = (n.data ?? []) as NoteRow[];
    setPromises((c.data ?? []) as Promise_[]);
    setNotes(noteRows);

    /* A note's filing is the person's own structure, so show it where they filed it. */
    const ids = noteRows.map((r) => r.id);
    if (ids.length) {
      const { data: links } = await supabase
        .from("project_items")
        .select("item_id, projects(title)")
        .eq("item_type", "note")
        .in("item_id", ids);
      const map: Record<string, string> = {};
      for (const l of (links ?? []) as any[]) {
        const t = l.projects?.title;
        if (t) map[l.item_id] = t;
      }
      setProjectByItem(map);
    } else {
      setProjectByItem({});
    }
    setSideLoading(false);
  };

  useEffect(() => {
    void loadSide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey, from.getTime(), to.getTime()]);

  useCalendarOpenRefresh(() => {
    void refresh();
    void loadSide();
  });

  const toggleMirror = async (on: boolean) => {
    if (!user) return;
    setMirrorBusy(true);
    try {
      await setGoogleMirrorOn(user.id, on);
      setMirrorOn(on);
      toast.success(
        on
          ? "Entries you add here land in Google too, and changes there come back."
          : "Echo keeps new entries to itself. What Google already holds stays there.",
      );
    } catch {
      toast.error("That switch would not save.");
    } finally {
      setMirrorBusy(false);
    }
  };

  const eventsByDay = useMemo(() => bucketByDay(events, (e) => e.starts_at), [events]);

  /* Entries the person asked about themselves. Their word outranks inference. */
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const loadReminded = async () => {
    if (events.length === 0) return setReminded(new Set());
    try {
      setReminded(await loadRemindedSubjects(events.map((e) => watchSubjectFor(e))));
    } catch {
      /* No badge beats a wrong badge. */
    }
  };
  useEffect(() => {
    void loadReminded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length]);
  const promisesByDay = useMemo(
    () => bucketByDay(promises, (p) => p.due_at ?? p.remind_at),
    [promises],
  );
  const notesByDay = useMemo(() => bucketByDay(notes, (n) => n.created_at), [notes]);

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const todayKey = dayKeyLocal(new Date());

  const timeLabel = (e: AgendaEvent) => {
    if (e.all_day) return "all day";
    return formatInTimeZone(new Date(e.starts_at), timezone, "h:mm a");
  };

  const loading = eventsLoading || sideLoading;

  return (
    <div className="space-y-3">
      {/* Which week, and how much of it to show. */}
      <Card className="vanta-card border-border/60 bg-surface-elevated/40 p-3">
        <div className="flex items-center gap-2">
          <button
            aria-label="Previous week"
            className="min-h-[44px] min-w-[44px] rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
            onClick={() => setWeekStart((s) => shiftWeeks(s, -1))}
          >
            <ChevronLeft className="mx-auto h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 text-center text-[12.5px] font-medium">
            {weekHeading(weekStart)}
          </div>
          <button
            aria-label="Next week"
            className="min-h-[44px] min-w-[44px] rounded-md border border-border/60 text-muted-foreground hover:text-foreground"
            onClick={() => setWeekStart((s) => shiftWeeks(s, 1))}
          >
            <ChevronRight className="mx-auto h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="min-h-[36px] text-[11.5px]"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            This week
          </Button>
          {([
            { id: "appointments" as Lane, label: "Appointments" },
            { id: "promises" as Lane, label: "Promises" },
            { id: "notes" as Lane, label: "Notes" },
          ]).map((l) => (
            <button
              key={l.id}
              onClick={() => setLanes((prev) => ({ ...prev, [l.id]: !prev[l.id] }))}
              aria-pressed={lanes[l.id]}
              className={cn(
                "min-h-[36px] rounded-full border px-3 text-[11.5px] transition-colors",
                lanes[l.id]
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2">
          <Label htmlFor="week-google-mirror" className="text-[11.5px] leading-relaxed">
            Keep entries you add in Google too
          </Label>
          <Switch
            id="week-google-mirror"
            checked={mirrorOn}
            disabled={mirrorBusy}
            onCheckedChange={(on) => void toggleMirror(on)}
          />
        </div>
      </Card>

      {loading ? (
        <LoadingState label="Reading the week…" />
      ) : (
        dates.map((d) => {
          const k = dayKeyLocal(d);
          const dayEvents = lanes.appointments ? (eventsByDay[k] ?? []) : [];
          const dayPromises = lanes.promises
            ? dropEchoedPromises(promisesByDay[k] ?? [], dayEvents.map((e) => e.title), (p) => p.summary)
            : [];

          const dayNotes = lanes.notes ? (notesByDay[k] ?? []) : [];
          const tags = projectNamesForDay([
            ...dayEvents.map((e) => e.projectTitle),
            ...dayNotes.map((n) => projectByItem[n.id]),
          ]);
          const isToday = k === todayKey;
          return (
            <Card
              key={k}
              className={cn(
                "vanta-card border-border/60 bg-surface-elevated/40 p-3",
                isToday && "border-primary/40",
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                    {isToday && <span className="text-primary">· today</span>}
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    {daySummary({
                      appointments: dayEvents.length,
                      promises: dayPromises.length,
                      notes: dayNotes.length,
                    })}
                  </p>
                </div>
                <button
                  aria-label={`Add an entry on ${d.toDateString()}`}
                  className="min-h-[44px] min-w-[44px] shrink-0 rounded-md border border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary"
                  onClick={() => {
                    setEditing(null);
                    setNewDay(d);
                    setSheetOpen(true);
                  }}
                >
                  <Plus className="mx-auto h-4 w-4" />
                </button>
              </div>

              {tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-[10.5px] text-primary ring-1 ring-primary/25"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {dayEvents.length + dayPromises.length + dayNotes.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {dayEvents.map((e) => (
                    <li key={e.id} className="flex items-start gap-2 text-[12.5px]">
                      <span className="mt-[3px] w-[62px] shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {timeLabel(e)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{e.title ?? "Untitled entry"}</div>
                        <div className="flex flex-wrap items-center gap-x-2 text-[10.5px] text-muted-foreground">
                          <span>{e.feedLabel}</span>
                          {e.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-2.5 w-2.5" /> {e.location}
                            </span>
                          )}
                          {e.projectTitle && <span className="text-primary">{e.projectTitle}</span>}
                          {/* Only ever what the row recorded about the mirror. */}
                          {e.origin === "echo" && e.sync_state === "error" && (
                            <span className="text-destructive">Google would not take this one</span>
                          )}
                          {e.origin === "echo" && e.sync_state === "synced" && <span>In Google too</span>}
                        </div>
                      </div>
                      {/* Their own ask about one entry, louder than Echo's judgement. */}
                      {!e.all_day && (
                        <RemindMeButton
                          event={e}
                          reminded={reminded.has(watchSubjectFor(e))}
                          onChanged={() => void loadReminded()}
                        />
                      )}
                      {e.origin === "echo" ? (
                        <button
                          aria-label={`Edit ${e.title ?? "this entry"}`}
                          className="min-h-[44px] shrink-0 px-2 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setEditing(e);
                            setNewDay(null);
                            setSheetOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </li>
                  ))}

                  {dayPromises.map((p) => {
                    const at = p.due_at ?? p.remind_at;
                    const done = p.status === "done";
                    return (
                      <li key={p.id} className="flex items-start gap-2 text-[12.5px]">
                        <span className="mt-[3px] w-[62px] shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {at ? formatInTimeZone(new Date(at), timezone, "h:mm a") : "—"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className={cn("truncate", done && "text-muted-foreground line-through")}>
                            {p.summary}
                          </div>
                          <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                            <Bell className="h-2.5 w-2.5" />
                            {p.remind_at && !p.due_at ? "reminder" : "promise"}
                          </div>
                        </div>
                        <CommitmentActions c={p as any} size="sm" onChanged={() => void loadSide()} />
                      </li>
                    );
                  })}

                  {dayNotes.map((n) => (
                    <li key={n.id} className="flex items-start gap-2 text-[12.5px]">
                      <span className="mt-[3px] w-[62px] shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {formatInTimeZone(new Date(n.created_at), timezone, "h:mm a")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{n.title?.trim() || n.body?.slice(0, 60) || "Note"}</div>
                        <div className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                          <FileText className="h-2.5 w-2.5" /> written this day
                          {projectByItem[n.id] && <span className="text-primary">· {projectByItem[n.id]}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })
      )}

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Subscribed calendars are read-only — Echo only writes the entries you add here. With the switch on, those go to
        Google as well and a change made in Google comes back on the next read. Promises and notes stay inside Metro
        Echo and never touch Google.
      </p>

      <EchoEventSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        event={editing}
        defaultStart={newDay}
        projects={projects}
        onSaved={() => {
          void refresh();
          void loadSide();
        }}
      />
    </div>
  );
}
