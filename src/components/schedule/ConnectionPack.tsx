// ConnectionPack — the block for a landing you are not leaving the airport on.
//
// Doctrine:
//   - It answers the transit question only: the onward flight, the terminal, the
//     gate, and how much of the sit is really yours.
//   - Nothing is invented. An unfiled gate or terminal is said plainly and then
//     followed by where it will appear.
//   - No city pack, no trains, no SIM cards. That is a different traveller.
import { PlaneTakeoff, TimerReset } from "lucide-react";
import { cn } from "@/lib/utils";
import { MachineLabel } from "@/components/ui/instrument";
import type { ConnectionRead } from "@/lib/connectionRead";

export function ConnectionPack({
  read,
  className,
}: {
  read: ConnectionRead;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-md border p-2.5",
        read.tight ? "border-amber-400/50 bg-amber-400/5" : "border-border/60 bg-muted/15",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <PlaneTakeoff className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <MachineLabel className="text-foreground/70">Connection</MachineLabel>
      </div>

      <p className="text-[12.5px] font-medium leading-snug text-foreground">{read.lead}</p>

      <ul className="space-y-1">
        {read.detail.map((line) => (
          <li key={line} className="text-[11px] leading-snug text-foreground/85">
            {line}
          </li>
        ))}
      </ul>

      {read.tight ? (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-amber-300/90">
          <TimerReset className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          That is a tight sit on the times on record. Go straight to the board rather than the lounge.
        </p>
      ) : read.canLeave ? (
        <p className="text-[11px] leading-snug text-foreground/80">
          Long enough to leave the airport, if you want to — the walk back in is already taken off.
        </p>
      ) : null}

      <p className="text-[10.5px] leading-snug text-muted-foreground">
        You are transiting here, so Echo keeps the city notes folded away until {read.toPlace ?? "the last leg"}.
      </p>
    </div>
  );
}
