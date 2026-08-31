import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/state-views";
import { AskVantaBar } from "@/components/today/AskVantaBar";
import { TodaySectionSheet, type TodaySectionKey } from "@/components/today/TodaySectionSheet";
import { ResumeWorkSection } from "@/components/today/ResumeWorkSection";
import { AgendaStrip } from "@/components/today/AgendaStrip";
import { NoticedRow } from "@/components/today/NoticedRow";
import { LiveBulletin } from "@/components/today/LiveBulletin";
import { QuickModes } from "@/components/today/QuickModes";
import { JumpStrip } from "@/components/today/JumpStrip";
import { GotSomethingChooser } from "@/components/intake/GotSomethingChooser";
import { FirstLapCard } from "@/components/today/FirstLapCard";
import { CrossDeviceResume } from "@/components/today/CrossDeviceResume";
import { TodayDigestLine } from "@/components/today/TodayDigestLine";

import { useLiveFeed } from "@/hooks/useLiveFeed";
import { eventWhere, humanizeEvent } from "@/lib/plainLabels";
import { useScope } from "@/hooks/useScope";
import { useTodayDigest } from "@/hooks/useTodayDigest";
import { applyWeather, deriveWeather } from "@/lib/weather";
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
import { LEAD_BAR, MOTION_BOOT, MOTION_FOCUS, MOTION_ROW, MOTION_STAMP, feelMs } from "@/lib/motion";
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


/**
 * TodaySurface — the front door. It answers what matters now, what's next, what
 * changed, and stays quiet when there is nothing to say. Everything is read
 * from the active scope only, and every row hands off to the surface that owns
 * the review → approve → execute → receipt path.
 */
export function TodaySurface({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { destination } = useScope();
  const digest = useTodayDigest();
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

  const securityEvents = events.filter((e) => e.event.startsWith("fenrir."));
  const { tone, headline } = todayHeadline({ attention, changedCount: events.length });
  /* One section opens by default — the one that actually deserves the first
     look. The rest collapse to a line that says whether opening is worth it. */
  const dayLine = stateOfDay({
    overdue: digest.overdue.length,
    waitingOnYou: digest.actions.length,
    dueToday: dueToday.length,
    changed: events.length,
    captures: captureCount,
    noticed: !!noticed,
  });

  const nextTotal = dueToday.length + upcoming.length;
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

  /* Shell weather: Today owns the read on the state of the world, so it is the
     one place that writes it onto <html>. Everything visual follows from CSS. */
  useEffect(() => {
    if (loadingCritical) return;
    applyWeather(
      deriveWeather({
        overdue: digest.overdue.length,
        attention: attention.length,
        captures: captureCount,
        securityAlert: security.tone === "critical" || security.tone === "attention",
        noticed: !!noticed,
      }),
    );
  }, [loadingCritical, digest.overdue.length, attention.length, captureCount, security.tone, noticed]);

  /* One-shot signal on the hero when real new change actually lands. It says
     "Vanta noticed something", then it is gone. Never left on. */
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

      {/* Hero — where Vanta's presence lives. Ambient purple wash, grain, one
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
          {loadingCritical ? "Reading this space…" : headline}
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

        {/* Data as decoration: the trace is a real 14-day read of recorded
            activity in this scope. Flat when nothing happened. */}
        {loadingCritical ? null : (
          <div className="mt-3 flex items-center gap-2.5">
            <ActivityTrace timestamps={allEvents.map((e) => e.created_at)} />
            <span className="h-px flex-1 bg-border/50" />
            <MachineText className="text-[10px] text-muted-foreground">
              <RollingNumber value={allEvents.length} /> changes recorded
            </MachineText>
          </div>
        )}
      </header>

      {/* Registration marks — structural punctuation between hero and feed.
          They shift one notch when the change count genuinely moves. */}
      <TickRow live={changeSignal} />

      {/* The one obvious way in. Three plain destinations, nothing executes. */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <GotSomethingChooser />
        <span className="text-[10.5px] leading-snug text-muted-foreground">
          Park it, promise it, or have a step prepared — Vanta files it, never runs it.
        </span>
      </div>

      {/* One lap on your own content, until you have done it once. */}
      <FirstLapCard onNavigate={onNavigate} />

      {/* Jump to a desk — navigation only, counts from reads Today already did. */}
      <JumpStrip
        onNavigate={onNavigate}
        counts={{ inbox: captureCount, commitments: digest.commitments.length, actions: digest.actions.length }}
      />


      {/* One companion across bodies. Quiet unless the hand-off is useful. */}
      <CrossDeviceResume onNavigate={onNavigate} />
      <TodayDigestLine onNavigate={onNavigate as never} />

      <AskVantaBar />


      <QuickModes />


      <LiveBulletin live={live} seed={allEvents.slice(0, 6)} connected={connected} onNavigate={onNavigate} />

      {loadingCritical ? (
        <LoadingState rows={2} label="Pulling together your day" />
      ) : (
        <>
          <NoticedRow
            signal={noticed}
            onNavigate={onNavigate}
            onDismiss={dismissNoticed}
            onFollow={followNoticed}
          />

          <ResumeWorkSection onNavigate={onNavigate} />

          <AgendaStrip onOpenWeek={() => onNavigate("work")} />


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

          {nextTotal > 0 && (
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
                hint="When you tell Vanta you'll do something by a date, it lands here."
                flow={["You say it", "Vanta dates it", "Commitments"]}
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
          </Section>
          )}

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
            <>

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
                {events.length === 0 ? (
                  <EmptyState
                    title="Nothing recorded yet"
                    hint="Every save, approval and run leaves a receipt here."
                    flow={["Change", "Receipt", "Receipts room"]}
                  />
                ) : (
                  <ul className="space-y-1.5">
                    {events.map((e) => {
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
            </>
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
      />
    </div>
  );
}
