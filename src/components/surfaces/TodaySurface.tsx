import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/state-views";
import { AskVantaBar } from "@/components/today/AskVantaBar";
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
import { cn } from "@/lib/utils";

function Section({
  title,
  hint,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  hint?: string;
  icon: typeof Sun;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="vanta-card p-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
        {action ? <div className="ml-auto shrink-0">{action}</div> : null}
      </div>
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
        "flex w-full min-h-[44px] items-center gap-2 rounded-lg border border-border/50 bg-surface-elevated px-3 py-2 text-left transition-colors hover:border-primary/40",
        tone === "warn" && "border-warn/40",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">{label}</span>
      {meta ? <span className="shrink-0 text-[11px] text-muted-foreground">{meta}</span> : null}
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

  const {
    loadingCritical,
    loadingBackground,
    backgroundError,
    attention,
    groups,
    dueToday,
    upcoming,
    events,
    captureCount,
    security,
    quiet,
    quietLine,
    refresh,
  } = digest;

  const securityEvents = events.filter((e) => e.event.startsWith("fenrir."));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:py-8">
      <header>
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Today</h1>
          <Badge variant="outline" className="ml-auto text-[10px]">{destination}</Badge>
        </div>
        <p className="mt-1.5 text-sm leading-snug text-muted-foreground">
          {loadingCritical
            ? "Reading this space…"
            : quiet
              ? quietLine
              : `${attention.length} ${attention.length === 1 ? "thing" : "things"} waiting on you.`}
        </p>
      </header>

      <AskVantaBar />

      {loadingCritical ? (
        <LoadingState rows={2} label="Pulling together your day" />
      ) : (
        <>
          {!quiet && (
            <Section
              title="Needs attention"
              hint="Grouped by the work it belongs to."
              icon={AlertTriangle}
              action={
                <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => onNavigate("actions")}>
                  Review
                </Button>
              }
            >
              <div className="space-y-1.5">
                {groups.map((g) => {
                  const id = g.project ?? "__unassigned";
                  const open = openGroup === id;
                  const name = g.project ?? "Not in a project yet";
                  return (
                    <div key={id} className="rounded-lg border border-border/50 bg-surface-elevated">
                      <button
                        onClick={() => setOpenGroup(open ? null : id)}
                        className="flex w-full min-h-[44px] items-center gap-2 px-3 py-2 text-left"
                        aria-expanded={open}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
                          {name} has {g.count} {g.count === 1 ? "item" : "items"} needing attention
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
            action={
              <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => onNavigate("commitments")}>
                All
              </Button>
            }
          >
            {dueToday.length === 0 && upcoming.length === 0 ? (
              <EmptyState
                title="No dated promises"
                hint="When you tell Vanta you'll do something by a date, it lands here."
              />
            ) : (
              <div className="space-y-1.5">
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
                action={
                  <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => onNavigate("receipts")}>
                    Receipts
                  </Button>
                }
              >
                {events.length === 0 ? (
                  <EmptyState
                    title="Nothing recorded yet"
                    hint="Every save, approval and run leaves a receipt here."
                  />
                ) : (
                  <ul className="space-y-1.5">
                    {events.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 text-xs text-foreground/90">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" />
                        <span className="min-w-0 flex-1 truncate">{humanizeEvent(e.event)}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Fresh in" icon={Inbox}
                action={
                  <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => onNavigate("inbox")}>
                    Open inbox
                  </Button>
                }
              >
                <p className="text-xs leading-snug text-muted-foreground">
                  {captureCount === 0
                    ? "Nothing new in the last day. Captures from Telegram, email, voice and uploads land in Inbox."
                    : `${captureCount} new ${captureCount === 1 ? "note" : "notes"} in the last day. Sort them into a project when you're ready.`}
                </p>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}
