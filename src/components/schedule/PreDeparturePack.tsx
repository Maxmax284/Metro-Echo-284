// PreDeparturePack — the countdown errands on the flight card.
//
// Doctrine:
//   - A short list with times, not a checklist. Nothing here is ticked off,
//     stored, or synced — it is worked out from the departure time each look.
//   - It only renders when preDeparturePack says there is something worth
//     saying, and it always carries its own honesty line.
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreDeparturePack as Pack } from "@/lib/preDeparture";

export function PreDeparturePack({ pack, lead = false }: { pack: Pack; lead?: boolean }) {
  if (!pack.show) return null;
  return (
    <div className={cn("vanta-inset space-y-1.5 px-3 py-2", lead && "px-3 py-3")}>
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground">
        <Clock className="h-3 w-3" aria-hidden /> Before you leave
      </p>
      <ul className="space-y-1">
        {pack.items.map((item) => (
          <li key={item.key} className="text-[12px] leading-snug">
            <span className="font-medium text-foreground">{item.label}: </span>
            <span className="text-muted-foreground">{item.words}</span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-snug text-muted-foreground/80">{pack.note}</p>
    </div>
  );
}
