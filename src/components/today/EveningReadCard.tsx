// EveningReadCard — "What's left today", on a tap.
//
// One sentence: what is still on the calendar before midnight, and the weather
// window for those hours. It composes what Echo already read; it fetches
// nothing, scans nothing and never runs anything. Missing forecast stays
// missing rather than becoming a reassuring line.
import { useState } from "react";
import { Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineLabel } from "@/components/ui/instrument";
import { WhyThis } from "@/components/ui/why-this";
import { useAgenda } from "@/hooks/useAgenda";
import { useAwareness } from "@/providers/AwarenessProvider";
import { eveningRead } from "@/lib/eveningRead";
import { placeTruth } from "@/lib/placeTruth";
import { useTempUnit } from "@/lib/tempUnit";

export function EveningReadCard({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [tempUnit] = useTempUnit();
  const { events } = useAgenda();
  const { snapshot, place } = useAwareness();

  const weather = snapshot?.compact?.weather ?? null;
  /* The place is named through the one truth reader, so this line can never
     read out a saved label like "Spot 4:47" as if it were a city. */
  const placeName = placeTruth(place).name;
  const read = eveningRead({
    events: (events ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      location: e.location,
      all_day: e.all_day,
    })),
    forecast: (weather?.hourly ?? []).map((h) => ({
      at: h.at,
      tempC: h.tempC,
      condition: h.condition,
      rainChance: h.rainChance,
    })),
    placeLabel: placeName,
    unit: tempUnit,
  });

  return (
    <section className={className}>
      <div className="vanta-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Moon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <MachineLabel className="text-foreground/70">The rest of today</MachineLabel>
          </div>
          {!open && (
            <Button size="sm" variant="outline" className="h-8 shrink-0 text-[12px]" onClick={() => setOpen(true)}>
              Read it
            </Button>
          )}
        </div>

        {open ? (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{read.sentence}</p>
            <div className="mt-2">
              <WhyThis
                reason={[
                  read.ahead.length > 0
                    ? `${read.ahead.length} ${read.ahead.length === 1 ? "entry" : "entries"} left before midnight, from your connected calendar.`
                    : "No calendar entries left before midnight.",
                  read.hours.length > 0
                    ? `${read.hours.length} forecast ${read.hours.length === 1 ? "hour" : "hours"} read${weather?.updated_at ? ` at ${new Date(weather.updated_at).toLocaleTimeString()}` : ""}${placeName ? ` for ${placeName}` : ""}.`
                    : "No forecast has been read for the rest of today.",
                  "Nothing here was searched for or guessed. Reading this changes nothing.",
                ].join(" ")}
              />
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
            What is still on the calendar tonight, and what the sky is doing for those hours. One
            sentence, only when you ask.
          </p>
        )}
      </div>
    </section>
  );
}
