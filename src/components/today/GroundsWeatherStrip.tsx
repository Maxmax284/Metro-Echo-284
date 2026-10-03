// GroundsWeatherStrip — every stamped ground's sky, one glance, on Today.
//
// One light line of chips: each genuine fix you have stamped, its current
// temperature in your unit, tapping through to that ground's full weather
// station. Saved reading places never appear — a place you read about is
// not a ground you stood on. Renders nothing when there is no ground at
// all; the empty state stays the station page's job.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { formatTemp, useTempUnit } from "@/lib/tempUnit";
import { cn } from "@/lib/utils";

type GroundReading = {
  id: string;
  label: string;
  tempC: number;
  condition: string;
};

export function GroundsWeatherStrip({ className }: { className?: string }) {
  const [grounds, setGrounds] = useState<GroundReading[]>([]);
  const [tempUnit] = useTempUnit();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.functions.invoke("weather-station", { body: { mode: "grounds" } });
      const list = (data as { grounds?: GroundReading[] } | null)?.grounds;
      if (alive && Array.isArray(list)) {
        setGrounds(list.filter((g) => Number.isFinite(g.tempC)));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (grounds.length === 0) return null;

  return (
    <div className={cn("flex gap-1.5 overflow-x-auto pb-1", className)}>
      {grounds.map((g) => (
        <Link
          key={g.id}
          to={`/weather?place=${g.id}`}
          className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] text-muted-foreground ring-1 ring-border/50 transition-colors hover:text-foreground"
        >
          <span className="truncate">{g.label.split(",")[0]}</span>
          <span className="tabular-nums text-foreground/85">{formatTemp(g.tempC, tempUnit)}</span>
        </Link>
      ))}
    </div>
  );
}
