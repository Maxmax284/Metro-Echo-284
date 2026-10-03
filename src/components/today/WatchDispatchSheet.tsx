// WatchDispatchSheet — the inspection slip behind a radar row.
//
// Tapping a watch on Today's board should never throw you across the
// concourse. The slip opens in place and shows everything the row
// abbreviates: the full goal, the headline Echo actually saw, the recorded
// sweep log from the receipts, and the controls (check, pause, stop).
// The log loads on open — the board itself stays one read. When nothing
// has been recorded yet the slip says so instead of filling the silence.
//
// Echo is the escalation, not the default: "Dig deeper with Echo" sits at
// the bottom for when the slip is not enough, prefilled and never sent
// for you.
import { useEffect, useState } from "react";
import { ChevronRight, CloudSun, MessageSquare, Pause, Play, Radio, Square } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LoadingState } from "@/components/ui/state-views";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAskContext } from "@/hooks/useAskContext";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { humanizeEvent } from "@/lib/plainLabels";
import { checkWords, debriefPrompt, spanWords } from "@/lib/radar";
import { looksLikeWeather } from "@/lib/weatherWords";
import { formatTemp, useTempUnit } from "@/lib/tempUnit";
import { cn } from "@/lib/utils";
import {
  CHECKABLE_WATCH_STATES,
  OPEN_WATCH_STATES,
  WATCH_TONE,
  checkNowLine,
  checkWatchNow,
  pauseWatch,
  resumeWatch,
  stopWatch,
  watchLine,
  type Watch,
} from "@/lib/watch";

type SweepEntry = { event: string; at: string };

type SweepLog =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; entries: SweepEntry[] }
  | { state: "quiet" };

/** The recorded sweeps for one watch — loaded on open, never before. */
function useSweepLog(watchId: string | null, open: boolean): SweepLog {
  const { user } = useAuth();
  const [log, setLog] = useState<SweepLog>({ state: "idle" });

  useEffect(() => {
    if (!open || !user || !watchId) return;
    setLog({ state: "loading" });
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("event, created_at")
        .eq("user_id", user.id)
        .eq("entity_type", "watch")
        .eq("entity_id", watchId)
        .like("event", "watch.%")
        .order("created_at", { ascending: false })
        .limit(12);
      if (!alive) return;
      const entries = (data ?? []) as Array<{ event: string; created_at: string }>;
      if (error || entries.length === 0) {
        setLog({ state: "quiet" });
        return;
      }
      setLog({ state: "ready", entries: entries.map((r) => ({ event: r.event, at: r.created_at })) });
    })();
    return () => {
      alive = false;
    };
  }, [open, user, watchId]);

  return log;
}

type StationSky = {
  tempC: number;
  feelsC: number;
  condition: string;
  rain: string | null;
} | null;

/** The live sky for a conditions watch — read on open from the same station
    the /weather page reads, so the slip and the page never disagree. */
function useStationSky(enabled: boolean, open: boolean): { sky: StationSky; loading: boolean } {
  const [sky, setSky] = useState<StationSky>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !enabled) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const { data } = await supabase.functions.invoke("weather-station");
      if (!alive) return;
      const d = data as {
        current?: { tempC: number; feelsC: number; condition: string };
        rainWindows?: Array<{ from: string; to: string }>;
      } | null;
      if (d?.current) {
        const w = d.rainWindows?.[0];
        setSky({
          tempC: d.current.tempC,
          feelsC: d.current.feelsC,
          condition: d.current.condition,
          rain: w ? `${w.from.slice(11, 16)}–${w.to.slice(11, 16)}` : null,
        });
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, enabled]);
  return { sky, loading };
}

export function WatchDispatchSheet({
  watch,
  open,
  onOpenChange,
  onChanged,
}: {
  /** The live row from the board — after a check the parent refreshes and
      this same slip shows the new truth without closing. */
  watch: Watch | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { openAskWithContext } = useAskContext();
  const [busy, setBusy] = useState<"check" | "pause" | "stop" | null>(null);
  const log = useSweepLog(watch?.id ?? null, open);
  const weatherWatch = !!watch && looksLikeWeather(watch.goal);
  const { sky, loading: skyLoading } = useStationSky(weatherWatch, open);
  const [tempUnit] = useTempUnit();

  if (!watch) return null;
  const checkable = (CHECKABLE_WATCH_STATES as string[]).includes(watch.state);
  const isOpen = (OPEN_WATCH_STATES as string[]).includes(watch.state);

  const run = async (kind: "check" | "pause" | "stop", fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.fromError(e);
    } finally {
      setBusy(null);
    }
  };

  const check = () =>
    run("check", async () => {
      const res = await checkWatchNow(watch.id);
      toast.success(checkNowLine(res));
    });

  const pause = () =>
    run("pause", async () => {
      await pauseWatch(watch.id, watch.goal);
      toast.success("Paused — Echo is not checking this right now.");
    });

  const resume = () =>
    run("pause", async () => {
      await resumeWatch(watch.id, watch.goal);
      toast.success("Back on it — the next check runs on schedule.");
    });

  const stop = () =>
    run("stop", async () => {
      await stopWatch(watch.id, watch.goal);
      toast.success("Stopped. Echo will not check that again.");
    });

  /* The one door out of the room — a real question, typed, never sent. */
  const digDeeper = () => {
    onOpenChange(false);
    void openAskWithContext({
      kind: "watch",
      id: watch.id,
      label: watch.goal,
      question: debriefPrompt(watch.goal),
      expand: true,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 pb-6 pt-4">
        <SheetHeader className="text-left">
          <span
            className={cn(
              "w-fit rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
              WATCH_TONE[watch.state],
            )}
          >
            {watch.state === "needs_you" ? "Needs you" : watch.state === "on_it" ? "Echo's on it" : watch.state}
          </span>
          <SheetTitle className="text-sm leading-snug">{watch.goal}</SheetTitle>
          <SheetDescription className="text-[11px]">{checkWords(watch)}</SheetDescription>
        </SheetHeader>

        {/* What Echo actually saw — the bulletin's top line, said large. */}
        {watch.last_read && (
          <div className="mt-3 vanta-inset px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Top of the board</p>
            <p className="mt-1 text-xs leading-snug text-foreground">{watch.last_read}</p>
          </div>
        )}

        {/* The sky card — conditions watches carry the live instruments next
            to the sitrep, so a month-old advisory never reads as today's sky.
            Telemetry time is its own receipt, separate from the sweep's. */}
        {weatherWatch && (
          <div className="mt-3 vanta-inset px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <CloudSun className="h-3 w-3" /> Right now, from the instruments
            </p>
            {skyLoading ? (
              <p className="mt-1 text-xs text-muted-foreground">Reading the sky…</p>
            ) : sky ? (
              <>
                <p className="mt-1 text-xs leading-snug text-foreground">
                  {formatTemp(sky.tempC, tempUnit)}, feels {formatTemp(sky.feelsC, tempUnit)} · {sky.condition}
                  {sky.rain ? ` · rain ${sky.rain}` : " · no rain window above 50% in 24h"}
                </p>
                {watch.telemetry_at && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    instruments checked {spanWords(Date.now() - Date.parse(watch.telemetry_at))} ago
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                No instrument read just now — the sitrep above is what is on record.
              </p>
            )}
          </div>
        )}

        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{watchLine(watch)}</p>

        {/* The sweep log — every recorded check, plain words, newest first. */}
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sweep log</p>
          {log.state === "loading" || log.state === "idle" ? (
            <LoadingState className="py-3" />
          ) : log.state === "quiet" ? (
            <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
              Nothing on the record yet — the first sweep writes the first line here.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {log.entries.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="text-foreground/85">{humanizeEvent(e.event)}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {spanWords(Date.now() - Date.parse(e.at))} ago
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* The call-box controls — in place, on the slip. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {checkable && (
            <button
              onClick={() => void check()}
              disabled={busy !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary/15 px-3 text-xs font-medium text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/25 disabled:opacity-50"
            >
              <Radio className="h-3.5 w-3.5" />
              {busy === "check" ? "Checking…" : "Check now"}
            </button>
          )}
          {isOpen && (
            <button
              onClick={() => void pause()}
              disabled={busy !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-muted/40 px-3 text-xs text-foreground ring-1 ring-border/60 transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              <Pause className="h-3.5 w-3.5" />
              Pause
            </button>
          )}
          {watch.state === "paused" && (
            <button
              onClick={() => void resume()}
              disabled={busy !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary/15 px-3 text-xs font-medium text-primary ring-1 ring-primary/30 transition-colors hover:bg-primary/25 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
          {(isOpen || watch.state === "paused") && (
            <button
              onClick={() => void stop()}
              disabled={busy !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-muted/40 px-3 text-xs text-muted-foreground ring-1 ring-border/60 transition-colors hover:text-foreground disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          )}
        </div>

        {/* Escalation — Echo is one door further, never the default. */}
        <button
          onClick={digDeeper}
          className="mt-4 flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 text-xs text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/10"
        >
          <span className="inline-flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            Dig deeper with Echo
          </span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </SheetContent>
    </Sheet>
  );
}
