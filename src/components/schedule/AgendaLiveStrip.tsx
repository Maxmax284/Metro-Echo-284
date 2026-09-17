import { useEffect, useMemo, useState } from "react";
import { Activity, Clock3 } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { buildAgendaTimeline, type BoardEntry } from "@/lib/agendaBoard";
import { MOTION_ARRIVE, MOTION_FLIP } from "@/lib/motion";
import { cn } from "@/lib/utils";

function position(minute: number, start: number, end: number): number {
  return Math.max(0, Math.min(100, ((minute - start) / Math.max(1, end - start)) * 100));
}

function clearWords(minutes: number): string {
  if (minutes < 60) return `${minutes} min clear`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m clear` : `${hours}h clear`;
}

export function AgendaLiveStrip({
  entries,
  selectedDayKey,
  timezone,
}: {
  entries: BoardEntry[];
  selectedDayKey: string;
  timezone: string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const timeline = useMemo(
    () => buildAgendaTimeline(entries, selectedDayKey, timezone, now),
    [entries, selectedDayKey, timezone, now],
  );

  if (!timeline) return null;

  const clock = (minute: number) => {
    const h = Math.floor(minute / 60) % 24;
    const m = minute % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const stateWords = timeline.status === "now"
    ? `Now · ${timeline.statusTitle}`
    : timeline.status === "clear" && timeline.clearMinutes != null
      ? `${clearWords(timeline.clearMinutes)} · next ${timeline.statusTitle}`
      : timeline.status === "complete"
        ? "Day complete"
        : `Next · ${timeline.statusTitle}`;

  return (
    <div
      key={selectedDayKey}
      className={cn("mb-3 rounded-md border border-border/60 bg-muted/20 p-2.5", MOTION_ARRIVE)}
      aria-label={`Day timeline. ${stateWords}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          {timeline.status === "now" && (
            <span className="absolute inline-flex h-full w-full animate-live-ping rounded-full bg-primary opacity-70 motion-reduce:animate-none" />
          )}
          <span className={cn(
            "relative inline-flex h-2.5 w-2.5 rounded-full",
            timeline.status === "complete" ? "bg-muted-foreground/60" : "bg-primary",
          )} />
        </span>
        <Activity className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p className={cn("min-w-0 truncate text-[11.5px] font-medium text-foreground/85", MOTION_FLIP)}>
          {stateWords}
        </p>
        {timeline.nowMinute != null && (
          <p className="ml-auto shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
            {formatInTimeZone(now, timezone, "HH:mm")}
          </p>
        )}
      </div>

      <div className="mt-3 px-1">
        <div className="relative h-8" aria-hidden>
          <div className="absolute inset-x-0 top-3 h-px bg-border" />
          {timeline.markers.map((marker) => {
            const left = position(marker.startMinute, timeline.startMinute, timeline.endMinute);
            const active = marker.id === timeline.activeId;
            return (
              <span
                key={marker.id}
                className="absolute top-1 -translate-x-1/2"
                style={{ left: `${left}%` }}
              >
                {active && (
                  <span className="absolute -left-1 -top-1 h-4 w-4 animate-live-ping rounded-full bg-primary/40 motion-reduce:animate-none" />
                )}
                <span className={cn(
                  "relative block h-4 w-0.5 rounded-full",
                  active ? "bg-primary" : "bg-foreground/55",
                )} />
              </span>
            );
          })}
          {timeline.nowMinute != null && (
            <span
              className="absolute top-0 h-6 w-px bg-primary transition-[left] duration-[var(--motion-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
              style={{ left: `${position(timeline.nowMinute, timeline.startMinute, timeline.endMinute)}%` }}
            >
              <Clock3 className="absolute -left-1.5 -top-1.5 h-3 w-3 text-primary" />
            </span>
          )}
        </div>
        <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground/80">
          <span>{clock(timeline.startMinute)}</span>
          <span>{clock(timeline.endMinute)}</span>
        </div>
      </div>
    </div>
  );
}