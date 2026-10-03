// WorkWeatherShelf — the grounds' skies, on the Work desk.
//
// Meetings and travel read the same sky as Today: one chip per stamped
// ground with its current temperature in your unit, tapping through to that
// ground's full weather station. The °C/°F flip lives right here in context
// — never in Settings. Renders nothing when there is no ground to read;
// the quiet state stays the station page's job.
import { CloudSun } from "lucide-react";
import { Link } from "react-router-dom";
import { TempUnitToggle } from "@/components/awareness/TempUnitToggle";
import { useGroundsWeather } from "@/components/today/GroundsWeatherStrip";
import { formatTemp, useTempUnit } from "@/lib/tempUnit";

export function WorkWeatherShelf() {
  const grounds = useGroundsWeather();
  const [tempUnit] = useTempUnit();

  if (grounds.length === 0) return null;

  return (
    <div className="vanta-card p-3">
      <div className="flex items-center gap-2">
        <CloudSun className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-medium">Skies on your grounds</h3>
        <span className="ml-auto">
          <TempUnitToggle />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {grounds.map((g) => (
          <Link
            key={g.id}
            to={`/weather?place=${g.id}`}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-2.5 text-[11.5px] text-muted-foreground ring-1 ring-border/50 transition-colors hover:text-foreground"
          >
            <span className="truncate">{g.label.split(",")[0]}</span>
            <span className="tabular-nums text-foreground/85">{formatTemp(g.tempC, tempUnit)}</span>
          </Link>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        Same sky as Today — tap a ground before a meeting or a crossing.{" "}
        <Link to="/weather" className="text-primary hover:underline">
          Open the weather station
        </Link>
      </p>
    </div>
  );
}
