// PlaceCueStrip — the whole of Awareness's presence in Today.
//
// One light line: HERE · Chantilly. No card, no border box, no icon grid, and
// no empty state — when place has nothing to add, this renders nothing at all.
// A recorded move flips the name once, like a board tile. Nothing loops.
//
// Tapping it opens what is actually on file about this spot: named places
// nearby, local changes, and your day here — three lines a group at most. The
// full detail (map, saved places, precision, trip history) lives on the Aware
// desk under Work, one tap further in.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, CloudSun, Loader2, Sparkles } from "lucide-react";
import { MachineLabel } from "@/components/ui/instrument";
import { MOTION_ARRIVE, MOTION_SIGNAL } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { PlaceCue } from "@/lib/todayContext";
import type { PlaceBoard, BoardLine, BoardGroupKey } from "@/lib/placeBoard";

export function PlaceCueStrip({
  cue,
  board,
  scanning,
  onScan,
  onOpen,
  className,
}: {
  cue: PlaceCue | null;
  /** What is on file about this spot. Absent means the strip stays one line. */
  board?: PlaceBoard | null;
  scanning?: boolean;
  onScan?: () => void;
  onOpen?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!cue?.show) return null;

  const moved = !!cue.transition;
  /* Severe boards simplify: the strip carries the place and nothing else. */
  const expandable = !!board && !cue.simplified;

  /* A brief read stays on screen without a tap: the nearest named thing, then
     the next entry on the day. Two lines at most, recorded facts only. */
  const preview: BoardLine[] = expandable && !open
    ? (() => {
        const pick = (key: BoardGroupKey) => board!.groups.find((g) => g.key === key)?.lines[0] ?? null;
        return [pick("around"), pick("day") ?? pick("changed")].filter((l): l is BoardLine => !!l).slice(0, 2);
      })()
    : [];

  return (
    <div className={cn(MOTION_ARRIVE, className)}>
      <div className="flex w-full items-center gap-2 py-1">
        <button
          type="button"
          onClick={expandable ? () => setOpen((v) => !v) : onOpen}
          aria-expanded={expandable ? open : undefined}
          aria-label={
            expandable
              ? `Where Echo is reading from: ${cue.where}. ${open ? "Hide" : "Show"} what's on file here.`
              : `Where Echo is reading from: ${cue.where}. Open the Aware desk.`
          }
          className="flex min-h-[32px] min-w-0 flex-1 items-center gap-2 rounded-sm text-left transition-colors hover:text-foreground"
        >
          <MachineLabel className="shrink-0 text-muted-foreground/70">Here</MachineLabel>

          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>

          {/* A real move gets one controlled flip, then it is just a place again. */}
          <span
            key={cue.where}
            className={cn("truncate text-[13px] leading-snug text-foreground", moved && MOTION_SIGNAL)}
          >
            {cue.where}
          </span>

          {moved && !cue.simplified ? (
            <span className="shrink-0 text-[11px] leading-snug text-muted-foreground">
              moved from {cue.transition!.from}
            </span>
          ) : null}

          {/* An aging fix says its age in words. Fading it would be a lie. */}
          {cue.freshness ? (
            <span className="ml-auto shrink-0 text-[11px] leading-snug text-muted-foreground">
              {cue.freshness}
            </span>
          ) : null}

          {expandable ? (
            <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              {board!.count > 0 ? `${board!.count} on file` : "nothing on file"}
              {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          ) : null}
        </button>
      </div>

      {/* The brief read, no tap needed. Tapping the line opens the rest. */}
      {preview.length > 0 ? (
        <div className="mb-1 space-y-0.5 border-l border-border/50 pl-3">
          {preview.map((line) => (
            <p key={line.key} className="truncate text-[12px] leading-snug text-muted-foreground">
              {line.text}
            </p>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[28px] text-[11.5px] text-primary hover:underline"
          >
            {board!.count > preview.length ? `More here (${board!.count})` : "More here"}
          </button>
        </div>
      ) : null}

      {expandable && !open && board!.count === 0 ? (
        <div className="mb-1 border-l border-border/50 pl-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-[28px] text-left text-[11.5px] text-primary hover:underline"
          >
            Nothing read around here yet — see what's missing
          </button>
        </div>
      ) : null}

      {expandable && open ? (
        <div className="mb-1 space-y-2 border-l border-border/50 pl-3">
          {board!.count === 0 ? (
            <p className="text-[11.5px] leading-snug text-muted-foreground">{board!.quiet}</p>
          ) : (
            board!.groups.map((group) => (
              <section key={group.key}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  {group.label}
                </div>
                <ul className="mt-0.5 space-y-1">
                  {group.lines.map((line) => (
                    <li key={line.key}>
                      <p className="text-[12.5px] leading-snug text-foreground/90">{line.text}</p>
                      {line.detail ? (
                        <p className="text-[11px] leading-snug text-muted-foreground">{line.detail}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
              {board!.scanLine}
            </span>
            {board!.needsScan && onScan ? (
              <button
                type="button"
                onClick={onScan}
                disabled={scanning}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-border/60 px-2 text-[11.5px] text-foreground/85 hover:text-foreground disabled:opacity-60"
              >
                {scanning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {scanning ? "Reading this spot…" : "Read this spot"}
              </button>
            ) : null}
            <Link
              to="/weather"
              className="inline-flex min-h-[32px] items-center gap-1 text-[11.5px] text-primary hover:underline"
            >
              <CloudSun className="h-3.5 w-3.5" />
              Live weather station
            </Link>
            {onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                className="ml-auto min-h-[32px] text-[11.5px] text-primary hover:underline"
              >
                The whole place desk
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
