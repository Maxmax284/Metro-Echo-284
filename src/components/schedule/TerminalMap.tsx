// TerminalMap — the walk through the terminal, in order, opened from the board row.
//
// Doctrine:
//   - No floor plan is drawn, because Echo has no floor plan. This is the ORDER
//     of the stops with what is filed at each one, which is the part a walking
//     person actually needs.
//   - Nothing invented: a stop with nothing on record says so and names who knows.
import { Check, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TerminalStop } from "@/lib/terminalPath";

export function TerminalMap({ stops }: { stops: TerminalStop[] }) {
  if (!stops.length) return null;
  return (
    <div className="vanta-inset space-y-2 px-3 py-2.5">
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground">
        <MapPin className="h-3 w-3" aria-hidden /> Walk through the terminal
      </p>
      <ol className="space-y-2">
        {stops.map((stop, i) => (
          <li key={`${stop.key}-${i}`} className="flex gap-2.5">
            <div className="flex flex-col items-center pt-0.5">
              <span
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold",
                  stop.state === "now" && "border-primary bg-primary/20 text-primary",
                  stop.state === "done" && "border-border bg-muted text-muted-foreground",
                  stop.state === "ahead" && "border-border/70 text-muted-foreground/70",
                )}
                aria-hidden
              >
                {stop.state === "done" ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              {i < stops.length - 1 && <span className="mt-1 w-px flex-1 bg-border/70" aria-hidden />}
            </div>
            <div className="min-w-0 pb-0.5">
              <p
                className={cn(
                  "text-[12px] font-medium",
                  stop.state === "now" ? "text-foreground" : "text-foreground/80",
                )}
              >
                {stop.label}
                {stop.state === "now" && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-primary">you are here</span>}
              </p>
              <p className="text-[11.5px] leading-snug text-muted-foreground">{stop.where}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[11px] leading-snug text-muted-foreground/80">
        Order only — Echo has no floor plan for this terminal. Signs and the board in the hall place these.
      </p>
    </div>
  );
}
