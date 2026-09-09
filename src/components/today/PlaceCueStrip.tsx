// PlaceCueStrip — the whole of Awareness's presence in Today.
//
// One light line: HERE · Chantilly. No card, no border box, no icon grid, and
// no empty state — when place has nothing to add, this renders nothing at all.
// A recorded move flips the name once, like a board tile. Nothing loops.
//
// Deeper location work (map, saved places, precision, scans, trips) lives in
// the Aware desk under Work. This strip is only the executive cut, and tapping
// it goes there.
import { MachineLabel } from "@/components/ui/instrument";
import { MOTION_ARRIVE, MOTION_SIGNAL } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { PlaceCue } from "@/lib/todayContext";

export function PlaceCueStrip({
  cue,
  onOpen,
  className,
}: {
  cue: PlaceCue | null;
  onOpen?: () => void;
  className?: string;
}) {
  if (!cue?.show) return null;

  const moved = !!cue.transition;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      aria-label={`Where Echo is reading from: ${cue.where}. Open the Aware desk.`}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm py-1 text-left",
        "transition-colors hover:text-foreground disabled:cursor-default",
        MOTION_ARRIVE,
        className,
      )}
    >
      <MachineLabel className="shrink-0 text-muted-foreground/70">Here</MachineLabel>

      <span className="text-muted-foreground/40" aria-hidden>
        ·
      </span>

      {/* A real move gets one controlled flip, then it is just a place again. */}
      <span
        key={cue.where}
        className={cn(
          "truncate text-[13px] leading-snug text-foreground",
          moved && MOTION_SIGNAL,
        )}
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
    </button>
  );
}
