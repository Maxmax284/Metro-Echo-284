import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/state-views";
import { AskVantaBar } from "@/components/today/AskVantaBar";
import { TodaySectionSheet, type TodaySectionKey } from "@/components/today/TodaySectionSheet";
import { FieldSessionCard } from "@/components/field/FieldSessionCard";
import { EveningReadCard } from "@/components/today/EveningReadCard";
import { ResumeWorkSection } from "@/components/today/ResumeWorkSection";
import { gapMinutes, useAgenda } from "@/hooks/useAgenda";
import { AgendaRow } from "@/components/calendar/AgendaRow";
import { TodayBodyPanel } from "@/components/today/TodayBodyPanel";
import { NoticedRow } from "@/components/today/NoticedRow";
import { QuickModes } from "@/components/today/QuickModes";
import { JumpStrip } from "@/components/today/JumpStrip";
import { GotSomethingChooser } from "@/components/intake/GotSomethingChooser";
import { FirstLapCard } from "@/components/today/FirstLapCard";
import { TimeSourceLine } from "@/components/context/ContextSourceLine";
import { TimezoneFollowPrompt } from "@/components/context/TimezoneFollowPrompt";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { CrossDeviceResume } from "@/components/today/CrossDeviceResume";
import { TodayDigestLine } from "@/components/today/TodayDigestLine";
import { SituationRead } from "@/components/today/SituationRead";
import { PlaceCueStrip } from "@/components/today/PlaceCueStrip";
import { TypeOnLine } from "@/components/today/TypeOnLine";
import { TravelLane } from "@/components/today/TravelLane";
import { TasksLane } from "@/components/today/TasksLane";
import { useTodayPlaceCue } from "@/hooks/useTodayPlaceCue";
import { useTodayPlaceBoard } from "@/hooks/useTodayPlaceBoard";
import { useSituation } from "@/hooks/useSituation";
import { SourceHealthStrip } from "@/components/today/SourceHealthStrip";
import { useSourceHealth } from "@/hooks/useSourceHealth";

import { useLiveFeed } from "@/hooks/useLiveFeed";
import { eventWhere, humanizeEvent } from "@/lib/plainLabels";
import { useScope } from "@/hooks/useScope";
import { useTodayDigest } from "@/hooks/useTodayDigest";
import { applyWeather } from "@/lib/weather";
import { formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Inbox,
  Receipt,
  ArrowRight,
  ShieldCheck,
  Sun,
} from "lucide-react";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { LEAD_BAR, MOTION_ARRIVE, MOTION_BOOT, MOTION_FLIP, MOTION_FOCUS, MOTION_ROW, MOTION_STAMP, feelMs } from "@/lib/motion";
import { untilPhrase } from "@/lib/situation";

import {
  ActivityTrace,
  MachineLabel,
  MachineText,
  RollingNumber,
  SectionRail,
  TickRow,
} from "@/components/ui/instrument";
import { stateOfDay, todayHeadline } from "@/lib/todayDigest";
import { SectionNote } from "@/components/ui/section-note";
import { FreshnessLine } from "@/components/ui/freshness";
import { CardMeta } from "@/components/ui/card-meta";
import { summaryLine, type VantaObject } from "@/lib/vantaNouns";
import { CollapsibleSection, setAllPanels } from "@/components/ui/collapsible-section";
import { ExplainThisButton } from "@/components/ask/ExplainThisButton";
import { sectionNote } from "@/lib/roomCopy";
import { cn } from "@/lib/utils";
import { markFlipOriginFromEvent } from "@/lib/flip";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";



function Section({
  title,
  hint,
  sectionKey,
  icon: Icon,
  reading,
  children,
  action,
  storageKey,
  defaultOpen = true,
  summary,
}: {
  title: string;
  hint?: string;
  /** Stable key for adaptive helper copy. Omit for sections with no note. */
  sectionKey?: string;
  icon: typeof Sun;
  /** A real reading shown in the rail gap — a count, never a label. */
  reading?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  /** Where the fold state is remembered. Defaults to the helper key. */
  storageKey?: string;
  defaultOpen?: boolean;
  /** One line shown while folded. */
  summary?: React.ReactNode;
}) {
  return (
    <CollapsibleSection
      title={title}
      storageKey={storageKey ?? sectionKey ?? title}
      icon={<Icon className="h-3.5 w-3.5" />}
      reading={reading}
      action={action}
      defaultOpen={defaultOpen}
      summary={summary}
    >
      {hint ? (
        sectionKey ? (
          <SectionNote sectionKey={sectionKey}>{hint}</SectionNote>
        ) : (
          <p className="text-[12px] leading-snug text-muted-foreground">{hint}</p>
        )
      ) : null}
      <div className={hint ? "mt-3" : undefined}>{children}</div>
    </CollapsibleSection>
  );
}



function Row({
  label,
  meta,
  tone,
  object,
  state,
  onClick,
}: {
  label: string;
  meta?: string;
  tone?: "warn" | "default";
  /** Canonical object, so the row can say what it is and where it opens. */
  object?: VantaObject;
  /** Plain-English state, read off the record. */
  state?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full min-h-[44px] items-center gap-2 vanta-inset px-3 py-2 text-left hover:bg-surface-elevated/70",
        MOTION_ROW,
        MOTION_FOCUS,
        /* Leading rail: status is a glance, not a read. */
        LEAD_BAR,
        tone === "warn" ? "text-warn" : "text-border",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-foreground/90">{label}</span>
        {object ? <CardMeta object={object} state={state} className="mt-0.5" /> : null}
      </span>
      {meta && !object ? (
        <MachineText className="shrink-0 text-[10px] text-muted-foreground">{meta}</MachineText>
      ) : null}
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}


/** Gap line between two calendar entries, in plain words. */
function gapLine(mins: number): string {
  if (mins < 60) return `${mins} min clear`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m clear` : `${h}h clear`;
}

/**
 * A lane label. Today reads top to bottom as three answers — what is true right
 * now, what is coming, what already happened — so each lane says which of the
 * three you are looking at instead of leaving the reader to infer it from a
 * stack of same-sized cards.
 */
function Lane({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5" aria-label={label}>
      <div className="flex items-baseline gap-2 px-1">
        <MachineLabel className="shrink-0 text-foreground/70">{label}</MachineLabel>
        <span className="h-px min-w-4 flex-1 bg-border/50" aria-hidden />
        <span className="shrink-0 text-[10.5px] leading-snug text-muted-foreground">{hint}</span>
      </div>
      {/* A static hairline pins the lane's rows into one column. It never
          animates — the rail is structure, not an event. */}
      <div className="vanta-lane space-y-3">{children}</div>
    </section>
  );
}

type OngoingEntryRow = ReturnType<typeof useAgenda>["ongoing"][number];

/**
 * One running truth. When its wording changes — a stay now ends on a different
 * day, an entry is about to close — the line turns over once like a split-flap
 * board instead of quietly swapping text. It never re-flips on re-render.
 */
function RunningLine({ entry }: { entry: OngoingEntryRow }) {
  const until = untilPhrase(entry.ends_at, Date.now()) ?? "no end time on file";
  const text = `${entry.title || "Untitled entry"}|${until}`;
  const previous = useRef(text);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (previous.current === text) return;
    previous.current = text;
    setFlipped(true);
    const t = setTimeout(() => setFlipped(false), feelMs(700, { min: 0 }) || 1);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div
      className={cn(
        "flex items-baseline gap-2 vanta-inset px-2.5 py-1.5",
        LEAD_BAR,
        "text-accent",
        flipped && MOTION_FLIP,
      )}
    >
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
        {entry.title || "Untitled entry"}
      </span>
      <MachineText className="shrink-0 text-[10px] text-muted-foreground">{until}</MachineText>
    </div>
  );
}

/** What is already running, in its own lane. Reads only. */
function RunningNow({ ongoing }: { ongoing: OngoingEntryRow[] }) {
  if (ongoing.length === 0) return null;
  return (
    <section className="vanta-card space-y-1.5 px-4 py-3">
      <MachineLabel className="text-foreground/60">On now</MachineLabel>
      {ongoing.slice(0, 3).map((e) => (
        <RunningLine key={e.id} entry={e} />
      ))}
      <p className="pt-0.5 text-[11px] leading-snug text-muted-foreground">
        Read from your calendar. No end time on file means Echo will not guess one.
      </p>
    </section>
  );
}

/** The next couple of calendar entries, folded into What's next. Reads only. */
function AgendaInNext({
  events,
  loading,
  onOpenWeek,
}: {
  events: ReturnType<typeof useAgenda>["events"];
  loading: boolean;
  onOpenWeek?: () => void;
}) {
  if (loading || events.length === 0) return null;
  const shown = events.slice(0, 3);
  const more = events.length - shown.length;
  return (
    <div className="mt-2 border-t border-border/40 pt-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <MachineLabel className="text-foreground/60">On your day</MachineLabel>

        {onOpenWeek ? (
          <button
            type="button"
            onClick={onOpenWeek}
            className={cn("ml-auto min-h-[36px] text-[11px] text-primary hover:underline", MOTION_FOCUS)}
          >
            The week
          </button>
        ) : null}
      </div>
      <div className="space-y-1.5">
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
        <p className="pt-1 text-[11px] text-muted-foreground">
          {more > 0 ? <><MachineText>{more}</MachineText> more on the calendar. </> : null}
          Reading only — nothing here becomes a task on its own.
        </p>
      </div>
    </div>
  );
}

/**
 * TodaySurface — the front door. It answers what matters now, what's next, what
 * changed, and stays quiet when there is nothing to say. Everything is read
 * from the active scope only, and every row hands off to the surface that owns
 * the review → approve → execute → receipt path.
 */
export function TodaySurface({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { destination } = useScope();
  /* The clock's provenance, read once and shown plainly under the day line. */
  const tzState = useUserTimezone();
  const digest = useTodayDigest();
  /* One situational read, built from the same authoritative state Today already
     fetched plus the cadence Echo learned. Read-only. */
  const situation = useSituation(digest);
  const health = useSourceHealth();
  /* One calendar read for the whole surface: what is running now goes in the
     first lane, what is coming goes in the second. Two hooks would mean two
     queries for the same truth. */
  const agenda = useAgenda({ days: 2 });
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [drill, setDrill] = useState<TodaySectionKey | null>(null);
  /* Live layer: the board refetches itself when something genuinely lands. */
  const { live, pulse, connected } = useLiveFeed({ onChange: () => digest.refresh() });

  const {
    loadingCritical,
    loadingBackground,
    backgroundError,
    attention,
    groups,
    dueToday,
    upcoming,
    events,
    allEvents,
    captureCount,
    security,
    quiet,
    noticed,
    dismissNoticed,
    followNoticed,
    refresh,
  } = digest;

  /* Awareness gets one light line above the read, and only when place actually
     changes what the day means. No card, and nothing at all on a quiet day.
     What's on file about this spot sits behind that line, one tap in. */
  const placeBoard = useTodayPlaceBoard();
  const placeCue = useTodayPlaceCue({
    lineCount: situation.read?.lines.length ?? 0,
    explainsRead: !!situation.read?.placeNote,
    timezoneDrift: tzState.drifted && !!tzState.storedTimezone,
    boardLines: placeBoard.board.count,
    pressure: security.tone === "critical" || security.tone === "attention",
  });

  const securityEvents = events.filter((e) => e.event.startsWith("fenrir."));
  /* One "what changed" list: live arrivals on top of the recorded changes,
     deduped, so nothing is reported twice. */
  const liveIds = new Set(live.map((e) => e.id));
  const changedRows = [...live, ...events.filter((e) => !liveIds.has(e.id))];
  const { tone, headline } = todayHeadline({ attention, changedCount: events.length });
  /* One section opens by default — the one that actually deserves the first
     look. The rest collapse to a line that says whether opening is worth it. */
  /* Arrivals are the read's job, and it counts them from the arrival records
     themselves. The hero line does not repeat that count in other words — two
     different numbers for the same thing reads as a lie. */
  const dayLine = stateOfDay({
    overdue: digest.overdue.length,
    waitingOnYou: digest.actions.length,
    dueToday: dueToday.length,
    changed: events.length,
    noticed: !!noticed,
  });

  const nextTotal = dueToday.length + upcoming.length;
  /* Travel is read out of the same calendar rows Today already holds — running
     stays included, so a hotel you are in does not vanish after day one. */
  const travelEvents = [...agenda.ongoing, ...agenda.events];
  const nearest = dueToday[0] ?? upcoming.find((c) => c.due_at) ?? null;
  const nearestLabel = nearest?.due_at
    ? isToday(new Date(nearest.due_at))
      ? "nearest today"
      : isTomorrow(new Date(nearest.due_at))
        ? "nearest tomorrow"
        : `nearest in ${formatDistanceToNow(new Date(nearest.due_at))}`
    : null;
  const openSection: "attention" | "next" | "fresh" | "changed" | null =
    attention.length > 0
      ? "attention"
      : dueToday.length > 0
        ? "next"
        : captureCount > 0
          ? "fresh"
          : events.length > 0
            ? "changed"
            : null;
  /* Sections with nothing in them do not get a header, a note, an empty card
     and a zero count. They get named once, together, at the bottom. */
  const emptyNames = [
    nextTotal === 0 ? "Commitments" : null,
    events.length === 0 ? "Receipts" : null,
    captureCount === 0 ? "Inbox" : null,
  ].filter(Boolean) as string[];
  /* Quiet means: nothing waiting, nothing unusual, nothing fresh. Then the
     secondary feeds collapse to one line instead of three empty cards. */
  const secondaryQuiet =
    quiet && security.tone === "good" && captureCount === 0 && events.length === 0;

  /* Shell weather is owned by the shell (`useShellWeather`) so every room wears
     it. Today still escalates on one thing the shell can't see: a live security
     signal in its own lane. */
  useEffect(() => {
    if (loadingCritical) return;
    if (security.tone === "critical" || security.tone === "attention") applyWeather("pressure");
  }, [loadingCritical, security.tone]);

  /* One-shot signal on the hero when real new change actually lands. It says
     "Echo noticed something", then it is gone. Never left on. */
  const [changeSignal, setChangeSignal] = useState(false);
  const lastChanged = useRef<number | null>(null);
  useEffect(() => {
    if (loadingCritical) return;
    const next = events.length;
    if (lastChanged.current === null) { lastChanged.current = next; return; }
    if (next <= lastChanged.current) { lastChanged.current = next; return; }
    lastChanged.current = next;
    setChangeSignal(true);
    const t = window.setTimeout(() => setChangeSignal(false), feelMs(800, { min: 200 }));
    return () => window.clearTimeout(t);
  }, [events.length, pulse, loadingCritical]);


  return (
    /* Boot order: the room paints hero-first, then the feed rises in sequence,
       so entering Today reads as a rig coming up rather than a page appearing. */
    <div className={cn("mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:py-8", MOTION_BOOT)}>

      {/* Hero — where Echo's presence lives. Ambient purple wash, grain, one
          cut corner. The headline wears the mono face because it is a reading
          of real state, not a marketing line. */}
      <header
        className={cn(
          "vanta-hero vanta-grain vanta-notch px-4 py-4 sm:px-5 sm:py-5",
          changeSignal && "vanta-signal",
        )}
      >
        {/* One compact control cluster. Room name, scope, freshness, and the
            fold sweep — nothing else gets to sit above the first real row. */}
        <div className="flex items-center gap-1.5">
          <Sun className="h-4 w-4 shrink-0 text-accent" />
          <MachineLabel className="text-foreground/70">Today</MachineLabel>
          <Badge variant="outline" className="vanta-machine ml-auto shrink-0 text-[9.5px] uppercase tracking-[0.14em]">
            {destination}
          </Badge>
          <FreshnessLine at={digest.checkedAt} className="hidden sm:inline" />
          <button
            type="button"
            aria-label="Expand every panel"
            title="Expand all"
            onClick={() => setAllPanels(true)}
            className={cn("shrink-0 rounded-[2px] p-1 text-muted-foreground/80 hover:text-foreground", MOTION_FOCUS)}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Collapse every panel"
            title="Collapse all"
            onClick={() => setAllPanels(false)}
            className={cn("shrink-0 rounded-[2px] p-1 text-muted-foreground/80 hover:text-foreground", MOTION_FOCUS)}
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </button>
          {/* The escape hatch: what is this room, answered from written copy. */}
          <ExplainThisButton room="today" className="mr-5" />
        </div>
        {/* One state line. The headline is the read; there is no second
            paragraph restating it in other words. */}
        <h1
          aria-live="polite"
          className={cn(
            // Prose stays in the sans. Mono is reserved for machine data.
            "mt-2.5 text-[25px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[29px]",
            tone === "urgent" ? "text-danger" : "text-foreground",
          )}
        >
          {/* The lead line is Echo speaking, so it writes itself on — once per
              wording, never again on a refetch. */}
          <TypeOnLine text={loadingCritical ? "Reading this space…" : headline} />
        </h1>
        <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">
          {loadingCritical ? "" : dayLine}
        </p>
        {/* Where the clock came from. A browser guess is never presented as
            settled truth. */}
        <TimeSourceLine
          className="mt-1"
          timezone={tzState.timezone}
          source={tzState.storedTimezone ? "profile" : "device"}
          confidence={tzState.storedTimezone ? "high" : "low"}
        />
        {/* Crossed a zone? Echo says so once and offers the switch. It never
            moves the clock quietly — that would move every deadline with it. */}
        {tzState.drifted && tzState.storedTimezone ? (
          <TimezoneFollowPrompt
            storedTimezone={tzState.storedTimezone}
            browserTimezone={tzState.browserTimezone}
            onChanged={(tz) => tzState.applyLocal(tz)}
          />
        ) : null}

        {/* The answer belongs to the hero: the situational read is the first
            thing a person reads, not the seventh block down the page. */}
        <div className="mt-3 border-t border-border/40 pt-3">
          <PlaceCueStrip
            cue={placeCue}
            board={placeBoard.board}
            scanning={placeBoard.scanning}
            onScan={placeBoard.scan}
            onOpen={() => onNavigate("awareness")}
            className="mb-1.5"
          />
          <SituationRead
            read={situation.read}
            loading={situation.loading}
            onOpen={(line) => {
              const target: Record<string, SurfaceKey> = {
                overdue: "commitments",
                due_soon: "commitments",
                waiting_on_you: "actions",
                meeting_soon: "schedule",
                happening_now: "schedule",
                noticed: "awareness",
                went_unusually_quiet: "projects",
                matter_open: "sherlock",
                matter_proposed: "sherlock",
                arrived: "inbox",
              };
              onNavigate(target[line.kind] ?? "work");
            }}
          />
        </div>
      </header>

      {/* Proof of life sits with the answer: sources with nothing to say are
          named once, right where the read ends. */}
      <SourceHealthStrip sources={health.sources} loading={health.loading} />

      {/* The door in is small and sits after the answer. The day's question
          comes first; asking comes second. */}
      <AskVantaBar />

      {/* Registration marks — structural punctuation between hero and feed.
          They shift one notch when the change count genuinely moves. */}
      <TickRow live={changeSignal} />

      {/* A lap you can resume, quiet unless the hand-off is useful. */}
      <CrossDeviceResume onNavigate={onNavigate} />

      {/* A trip you started is still running: field context before desk work. */}
      <FieldSessionCard variant="today" />

      {/* The rest of today, on a tap: calendar plus the forecast window. */}
      <EveningReadCard />

      {/* Work already open elsewhere comes back before anything new. */}
      <ResumeWorkSection onNavigate={onNavigate} />

      {/* One proactive voice at a time, folded under the read instead of
          competing with it. */}
      <NoticedRow
        signal={noticed}
        onNavigate={onNavigate}
        onDismiss={dismissNoticed}
        onFollow={followNoticed}
      />

      {/* Supporting moves come after the answer: parking something, finding a
          desk, the one-time first lap. Nothing here outranks the read. */}
      {!secondaryQuiet ? (
        <>
          <div className="flex flex-wrap items-center gap-2 px-1">
            <GotSomethingChooser />
            <span className="text-[10.5px] leading-snug text-muted-foreground">
              Park it, promise it, or have a step prepared — Echo files it, never runs it.
            </span>
          </div>

          <FirstLapCard onNavigate={onNavigate} />

          {/* One navigation pattern: desks, the week's read, and the switches
              worth flipping — one strip, not three separate rails. */}
          <Section
            title="Find it fast"
            sectionKey="today.find"
            icon={Sun}
            defaultOpen={false}
            summary="Desks, your week, and the switches."
          >
            <div className="space-y-3">
              <JumpStrip
                onNavigate={onNavigate}
                counts={{ inbox: captureCount, commitments: digest.commitments.length, actions: digest.actions.length }}
              />
              <TodayDigestLine onNavigate={onNavigate as never} />
              <QuickModes />
            </div>
          </Section>
        </>
      ) : null}

      {loadingCritical ? (
        <LoadingState rows={2} label="Pulling together your day" />
      ) : (
        <>
          <TodayBodyPanel />

          {/* Lane one: what is true as you read this. */}
          {agenda.ongoing.length > 0 || !quiet ? (
            <Lane label="Happening now" hint="True as of this minute">
          <RunningNow ongoing={agenda.ongoing} />
          {!quiet && (
            <Section
              title="Needs attention"
              hint={sectionNote("today.attention")}
              sectionKey="today.attention"
              icon={AlertTriangle}
              defaultOpen={openSection === "attention"}
              reading={<RollingNumber value={attention.length} />}
              summary={
                attention.length === 1
                  ? "1 item is waiting on you."
                  : `${attention.length} items are waiting on you.`
              }
              action={
                <Button size="sm" variant="ghost" className={cn("h-9 text-xs", MOTION_FOCUS)} onClick={(e) => { markFlipOriginFromEvent(e); setDrill("now"); }}>
                  See all
                </Button>
              }
            >
              <div className="space-y-1.5">
                {groups.map((g) => {
                  const id = g.project ?? "__unassigned";
                  const open = openGroup === id;
                  const name = g.project ?? "Not in a project yet";
                  return (
                    <div key={id} className="vanta-inset">
                      <button
                        onClick={() => setOpenGroup(open ? null : id)}
                        className={cn("flex w-full min-h-[44px] items-center gap-2 px-3 py-2 text-left", MOTION_FOCUS)}
                        aria-expanded={open}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
                          {name} has <MachineText>{g.count}</MachineText>{" "}
                          {g.count === 1 ? "item" : "items"} needing attention
                        </span>
                        <ChevronDown
                          className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
                        />
                      </button>
                      {open ? (
                        <div className="space-y-1.5 border-t border-border/50 p-2">
                          {g.items.map((it) => (
                            <Row
                              key={it.key}
                              label={it.label}
                              meta={it.meta}
                              tone={it.level === "critical" ? "warn" : "default"}
                              onClick={() => onNavigate(it.destination)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Nothing runs until you approve it, and you get one more look before it does.
                </p>
              </div>
            </Section>
          )}
            </Lane>
          ) : null}

          {/* Lane two: what is coming. */}
          {nextTotal > 0 && (
          <Lane label="Next up" hint="Promises and meetings ahead">
          <Section
            title="What's next"
            hint={sectionNote("today.next")}
            sectionKey="today.next"
            icon={CalendarClock}
            defaultOpen={openSection === "next"}
            reading={<RollingNumber value={nextTotal} />}
            summary={summaryLine(
              "commitment",
              nextTotal,
              dueToday.length > 0 ? `${dueToday.length} due today` : nearestLabel,
            )}
            action={
              <Button size="sm" variant="ghost" className={cn("h-9 text-xs", MOTION_FOCUS)} onClick={(e) => { markFlipOriginFromEvent(e); setDrill("next"); }}>
                See all
              </Button>
            }
          >
            {dueToday.length === 0 && upcoming.length === 0 ? (
              <EmptyState
                title="No dated promises"
                hint="When you tell Echo you'll do something by a date, it lands here."
                flow={["You say it", "Echo dates it", "Commitments"]}
              />
            ) : (
              <div className="space-y-1.5">
                {dueToday.length > 0 ? (
                  <button
                    onClick={(e) => { markFlipOriginFromEvent(e); setDrill("today"); }}
                    className={cn(
                      "min-h-[44px] w-full rounded-[calc(var(--radius)-4px)] border border-dashed border-border/60 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40",
                      MOTION_FOCUS,
                    )}
                  >
                    <MachineText>{dueToday.length}</MachineText>{" "}
                    {dueToday.length === 1 ? "promise is" : "promises are"} due today — open the list
                  </button>
                ) : null}
                {[...dueToday, ...upcoming].slice(0, 5).map((c) => (
                  <Row
                    key={c.id}
                    label={c.summary}
                    object="commitment"
                    state={
                      c.due_at
                        ? isToday(new Date(c.due_at))
                          ? "due today"
                          : isTomorrow(new Date(c.due_at))
                            ? "due tomorrow"
                            : `due in ${formatDistanceToNow(new Date(c.due_at))}`
                        : "no date yet"
                    }
                    meta={
                      c.due_at
                        ? isToday(new Date(c.due_at))
                          ? "today"
                          : isTomorrow(new Date(c.due_at))
                            ? "tomorrow"
                            : `in ${formatDistanceToNow(new Date(c.due_at))}`
                        : "no date"
                    }
                    onClick={() => onNavigate("commitments")}
                  />
                ))}
              </div>
            )}
            {/* The calendar lives here too: what's next is promises and
                meetings, one shelf. */}
            <AgendaInNext
              events={agenda.events}
              loading={agenda.loading}
              onOpenWeek={() => onNavigate("schedule")}
            />
          </Section>
          </Lane>
          )}

          {/* Lane: the trip itself, read out of the calendar. Absent when there
              is no travel on the books. */}
          {travelEvents.length > 0 ? (
            <Lane label="Travel" hint="Flights and stays on the books">
              <TravelLane events={travelEvents} onOpenMap={() => onNavigate("awareness")} />
            </Lane>
          ) : null}

          {/* Lane: promises as a checklist. Same records, same close path. */}
          {digest.commitments.length > 0 ? (
            <Lane label="Tasks" hint="Open promises, closable here">
              <TasksLane
                tasks={digest.commitments.map((c) => ({ id: c.id, summary: c.summary, due_at: c.due_at }))}
                onChanged={() => digest.refresh()}
              />
            </Lane>
          ) : null}

          {/* Background wave: never blocks the two sections above. */}
          {backgroundError ? (
            <ErrorState
              title="Couldn't read recent activity"
              error={backgroundError}
              doing="reading recent activity"
              onRetry={refresh}
            />
          ) : loadingBackground ? (
            <LoadingState rows={1} label="Loading recent activity" />
          ) : secondaryQuiet ? (
            /* Quiet state: one calm line instead of three empty cards. */
            <section className="vanta-focus-card vanta-card flex items-center gap-2 border border-transparent px-4 py-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
                Everything important is quiet. Nothing unusual, nothing new to sort.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-9 shrink-0 text-xs", MOTION_ROW, MOTION_FOCUS)}
                onClick={() => onNavigate("receipts")}
              >
                Receipts
              </Button>
            </section>
          ) : (
            /* Lane three: what already happened, and what landed. */
            <Lane label="History" hint="Recorded, newest first">


              <Section
                title="Security"
                hint={sectionNote("today.security")}
                sectionKey="today.security"
                icon={ShieldCheck}
                defaultOpen={security.tone !== "good"}
                summary={security.line}
                action={
                  securityEvents.length > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 text-xs"
                      onClick={() => setSecurityOpen((v) => !v)}
                    >
                      {securityOpen ? "Hide" : "Details"}
                    </Button>
                  ) : undefined
                }
              >
                <p
                  className={cn(
                    "text-xs leading-snug",
                    security.tone === "critical"
                      ? "text-warn"
                      : security.tone === "attention"
                        ? "text-foreground/90"
                        : "text-muted-foreground",
                  )}
                >
                  {security.line}
                </p>
                {securityOpen && securityEvents.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {securityEvents.slice(0, 5).map((e) => (
                      <Row
                        key={e.id}
                        label={humanizeEvent(e.event)}
                        meta={formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                        onClick={() => onNavigate("receipts")}
                      />
                    ))}
                  </div>
                ) : null}
              </Section>

              <Section
                title="What changed"
                hint={sectionNote("today.changed")}
                sectionKey="today.changed"
                icon={Receipt}
                defaultOpen={openSection === "changed"}
                reading={<RollingNumber value={allEvents.length} />}
                summary={summaryLine("receipt", events.length, "newest first", "Nothing recorded yet.")}
                action={
                  <Button size="sm" variant="ghost" className={cn("h-9 text-xs", MOTION_FOCUS)} onClick={(e) => { markFlipOriginFromEvent(e); setDrill("changed"); }}>
                    See all
                  </Button>
                }
              >
                {changedRows.length === 0 ? (
                  <EmptyState
                    title="Nothing recorded yet"
                    hint="Every save, approval and run leaves a receipt here."
                    flow={["Change", "Receipt", "Receipts room"]}
                  />
                ) : (
                  <ul className="space-y-1.5">
                    {changedRows.map((e) => {
                      /* A count is not an answer: each line names the change and
                         the place it landed, and taps through to that place. */
                      const where = eventWhere(e.entity_type);
                      return (
                        <li key={e.id}>
                          <button
                            onClick={() => onNavigate(where.surface as SurfaceKey)}
                            className={cn(
                              "flex w-full min-h-[44px] items-center gap-2 vanta-inset px-3 py-2 text-left hover:bg-surface-elevated/70",
                              /* History settles rather than arriving: this is
                                 the record, not the event. */
                              MOTION_STAMP,
                              MOTION_ROW,
                              MOTION_FOCUS,
                              LEAD_BAR,
                              "text-primary/50",
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
                              {humanizeEvent(e.event)}
                              <span className="text-muted-foreground"> — filed in {where.label}</span>
                            </span>
                            {liveIds.has(e.id) ? (
                              <MachineText className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[9px] text-primary">
                                new
                              </MachineText>
                            ) : null}
                            <MachineText className="shrink-0 text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                            </MachineText>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              <Section
                title="Fresh in"
                hint={sectionNote("today.fresh")}
                sectionKey="today.fresh"
                icon={Inbox}
                reading={<RollingNumber value={captureCount} />}
                defaultOpen={openSection === "fresh"}
                summary={summaryLine("capture", captureCount, "not sorted yet", "Nothing new to sort.")}
                action={
                  <Button size="sm" variant="ghost" className={cn("h-9 text-xs", MOTION_FOCUS)} onClick={() => onNavigate("inbox")}>
                    Open inbox
                  </Button>
                }
              >
                {captureCount === 0 ? (
                  <EmptyState
                    title="Nothing new"
                    hint="Captures land in Inbox, then you sort them into the work they belong to."
                    flow={["Telegram", "Email", "Voice", "Inbox"]}
                  />
                ) : (
                  <p className="text-xs leading-snug text-muted-foreground">
                    <MachineText className="text-foreground/90">{captureCount}</MachineText>{" "}
                    {captureCount === 1 ? "capture" : "captures"} in the last day. Sort them into a project when you're ready.
                  </p>
                )}
              </Section>
            </Lane>
          )}
        </>
      )}

      {/* One line for everything that is simply empty right now. */}
      {!loadingCritical && !loadingBackground && emptyNames.length > 0 ? (
        <p className="px-1 text-[11.5px] text-muted-foreground/80">
          Nothing here yet: {emptyNames.join(", ")}.
        </p>
      ) : null}

      <SurfaceAftermath surface="today" />

      <TodaySectionSheet
        section={drill}
        onClose={() => setDrill(null)}
        onNavigate={onNavigate}
        attention={attention}
        dueToday={dueToday}
        upcoming={upcoming}
        events={allEvents}
        onChanged={() => digest.refresh()}
      />
    </div>
  );
}
