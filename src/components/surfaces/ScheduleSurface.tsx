import { FlowRail, FLOWS } from "@/components/work/FlowRail";
import { PushPrompt } from "@/components/schedule/PushPrompt";
import { useEffect, useState } from "react";
import { useCalendarOpenRefresh } from "@/hooks/useCalendarOpenRefresh";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/lib/auth";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { Card } from "@/components/ui/card";
import { Calendar, Bell, CheckSquare, FileText, ListChecks, Inbox, CalendarClock } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { DailyBriefingCard } from "@/components/schedule/DailyBriefingCard";
import { ScheduleQueryChips } from "@/components/schedule/ScheduleQueryChips";
import { CalendarSyncPanel } from "@/components/schedule/CalendarSyncPanel";
import { CalendarOnlyView } from "@/components/schedule/CalendarOnlyView";
import { MonthGrid } from "@/components/schedule/MonthGrid";
import { AgendaBoard } from "@/components/schedule/AgendaBoard";
import { BodyDesk } from "@/components/schedule/BodyDesk";
import { MoneyDesk } from "@/components/schedule/MoneyDesk";
import { HelpDesk } from "@/components/schedule/HelpDesk";
import { FlightDesk } from "@/components/schedule/FlightDesk";
import { WeekPlanner } from "@/components/schedule/WeekPlanner";

import { CommitmentActions } from "@/components/commitments/CommitmentActions";
import { AgendaRow } from "@/components/calendar/AgendaRow";
import { useAgenda } from "@/hooks/useAgenda";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { SCHEDULE_TAB_EVENT, takeScheduleTab } from "@/lib/scheduleTab";

type TabKey = "today" | "upcoming" | "week" | "board" | "body" | "money" | "help" | "flights" | "month" | "calendar";
const KNOWN_TABS: TabKey[] = ["today", "upcoming", "week", "board", "body", "money", "help", "flights", "month", "calendar"];

/* Desks that used to sit in this tab strip. They still render here so an old
   link lands where it always did, but they belong to Work now. */
const DESK_TABS = ["board", "body", "money", "flights", "help"] as const;
type DeskTab = (typeof DESK_TABS)[number];
const DESK_LABEL: Record<DeskTab, string> = {
  board: "The agenda board",
  body: "Body",
  money: "Money",
  flights: "Flights",
  help: "Local help",
};

type Commitment = { id: string; summary: string; due_at: string | null; remind_at: string | null; status: string };
type FileRow = { id: string; filename: string; status: string; metadata: any; created_at: string };


export function ScheduleSurface({ onNavigate }: { onNavigate?: (k: SurfaceKey) => void }) {
  const { session, user } = useAuth();
  const { timezone } = useUserTimezone();
  const { applyScope, withScope, key: scopeKey } = useScope();
  // The calendar half of the day. Read-only, and the same rows Echo reasons on.
  const { events: agendaEvents, loading: agendaLoading, setProject, refresh: refreshAgenda } = useAgenda({ days: 7 });
  useCalendarOpenRefresh(() => { void refreshAgenda(); });
  /* A desk can be linked to directly — ?tab=flights lands on the flight desk,
     so /flights is one tap from anywhere. */
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "today";
    const wanted = takeScheduleTab() ?? new URLSearchParams(window.location.search).get("tab");
    return KNOWN_TABS.includes(wanted as TabKey) ? (wanted as TabKey) : "today";
  });

  /* A Work tile can ask for a desk while this room is already open. */
  useEffect(() => {
    const h = (e: Event) => {
      const wanted = (e as CustomEvent<string>).detail;
      if (KNOWN_TABS.includes(wanted as TabKey)) setTab(wanted as TabKey);
    };
    window.addEventListener(SCHEDULE_TAB_EVENT, h);
    return () => window.removeEventListener(SCHEDULE_TAB_EVENT, h);
  }, []);

  const [commits, setCommits] = useState<Commitment[]>([]);
  const [reviewCaptures, setReviewCaptures] = useState<number>(0);
  const [reviewFiles, setReviewFiles] = useState<FileRow[]>([]);
  const [pendingActions, setPendingActions] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (session) load(); }, [session, scopeKey]);

  // Doctrine: every surface change leaves a receipt. Debounced 1.5s to avoid spam.
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      supabase.from("audit_log").insert(withScope({
        user_id: user.id,
        entity_type: "schedule",
        event: "schedule.viewed",
        payload: { tab },
      }));
    }, 1500);
    return () => clearTimeout(t);
  }, [tab, user]);

  async function load() {
    setLoading(true);
    const in7 = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const [c, m, f, a] = await Promise.all([
      applyScope(supabase.from("commitments")
        .select("id, summary, due_at, remind_at, status, metadata"))
        .neq("status", "done").neq("status", "cancelled")
        .or(`due_at.lte.${in7},remind_at.lte.${in7}`)
        .order("due_at", { ascending: true, nullsFirst: false }).limit(100),
      applyScope(supabase.from("messages")
        .select("id", { count: "exact", head: true }))
        .eq("role", "user")
        .filter("metadata->>needs_review", "eq", "true"),
      applyScope(supabase.from("ingested_files")
        .select("id, filename, status, metadata, created_at"))
        .order("created_at", { ascending: false }).limit(30),
      applyScope(supabase.from("actions")
        .select("id", { count: "exact", head: true }))
        .in("status", ["proposed", "staged"]),
    ]);
    setCommits((c.data ?? []) as Commitment[]);
    setReviewCaptures(m.count ?? 0);
    setReviewFiles(((f.data ?? []) as FileRow[]).filter((x) => !x.metadata?.document_type && x.status === "done" && !x.metadata?.archived).slice(0, 20));
    setPendingActions(a.count ?? 0);
    setLoading(false);
  }

  const now = Date.now();
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);

  const dueDate = (c: Commitment) => c.due_at || c.remind_at;
  const overdueList = commits.filter((c) => {
    const d = dueDate(c); if (!d) return false;
    return new Date(d).getTime() < startToday.getTime();
  });
  const todayList = commits.filter((c) => {
    const d = dueDate(c); if (!d) return false;
    const t = new Date(d).getTime();
    return t >= startToday.getTime() && t <= endToday.getTime();
  });
  const upcoming = commits.filter((c) => {
    const d = dueDate(c); if (!d) return false;
    const t = new Date(d).getTime();
    return t > endToday.getTime();
  });

  // Day view: what the calendar says about today, alongside what you owe.
  const todayEvents = agendaEvents.filter((e) => {
    const t = new Date(e.starts_at).getTime();
    return t >= startToday.getTime() && t <= endToday.getTime();
  });

  // The week is its own planner now — see WeekPlanner.




  return (
    <div className="flex-1 overflow-y-auto pb-24 md:pb-6">
      <div className="mx-auto w-full max-w-3xl space-y-3 px-3 pt-3 md:px-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight">Schedule</h2>
          <span className="ml-auto text-[10.5px] text-muted-foreground">{timezone}</span>
        </div>

        {tab === "today" && <PushPrompt />}
        {tab === "today" && <FlowRail beats={FLOWS.schedule} />}

        {/* Schedule is time only: the day, what's next, the week. The desks
            (Board, Body, Money, Flights, Local help) live in Work under "Go
            straight there" — the links here still work so nothing that already
            points at a desk breaks, but a desk announces where it lives. */}
        {DESK_TABS.includes(tab as DeskTab) ? (
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">
              {DESK_LABEL[tab as DeskTab]} lives in Work now.
            </span>
            <a href="/?surface=work" className="min-h-[36px] text-primary hover:underline">
              Open Work
            </a>
            <button onClick={() => setTab("today")} className="ml-auto min-h-[36px] text-primary hover:underline">
              Back to your day
            </button>
          </div>
        ) : (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
            {([
              { id: "today", label: "Day" },
              { id: "upcoming", label: "Upcoming" },
              { id: "week", label: "Week" },
              { id: "month", label: "Month" },
              { id: "calendar", label: "Calendar only" },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-[12px] transition-colors",
                  tab === t.id ? "border-primary/40 bg-primary/15 text-primary" : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}


        {tab === "calendar" ? (
          <CalendarOnlyView />
        ) : tab === "money" ? (
          <MoneyDesk />
        ) : tab === "help" ? (
          <HelpDesk />
        ) : tab === "flights" ? (
          <FlightDesk />
        ) : tab === "body" ? (
          <BodyDesk />
        ) : tab === "board" ? (
          <div className="space-y-3">
            <AgendaBoard />
            <CalendarSyncPanel onOpenSettings={() => { window.location.href = "/settings/g/calendar"; }} />
          </div>
        ) : loading ? (
          <div className="py-10 text-center text-[12px] text-muted-foreground">Looking at the runway…</div>
        ) : tab === "today" ? (
          <div className="space-y-3">
            <DailyBriefingCard />
            <ScheduleQueryChips />
            <SummaryStrip
              reminders={todayList.filter((c) => !!c.remind_at).length}
              commitments={todayList.filter((c) => !c.remind_at).length}
              captures={reviewCaptures}
              files={reviewFiles.length}
              actions={pendingActions}
            />
            {overdueList.length > 0 && (
              <Section title="Overdue" Icon={Bell} empty="">
                {overdueList.map((c) => <CommitmentRow key={c.id} c={c} tz={timezone} onChanged={load} />)}
              </Section>
            )}
            <Section
              title="On the calendar today"
              Icon={CalendarClock}
              empty={
                agendaLoading
                  ? "Reading the calendars…"
                  : "Nothing on the calendar today that Echo can see. Linked calendars are listed at the bottom of this page."
              }
            >
              {todayEvents.map((e) => (
                <li key={e.id}>
                  <AgendaRow event={e} onSetProject={(ev, p) => setProject(ev.id, p)} />
                </li>
              ))}
            </Section>
            <Section title="Due today" Icon={CheckSquare} empty="Nothing due. Quiet runway.">
              {todayList.map((c) => <CommitmentRow key={c.id} c={c} tz={timezone} onChanged={load} />)}
            </Section>
            <Section title="Files waiting on you" Icon={FileText} empty="No files waiting." onOpen={() => onNavigate?.("memory")}>
              {reviewFiles.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-[12.5px]">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{f.filename}</span>
                  <span className="ml-auto text-[10.5px] text-warn">needs a label</span>
                </li>
              ))}
            </Section>
            <QuickJump onNavigate={onNavigate} captures={reviewCaptures} actions={pendingActions} />
            <CalendarSyncPanel onOpenSettings={() => { window.location.href = "/settings/g/calendar"; }} />
          </div>
        ) : tab === "upcoming" ? (
          <div className="space-y-2">
            {upcoming.length === 0 ? (
              <Empty>Nothing scheduled in the next 7 days.</Empty>
            ) : upcoming.map((c) => <CommitmentRow key={c.id} c={c} tz={timezone} dense onChanged={load} />)}
          </div>
        ) : tab === "month" ? (
          <div className="space-y-3">
            <MonthGrid />
            <CalendarSyncPanel onOpenSettings={() => { window.location.href = "/settings/g/calendar"; }} />
          </div>
        ) : (
          <div className="space-y-3">
            <WeekPlanner />
            <CalendarSyncPanel onOpenSettings={() => { window.location.href = "/settings/g/calendar"; }} />
          </div>
        )}


        <SurfaceAftermath surface="schedule" />
      </div>
    </div>
  );
}

function Section({ title, Icon, empty, onOpen, children }: { title: string; Icon: any; empty: string; onOpen?: () => void; children: any }) {
  const items = Array.isArray(children) ? children : [children];
  const isEmpty = !items || items.filter(Boolean).length === 0;
  return (
    <Card className="border-border/60 bg-surface-elevated/40 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {title}
        {onOpen && <button className="ml-auto text-[11px] normal-case text-primary hover:underline" onClick={onOpen}>Open</button>}
      </div>
      {isEmpty && empty ? <p className="text-[12px] text-muted-foreground">{empty}</p> : (
        <ul className="space-y-1.5">{children}</ul>
      )}
    </Card>
  );
}

function Empty({ children }: { children: string }) {
  return <div className="rounded-md border border-dashed border-border/60 py-10 text-center text-[12px] text-muted-foreground">{children}</div>;
}

function CommitmentRow({ c, tz, dense, onChanged }: { c: Commitment; tz: string; dense?: boolean; onChanged?: () => void }) {
  const d = c.due_at || c.remind_at;
  const overdue = d ? new Date(d).getTime() < Date.now() : false;
  const isReminder = !!c.remind_at;
  return (
    <li className={cn("flex items-start gap-2 text-[12.5px]", dense && "py-0.5")}>
      {isReminder ? <Bell className="mt-1.5 h-3 w-3 text-primary" /> : <CheckSquare className="mt-1.5 h-3 w-3 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate", overdue && "text-warn")}>{c.summary}</div>
        {d && (
          <div className="text-[10.5px] text-muted-foreground">
            {overdue ? "overdue " : ""}{formatInTimeZone(new Date(d), tz, "h:mm a · MMM d")}
          </div>
        )}
      </div>
      <CommitmentActions c={c} size="sm" onChanged={onChanged} />
    </li>
  );
}

function SummaryStrip({ reminders, commitments, captures, files, actions }: { reminders: number; commitments: number; captures: number; files: number; actions: number }) {
  const parts: string[] = [];
  if (reminders) parts.push(`${reminders} reminder${reminders === 1 ? "" : "s"}`);
  if (commitments) parts.push(`${commitments} commitment${commitments === 1 ? "" : "s"}`);
  if (captures) parts.push(`${captures} capture${captures === 1 ? "" : "s"} waiting`);
  if (files) parts.push(`${files} file${files === 1 ? "" : "s"} need a label`);
  if (actions) parts.push(`${actions} action${actions === 1 ? "" : "s"} waiting on your OK`);
  const line = parts.length ? `Today: ${parts.join(", ")}.` : "Today: nothing on the board.";
  return (
    <Card className="border-border/60 bg-surface-elevated/60 p-3 text-[13px] text-foreground/90">
      {line}
    </Card>
  );
}

function QuickJump({ onNavigate, captures, actions }: { onNavigate?: (k: SurfaceKey) => void; captures: number; actions: number }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => onNavigate?.("memory")} className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-elevated/40 p-3 text-left text-[12.5px] hover:border-primary/40">
        <Inbox className="h-4 w-4 text-primary" />
        <div>
          <div className="font-medium">Captures</div>
          <div className="text-[10.5px] text-muted-foreground">{captures} waiting</div>
        </div>
      </button>
      <button onClick={() => onNavigate?.("actions")} className="flex items-center gap-2 rounded-lg border border-border/60 bg-surface-elevated/40 p-3 text-left text-[12.5px] hover:border-primary/40">
        <ListChecks className="h-4 w-4 text-primary" />
        <div>
          <div className="font-medium">Approvals</div>
          <div className="text-[10.5px] text-muted-foreground">{actions} waiting on your OK</div>
        </div>
      </button>
    </div>
  );
}
