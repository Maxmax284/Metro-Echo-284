// AirportClock — the local clock at an airport you are standing in, right now.
//
// Doctrine:
//   - The zone comes from the airport on record. An airport Echo does not keep
//     has no clock here, and that is said plainly rather than filled in.
//   - It never changes the clock Echo keeps for you. It states the difference.
//   - It ticks on the minute, from the airport's own zone, never the browser's.
import { useEffect, useMemo, useState } from "react";
import { arrivalFacts, shiftWords } from "@/lib/arrivalFacts";
import { cn } from "@/lib/utils";
import { SolariBoard } from "./SolariBoard";

export function AirportClock({
  iata,
  homeZone,
  /** What the airport is to this trip — read out loud on the board. */
  label = "Local time where you are",
  className,
}: {
  iata: string | null | undefined;
  homeZone?: string | null;
  label?: string;
  className?: string;
}) {
  /* Tick every half minute so the board never sits on a stale minute. */
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date().toISOString()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const f = useMemo(() => arrivalFacts(iata, now, homeZone), [iata, now, homeZone]);
  if (!f) return null;

  const shift = shiftWords(f);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
        {f.localTime ? (
          <SolariBoard text={f.localTime} label={label} tone="primary" />
        ) : (
          <p className="text-[10.5px] text-muted-foreground/80">
            {f.iata} is not in Echo's airport table, so there is no local clock for it here.
          </p>
        )}
        {f.localDate && <SolariBoard text={f.localDate} label="Local date" />}
      </div>
      {f.localTime && (
        <p className="text-[11px] text-foreground/80">
          {f.localTime} at {f.city ?? f.iata}
          {f.country ? `, ${f.country}` : ""}.{shift ? ` ${shift}` : ""} Echo keeps your clock until you say
          switch.
        </p>
      )}
    </div>
  );
}
