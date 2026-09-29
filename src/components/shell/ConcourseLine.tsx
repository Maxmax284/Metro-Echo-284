// ConcourseLine — the station route map above the dock.
//
// One lit rail, four stops, and a travelling light that slides to the room
// you just pulled into. It is the same map the tabs below it describe, drawn
// as track: the buttons carry the words and the actions, so the line stays
// presentational (aria-hidden) and never repeats their job.
//
// Doctrine:
//   - The light only travels when the room actually changes — motion is an
//     event, never idle decoration.
//   - A station with a real signal (unread news) shows an amber ring; nothing
//     is invented, the ring only wears what RoomSignal already knows.
//   - Reduced motion gets the same map with no slide and no pulse.
import { cn } from "@/lib/utils";
import type { RoomKey } from "@/lib/navigation";
import type { RoomSignal as RoomSignalState } from "@/lib/roomSignals";

/* Station centres line up with the four equal-width tabs below the rail. */
const STOPS: { key: RoomKey; pos: string }[] = [
  { key: "today", pos: "12.5%" },
  { key: "work", pos: "37.5%" },
  { key: "ask", pos: "62.5%" },
  { key: "receipts", pos: "87.5%" },
];

export function ConcourseLine({
  active,
  signals = {},
}: {
  active: RoomKey;
  signals?: Partial<Record<RoomKey, RoomSignalState>>;
}) {
  const activePos = STOPS.find((s) => s.key === active)?.pos ?? STOPS[0].pos;

  return (
    <div aria-hidden className="relative mx-2 h-[13px]">
      {/* The rail itself. */}
      <span className="absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-border/50" />

      {/* The travelling light — slides to whichever station you pulled into. */}
      <span
        className="absolute top-1/2 h-[2px] w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent via-primary/90 to-transparent transition-[left] duration-[var(--motion-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
        style={{ left: activePos }}
      />

      {STOPS.map(({ key, pos }) => {
        const isActive = key === active;
        const hasSignal = Boolean(signals[key]);
        const accent = key === "ask";
        return (
          <span
            key={key}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos }}
          >
            {hasSignal && !isActive && (
              <span className="absolute inset-0 -m-[3px] rounded-full ring-2 ring-warn/50 motion-safe:animate-pulse" />
            )}
            <span
              className={cn(
                "block h-[7px] w-[7px] rounded-full border transition-all duration-300 ease-[var(--ease-out)] motion-reduce:transition-none",
                isActive
                  ? accent
                    ? "scale-125 border-accent bg-accent drop-shadow-[0_0_6px_hsl(var(--accent)/0.8)]"
                    : "scale-125 border-primary bg-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.8)]"
                  : "border-border/80 bg-background",
              )}
            />
          </span>
        );
      })}
    </div>
  );
}
