// CalendarDiffSheet — the diff-style answer to "did it sync?"
//
// Doctrine:
//  - A check reports a diff, never a status. Each group here is one check, with
//    the time it ran and what it found; "nothing changed" is said out loud.
//  - Every row shows before → after, so a moved meeting reads as a move.
//  - Read-only. This sheet only reads recorded rows; Vanta never writes back to
//    any calendar, and nothing here executes.
//  - Scope-filtered: a workspace calendar's changes stay in that room.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { StatusDot, type DotTone } from "@/components/ui/status-dot";
import { MachineText } from "@/components/ui/instrument";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { MOTION_FOCUS } from "@/lib/motion";
import {
  changeDiff, checkedLabel, groupChangesByCheck, runHeadline, SYNC_CADENCE_NOTE,
  syncSummary, type CalendarChangeRow, type FeedSyncResult,
} from "@/lib/calendarSync";
import { cn } from "@/lib/utils";

const TONE: Record<string, DotTone> = {
  added: "primary",
  moved: "warn",
  cancelled: "muted",
};

type Filter = "all" | "added" | "moved" | "cancelled";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Everything" },
  { id: "added", label: "Added" },
  { id: "moved", label: "Moved" },
  { id: "cancelled", label: "Came off" },
];

/** How far back the diff reads. Long enough to answer "since I last looked". */
const WINDOW_DAYS = 30;

export function CalendarDiffSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { session } = useAuth();
  const { applyScope, key } = useScope();
  const [rows, setRows] = useState<CalendarChangeRow[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
      const [c, f] = await Promise.all([
        applyScope(
          supabase
            .from("calendar_changes")
            .select("id,feed_id,title,change,old_starts_at,new_starts_at,was_filed,detected_at"),
        )
          .gte("detected_at", since)
          .order("detected_at", { ascending: false })
          .limit(200),
        applyScope(supabase.from("calendar_feeds").select("id,label,last_synced_at")),
      ]);
      if (c.error) throw c.error;
      if (f.error) throw f.error;
      setRows((c.data ?? []) as CalendarChangeRow[]);
      const map: Record<string, string> = {};
      let newest: string | null = null;
      for (const feed of (f.data ?? []) as Array<{ id: string; label: string; last_synced_at: string | null }>) {
        map[feed.id] = feed.label;
        if (feed.last_synced_at && (!newest || feed.last_synced_at > newest)) newest = feed.last_synced_at;
      }
      setLabels(map);
      setLastChecked(newest);
    } catch (e: any) {
      setError(e?.message ?? "The change record could not be read.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, key]);

  useEffect(() => { if (open) void load(); }, [open, load]);

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
      toast.error({
        title: "That check did not finish",
        description: e?.message ?? "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  }

  const runs = useMemo(() => {
    const kept = filter === "all" ? rows : rows.filter((r) => r.change === filter);
    return groupChangesByCheck(kept);
  }, [rows, filter]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" />
            What changed, and when
          </SheetTitle>
          <SheetDescription className="text-xs">
            Every check Vanta ran in the last {WINDOW_DAYS} days that found something, newest first.
            {lastChecked ? ` Calendars were last ${checkedLabel(lastChecked)}.` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
                    MOTION_FOCUS,
                    filter === f.id
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={checkNow}
              disabled={busy}
            >
              <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
              {busy ? "Checking" : "Check now"}
            </Button>
          </div>

          {error ? (
            <ErrorState detail={error} onRetry={load} />
          ) : loading ? (
            <LoadingState rows={2} label="Reading the change record" />
          ) : runs.length === 0 ? (
            <EmptyState
              title={filter === "all" ? "No changes recorded yet" : "Nothing of that kind"}
              hint={
                filter === "all"
                  ? `Vanta checks your calendars on a schedule. When a meeting is added, moved, or comes off, the check that found it is written here with the before and after times. Nothing recorded means nothing moved in the last ${WINDOW_DAYS} days.`
                  : "Try Everything to see the rest of the record."
              }
              actionLabel="Check now"
              onAction={checkNow}
            />
          ) : (
            <ul className="space-y-3">
              {runs.map((run) => (
                <li key={run.at} className="rounded-lg border border-border/60 bg-surface-elevated/30 p-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[12.5px] font-medium">{runHeadline(run)}</span>
                    <MachineText className="ml-auto text-[10.5px] text-muted-foreground">
                      {checkedLabel(run.at)}
                    </MachineText>
                  </div>

                  <ul className="mt-2 space-y-2">
                    {run.rows.map((row) => {
                      const d = changeDiff(row);
                      return (
                        <li key={row.id} className="flex items-start gap-2">
                          <StatusDot tone={TONE[row.change] ?? "muted"} className="mt-1.5" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] text-foreground/95">
                              {row.title?.trim() || "An untitled entry"}
                            </p>
                            {/* before → after, so a move reads as a move. */}
                            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="uppercase tracking-wider">{d.verb}</span>
                              {d.before ? (
                                <MachineText className={cn(row.change !== "added" && "line-through decoration-muted-foreground/50")}>
                                  {d.before}
                                </MachineText>
                              ) : null}
                              {d.before && d.after ? <ArrowRight className="h-3 w-3 shrink-0" /> : null}
                              {d.after ? (
                                <MachineText className="text-foreground/85">{d.after}</MachineText>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-muted-foreground/80">
                              {labels[row.feed_id ?? ""] ?? "A calendar you linked"}
                              {row.was_filed ? " · you had this filed under a project" : ""}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">{SYNC_CADENCE_NOTE}</p>
          <AftermathHint
            className="pb-6"
            text="This is the record, not a control panel · changes to entries you filed reach Today as a nudge, and Vanta never writes back to a calendar"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
