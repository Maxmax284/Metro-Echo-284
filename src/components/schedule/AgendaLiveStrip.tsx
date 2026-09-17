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
  const railWidth = Math.max(300, timeline.markers.length * 112);

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

      <div className="-mx-1 mt-3 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:thin]">
        <div className="relative h-[70px]" style={{ width: `${railWidth}px` }}>
          <div className="absolute inset-x-0 top-5 h-px bg-border" aria-hidden />
          {timeline.markers.map((marker, index) => {
            const left = position(marker.startMinute, timeline.startMinute, timeline.endMinute);
            const active = marker.id === timeline.activeId;
            const passed = timeline.nowMinute != null && marker.startMinute < timeline.nowMinute;
            const align = index === 0 ? "translate-x-0 text-left" : index === timeline.markers.length - 1 ? "-translate-x-full text-right" : "-translate-x-1/2 text-center";
            return (
              <span
                key={marker.id}
                className={cn("absolute top-0 w-24", align)}
                style={{ left: `${left}%` }}
              >
                <span className="block text-[10px] tabular-nums text-muted-foreground">{clock(marker.startMinute)}</span>
                <span className="relative mx-auto mt-1 block h-4 w-4" aria-hidden>
                  {active && <span className="absolute inset-1 animate-live-ping rounded-full bg-primary/50 motion-reduce:animate-none" />}
                  <span className={cn("absolute left-1/2 top-0 h-4 w-0.5 -translate-x-1/2 rounded-full", active ? "bg-primary" : passed ? "bg-foreground/35" : "bg-foreground/65")} />
                </span>
                <span className={cn("mt-1 block truncate text-[10.5px]", active ? "font-medium text-primary" : "text-foreground/75")} title={marker.title}>
                  {marker.title}
                </span>
              </span>
            );
          })}
          {timeline.nowMinute != null && (
            <span
              className="absolute top-3 h-6 w-px bg-primary transition-[left] duration-[var(--motion-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
              style={{ left: `${position(timeline.nowMinute, timeline.startMinute, timeline.endMinute)}%` }}
              aria-label={`Now, ${formatInTimeZone(now, timezone, "HH:mm")}`}
            >
              <Clock3 className="absolute -left-1.5 -top-2 h-3 w-3 text-primary" aria-hidden />
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] tabular-nums text-muted-foreground/70" aria-hidden>
            <span>{clock(timeline.startMinute)}</span>
            <span>{clock(timeline.endMinute)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}