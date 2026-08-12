import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState } from "@/components/ui/state-views";
import { AskVantaBar } from "@/components/today/AskVantaBar";
import { humanizeEvent } from "@/lib/plainLabels";
import { formatDistanceToNow, isToday, isTomorrow } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CheckSquare,
  Inbox,
  ListChecks,
  Receipt,
  ArrowRight,
  Sun,
} from "lucide-react";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { cn } from "@/lib/utils";

type Commitment = { id: string; summary: string; due_at: string | null; priority: string };
type Action = { id: string; title: string; risk: string; status: string; updated_at: string };
type Event = { id: string; event: string; entity_type: string; created_at: string };

function Section({
  title,
  hint,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  hint: string;
  icon: typeof Sun;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="vanta-card p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
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
 * TodaySurface — the Today layer. One screen that answers the four questions:
 * what matters now, what needs attention, what's next, what changed. Everything
 * here is read from the active scope only, and every row hands off to the
 * surface that owns the review → approve → execute → receipt path.
 */
export function TodaySurface({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { session } = useAuth();
  const { applyScope, key: scopeKey, destination } = useScope();
  const [loading, setLoading] = useState(true);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [approvals, setApprovals] = useState<Action[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [captureCount, setCaptureCount] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [c, a, e, n] = await Promise.all([
      applyScope(supabase.from("commitments").select("id, summary, due_at, priority"))
        .eq("status", "open")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(30),
      applyScope(supabase.from("actions").select("id, title, risk, status, updated_at"))
        .in("status", ["staged", "proposed"])
        .order("updated_at", { ascending: false })
        .limit(10),
      applyScope(supabase.from("audit_log").select("id, event, entity_type, created_at"))
        .order("created_at", { ascending: false })
        .limit(6),
      applyScope(supabase.from("notes").select("id"))
        .gte("created_at", since)
        .limit(50),
    ]);
    setCommitments((c.data as Commitment[]) ?? []);
    setApprovals((a.data as Action[]) ?? []);
    setEvents((e.data as Event[]) ?? []);
    setCaptureCount((n.data as unknown[])?.length ?? 0);
    setLoading(false);
  }, [applyScope]);

  useEffect(() => {
    if (session) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey]);

  const now = Date.now();
  const overdue = commitments.filter((c) => c.due_at && new Date(c.due_at).getTime() < now);
  const dueToday = commitments.filter((c) => c.due_at && isToday(new Date(c.due_at)) && new Date(c.due_at).getTime() >= now);
  const next = commitments.filter(
    (c) => !overdue.includes(c) && !dueToday.includes(c),
  );
  const highRisk = approvals.filter((a) => a.risk === "high");

  const attentionCount = overdue.length + approvals.length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-5 sm:py-7">
      <header>
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Today</h1>
          <Badge variant="outline" className="ml-auto text-[10px]">{destination}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Reading this space…"
            : attentionCount === 0
              ? "Nothing is waiting on you right now."
              : `${attentionCount} ${attentionCount === 1 ? "thing" : "things"} waiting on you.`}
        </p>
      </header>

      <AskVantaBar />

      {loading ? (
        <LoadingState label="Pulling together your day" />
      ) : (
        <>
          <Section
            title="Needs attention"
            hint="Late promises and anything staged for your approval."
            icon={AlertTriangle}
            action={
              approvals.length > 0 ? (
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onNavigate("actions")}>
                  Review
                </Button>
              ) : undefined
            }
          >
            {overdue.length === 0 && approvals.length === 0 ? (
              <EmptyState
                title="Clear for now"
                description="Late promises and things staged for approval show up here."
              />
            ) : (
              <div className="space-y-1.5">
                {overdue.slice(0, 4).map((c) => (
                  <Row
                    key={c.id}
                    label={c.summary}
                    meta={c.due_at ? `late ${formatDistanceToNow(new Date(c.due_at))}` : undefined}
                    tone="warn"
                    onClick={() => onNavigate("commitments")}
                  />
                ))}
                {approvals.slice(0, 4).map((a) => (
                  <Row
                    key={a.id}
                    label={a.title}
                    meta={a.risk === "high" ? "needs a careful look" : "waiting on you"}
                    tone={a.risk === "high" ? "warn" : "default"}
                    onClick={() => onNavigate("actions")}
                  />
                ))}
                {highRisk.length > 0 && (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    Nothing runs until you approve it — {highRisk.length} of these needs a careful read first.
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section
            title="What's next"
            hint="Promises with a date, soonest first."
            icon={CalendarClock}
            action={
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onNavigate("commitments")}>
                All
              </Button>
            }
          >
            {dueToday.length === 0 && next.length === 0 ? (
              <EmptyState
                title="No dated promises"
                description="When you tell Vanta you'll do something by a date, it lands here."
              />
            ) : (
              <div className="space-y-1.5">
                {[...dueToday, ...next].slice(0, 5).map((c) => (
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

          <Section
            title="What changed"
            hint="The last few things Vanta recorded, in plain English."
            icon={Receipt}
            action={
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onNavigate("receipts")}>
                Receipts
              </Button>
            }
          >
            {events.length === 0 ? (
              <EmptyState
                title="Nothing recorded yet"
                description="Every save, approval and run leaves a receipt here."
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

          <Section
            title="Fresh in"
            hint="What landed in the last day and still needs a home."
            icon={Inbox}
            action={
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onNavigate("inbox")}>
                Open inbox
              </Button>
            }
          >
            <p className="text-xs text-muted-foreground">
              {captureCount === 0
                ? "Nothing new in the last day. Captures from Telegram, email, voice and uploads land in Inbox."
                : `${captureCount} new ${captureCount === 1 ? "note" : "notes"} in the last day. Sort them into a project when you're ready.`}
            </p>
          </Section>

          <div className="flex flex-wrap gap-1.5 pb-2">
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => onNavigate("command")}>
              <ListChecks className="h-3.5 w-3.5" /> Full cockpit
            </Button>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => onNavigate("projects")}>
              <CheckSquare className="h-3.5 w-3.5" /> Projects
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
