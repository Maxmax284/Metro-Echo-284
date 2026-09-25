// PlaceSwitcherRail — one tap to move the board between the places you keep.
//
// Doctrine:
//   - The live fix is always first and always labelled live, so a saved board is
//     never mistaken for where you are standing.
//   - Switching only changes what you are reading. It never moves your fix and
//     never writes anything.
import { MapPin, Radio } from "lucide-react";
import { play } from "@/lib/streetSound";
import { cn } from "@/lib/utils";

export type SwitchablePlace = {
  id: string;
  label: string;
  city: string | null;
  region: string | null;
  country: string | null;
};

/** Short, readable word for the rail — the town, not the full address. */
function chipName(p: SwitchablePlace): string {
  const name = p.city ?? p.label;
  return name.split(",")[0].trim().slice(0, 22);
}

export function PlaceSwitcherRail({
  places,
  activeId,
  liveId,
  onSelect,
  className,
}: {
  places: SwitchablePlace[];
  /** Which place the board is reading right now. */
  activeId: string | null;
  /** The place holding your current device fix, if any. */
  liveId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  if (places.length < 2) return null;
  return (
    <div className={cn("relative", className)}>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Your places
      </p>
      <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {places.map((p) => {
          const on = p.id === (activeId ?? liveId);
          const live = p.id === liveId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { if (!on) { onSelect(p.id); play("tick", { gain: 0.4 }); } }}
              aria-pressed={on}
              className={cn(
                "field-tab inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[3px] border px-2.5 text-[12px] font-medium",
                on
                  ? "border-primary/55 bg-primary/10 text-foreground"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {live ? <Radio className="h-3.5 w-3.5 text-primary/80" /> : <MapPin className="h-3.5 w-3.5" />}
              <span className="truncate">{chipName(p)}</span>
              {live ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary/80">live</span>
              ) : p.country ? (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                  {p.country.slice(0, 12)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
