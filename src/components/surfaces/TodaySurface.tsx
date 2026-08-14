import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/state-views";
import { AskVantaBar } from "@/components/today/AskVantaBar";
import { TodaySectionSheet, type TodaySectionKey } from "@/components/today/TodaySectionSheet";
import { ResumeWorkSection } from "@/components/today/ResumeWorkSection";
import { humanizeEvent } from "@/lib/plainLabels";
import { useScope } from "@/hooks/useScope";
import { useTodayDigest } from "@/hooks/useTodayDigest";
import { formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  Inbox,
  Receipt,
  ArrowRight,
  ShieldCheck,
  Sun,
} from "lucide-react";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { LEAD_BAR, MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import {
  ActivityTrace,
  MachineLabel,
  MachineText,
  RollingNumber,
  SectionRail,
  TickRow,
} from "@/components/ui/instrument";
import { todayHeadline } from "@/lib/todayDigest";
import { cn } from "@/lib/utils";


function Section({
  title,
  hint,
  icon: Icon,
  reading,
  children,
  action,
}: {
  title: string;
  hint?: string;
  icon: typeof Sun;
  /** A real reading shown in the rail gap — a count, never a label. */
  reading?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="vanta-card p-4">
      <SectionRail
        label={title}
        reading={reading}
        icon={<Icon className="h-3.5 w-3.5" />}
        action={action}
      />
      {hint ? <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  meta,
  tone,
  onClick,
}: {
  label: string;
  meta?: string;
  tone?: "warn" | "default";
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
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{label}</span>
      {meta ? <MachineText className="shrink-0 text-[10px] text-muted-foreground">{meta}</MachineText> : null}
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
    quietLine,
    refresh,
  } = digest;

  const securityEvents = events.filter((e) => e.event.startsWith("fenrir."));
  const { tone, headline } = todayHeadline({ attention, changedCount: events.length });
  /* Quiet means: nothing waiting, nothing unusual, nothing fresh. Then the
     secondary feeds collapse to one line instead of three empty cards. */
  const secondaryQuiet =
    quiet && security.tone === "good" && captureCount === 0 && events.length === 0;

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
    const t = window.setTimeout(() => setChangeSignal(false), 800);
    return () => window.clearTimeout(t);
  }, [events.length, loadingCritical]);


  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:py-8">
      {/* Hero — where Vanta's presence lives. Ambient purple wash, grain, one
          cut corner. The headline wears the mono face because it is a reading
          of real state, not a marketing line. */}
      <header
        className={cn(
          "vanta-hero vanta-grain vanta-notch px-4 py-4 sm:px-5 sm:py-5",
          changeSignal && "vanta-signal",
        )}
      >
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-accent" />
          <MachineLabel className="text-foreground/70">Today</MachineLabel>
          <Badge variant="outline" className="vanta-machine ml-auto mr-5 text-[9.5px] uppercase tracking-[0.14em]">
            {destination}
          </Badge>
        </div>
        <h1
          aria-live="polite"
          className={cn(
            "mt-2.5 font-mono text-[23px] font-bold leading-[1.12] tracking-[-0.03em] sm:text-[26px]",
            tone === "urgent" ? "text-danger" : "text-foreground",
          )}
        >
          {loadingCritical ? "Reading this space…" : headline}
        </h1>
        <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">
          {loadingCritical ? "" : quiet ? quietLine : "Nothing runs until you approve it."}
        </p>
        {/* Data as decoration: the trace is a real 14-day read of recorded
            activity in this scope. Flat when nothing happened. */}
        {loadingCritical ? null : (
          <div className="mt-3 flex items-center gap-2.5">
            <ActivityTrace timestamps={allEvents.map((e) => e.created_at)} />
            <span className="h-px flex-1 bg-border/50" />
            <MachineText className="text-[10px] text-muted-foreground">
              <RollingNumber value={allEvents.length} /> recorded
            </MachineText>
          </div>
        )}
      </header>

      {/* Registration marks — structural punctuation between hero and feed. */}
      <TickRow />





      <AskVantaBar />

      {loadingCritical ? (
        <LoadingState rows={2} label="Pulling together your day" />
      ) : (
        <>
          <ResumeWorkSection onNavigate={onNavigate} />

          {!quiet && (
            <Section
              title="Needs attention"
              hint="Grouped by the work it belongs to."
              icon={AlertTriangle}
              reading={<RollingNumber value={attention.length} />}
              action={
                <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setDrill("now")}>
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

          <Section
            title="What's next"
            hint="Promises with a date, soonest first."
            icon={CalendarClock}
            reading={<RollingNumber value={dueToday.length + upcoming.length} />}
            action={
              <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setDrill("next")}>
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
                    onClick={() => setDrill("today")}
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

          {/* Background wave: never blocks the two sections above. */}
          {backgroundError ? (
            <ErrorState
              title="Couldn't read recent activity"
              detail="The rest of Today still works. Try again when you are ready."
              onRetry={refresh}
            />
          ) : loadingBackground ? (
            <LoadingState rows={1} label="Loading recent activity" />
          ) : secondaryQuiet ? (
            /* Quiet state: one calm line instead of three empty cards. */
            <section className="vanta-card flex items-center gap-2 px-4 py-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 text-[12px] leading-snug text-muted-foreground">
                Everything important is quiet. Nothing unusual, nothing new to sort.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className={cn("h-9 shrink-0 text-xs", MOTION_ROW)}
                onClick={() => onNavigate("receipts")}
              >
                Receipts
              </Button>
            </section>
          ) : (
            <>

              <Section
                title="Security"
                icon={ShieldCheck}
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
                hint="The last few things Vanta recorded, in plain English."
                icon={Receipt}
                reading={<RollingNumber value={allEvents.length} />}
                action={
                  <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setDrill("changed")}>
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
                    {events.map((e) => (
                      <li
                        key={e.id}
                        className={cn(
                          "flex items-center gap-2 text-xs text-foreground/90",
                          LEAD_BAR,
                          "text-primary/50",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-foreground/90">{humanizeEvent(e.event)}</span>
                        <MachineText className="shrink-0 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                        </MachineText>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                title="Fresh in"
                icon={Inbox}
                reading={<RollingNumber value={captureCount} />}
                action={
                  <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => onNavigate("inbox")}>
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
                    <MachineText className="text-foreground/90">{captureCount}</MachineText> new{" "}
                    {captureCount === 1 ? "note" : "notes"} in the last day. Sort them into a project when you're ready.
                  </p>
                )}
              </Section>
            </>
          )}
        </>
      )}

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
