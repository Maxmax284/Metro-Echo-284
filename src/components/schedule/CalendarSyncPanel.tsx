// CalendarSyncPanel — the answer to "how do I know it synced, and what changed?"
//
// Doctrine:
//  - "Synchronized" is not news. This panel reports a diff and a last-looked-at
//    time per calendar, and when a calendar came back empty it says the likely
//    reason instead of shrugging.
//  - Read-only. Nothing here writes to any calendar, ever.
//  - Scope-filtered: a workspace calendar belongs to that room only.
//  - Changes are held, not just announced. The list below is the record.
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, RefreshCw, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { StatusDot, type DotTone } from "@/components/ui/status-dot";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { MOTION_FOCUS } from "@/lib/motion";
import {
  changeLine,
  checkedLabel,
  EMPTY_FEED_ADVICE,
  FEED_STATE_WORD,
  feedState,
  feedStateLine,
  SYNC_CADENCE_NOTE,
  syncSummary,
  type FeedStatus,
  type FeedSyncResult,
} from "@/lib/calendarSync";
import { cn } from "@/lib/utils";
import { CalendarDiffSheet } from "./CalendarDiffSheet";

type Feed = FeedStatus & { id: string };
type Change = {
  id: string;
  title: string | null;
  change: string;
  old_starts_at: string | null;
  new_starts_at: string | null;
  was_filed: boolean;
  detected_at: string;
};

const CHANGE_TONE: Record<string, DotTone> = {
  added: "primary",
  moved: "warn",
  cancelled: "muted",
};

/* One change repeated by every sync pass is one news item, not a pile.
   Folds identical title+kind+time rows into one line with a count. */
function foldChanges(list: Change[]): Array<{ key: string; first: Change; times: number }> {
  const out: Array<{ key: string; first: Change; times: number }> = [];
  for (const c of list) {
    const signature = `${c.title ?? ""}|${c.change}|${c.new_starts_at ?? ""}|${c.old_starts_at ?? ""}`;
    const found = out.find((f) => f.key === signature);
    if (found) {
      found.times += 1;
    } else {
      out.push({ key: signature, first: c, times: 1 });
    }
  }
  return out;
}

export function CalendarSyncPanel({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { session } = useAuth();
  const { applyScope, key } = useScope();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [f, c] = await Promise.all([
        applyScope(
          supabase
            .from("calendar_feeds")
            .select("id,label,active,last_synced_at,last_error,event_count,last_added,last_moved,last_cancelled"),
        ).order("created_at", { ascending: true }),
        applyScope(
          supabase
            .from("calendar_changes")
            .select("id,title,change,old_starts_at,new_starts_at,was_filed,detected_at"),
        )
          .gte("detected_at", weekAgo)
          .order("detected_at", { ascending: false })
          .limit(20),
      ]);
      if (f.error) throw f.error;
      setFeeds((f.data ?? []) as Feed[]);
      setChanges((c.data ?? []) as Change[]);
    } catch (e: any) {
      setError(e?.message ?? "The calendars could not be read.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, key]);

  useEffect(() => { void load(); }, [load]);

  async function checkNow() {
    setBusy(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("calendar-sync", { body: {} });
      if (err) throw err;
      const results = ((data as any)?.results ?? []) as FeedSyncResult[];
      const { title, description } = syncSummary(results);
      toast.success({ title, description });
      await load();
    } catch (e: any) {
      toast.error({ title: "That check did not finish", description: e?.message ?? "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  }

  const live = feeds.filter((f) => f.active).length;
  const entries = feeds.reduce((n, f) => n + (f.event_count ?? 0), 0);
  const summary = feeds.length
    ? `${live} calendar${live === 1 ? "" : "s"} being read · ${entries} ${entries === 1 ? "entry" : "entries"}${changes.length ? ` · ${changes.length} change${changes.length === 1 ? "" : "s"} this week` : ""}`
    : "No calendars linked yet.";

  return (
    <CollapsibleSection
      title="Calendars Echo reads"
      storageKey="schedule.calendars"
      icon={<CalendarClock className="h-3.5 w-3.5" />}
      summary={summary}
      action={
        <div className="flex items-center gap-1">
          <button
            onClick={checkNow}
            disabled={busy}
            className={cn("flex min-h-[36px] items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50", MOTION_FOCUS)}
          >
            <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
            {busy ? "Checking" : "Check now"}
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              aria-label="Manage calendar links"
              className={cn("flex min-h-[36px] min-w-[36px] items-center justify-center text-muted-foreground hover:text-foreground", MOTION_FOCUS)}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      }
    >
      {error ? (
        <ErrorState detail={error} onRetry={load} />
      ) : loading ? (
        <LoadingState rows={1} label="Reading the calendars" />
      ) : feeds.length === 0 ? (
        <EmptyState
          title="No calendars linked"
          hint="Paste a calendar's private iCal link in Settings and Echo starts reading the shape of your days — reading only, it can never move or reply to anything."
          actionLabel={onOpenSettings ? "Open calendar settings" : undefined}
          onAction={onOpenSettings}
        />
      ) : (
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {feeds.map((f) => {
              const state = feedState(f);
              return (
                <li key={f.id} className="rounded-md border border-border/50 bg-surface-elevated/30 p-2">
                  <div className="flex items-center gap-2">
                    <StatusDot tone={state === "broken" ? "destructive" : state === "live" ? "primary" : state === "off" ? "muted" : "warn"} />
                    <span className="truncate text-[12.5px] font-medium">{f.label}</span>
                    <span className="ml-auto shrink-0 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      {FEED_STATE_WORD[state]}
                    </span>
                  </div>
                  <p className="mt-0.5 pl-4 text-[11px] leading-relaxed text-muted-foreground">{feedStateLine(f)}</p>
                  {state === "empty" && (
                    <p className="mt-1 pl-4 text-[11px] leading-relaxed text-warn">{EMPTY_FEED_ADVICE}</p>
                  )}
                </li>
              );
            })}
          </ul>

          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">What changed this week</p>
              <button
                onClick={() => setDiffOpen(true)}
                className={cn("ml-auto min-h-[36px] text-[11px] text-primary hover:underline", MOTION_FOCUS)}
              >
                See every check
              </button>
            </div>
            {changes.length === 0 ? (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Nothing has moved or come off since the last seven days of checks. When something does, it is listed
                here and Echo says so once.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {/* Identical repeats of one change are one news item, not 19. */}
                {foldChanges(changes).map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-[12px] leading-relaxed">
                    <StatusDot tone={CHANGE_TONE[c.first.change] ?? "muted"} className="mt-1.5" />
                    <span className="min-w-0 flex-1">
                      {changeLine(c.first)}
                      {c.times > 1 && (
                        <span className="text-muted-foreground"> · {c.times}× {checkedLabel(c.first.detected_at).replace("checked ", "").trim() ? `latest ${checkedLabel(c.first.detected_at).replace("checked ", "")}` : ""}</span>
                      )}
                      {c.first.was_filed && <span className="text-muted-foreground"> You had this filed under a project.</span>}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{checkedLabel(c.first.detected_at).replace("checked ", "")}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">{SYNC_CADENCE_NOTE}</p>
          <CalendarDiffSheet open={diffOpen} onOpenChange={setDiffOpen} />
          <AftermathHint text="Changes to entries you filed under a project reach Today as a nudge — and Telegram too, if you have that turned on in Settings › Time and reminders." />
        </div>
      )}
    </CollapsibleSection>
  );
}
