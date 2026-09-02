// RoomHelp — one shape of help for every room.
//
// Doctrine: help is written, not generated, so opening it costs nothing and
// never guesses. Every room answers the same six questions in the same order —
// including the two most rooms skip: what it will never do, and why it can look
// empty. This component reads no state and performs no action.
import { ROOM_HELP, ROOM_HELP_ORDER, type RoomKey } from "@/lib/roomCopy";
import { cn } from "@/lib/utils";

export const ROOM_HELP_LABEL: Record<RoomKey, string> = {
  today: "Today",
  work: "Work",
  ask: "Ask",
  receipts: "Receipts",
  settings: "Settings",
};

export function RoomHelp({ room, className }: { room: RoomKey; className?: string }) {
  const copy = ROOM_HELP[room];

  return (
    <dl className={cn("space-y-2", className)}>
      {ROOM_HELP_ORDER.map(({ key, label }) => (
        <div key={key} className="border-l-2 border-border/60 pl-2.5">
          <dt className="vanta-machine-label text-[10px] text-foreground/60">{label}</dt>
          <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{copy[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
