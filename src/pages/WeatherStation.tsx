// WeatherStation — the standalone sky read for your stamped ground.
//
// Doctrine:
//   - the sky is coordinate telemetry (Open-Meteo on the stamped ground),
//     never a web search. The advisory layer rides separately, clearly marked.
//   - the unit switch lives on the page, next to the numbers it changes —
//     never in a Settings drawer.
//   - "Check now" force-sweeps the local watch so the advisory strip is fresh
//     when you asked, not when the cadence felt like it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CloudRain, Loader2, RefreshCw, Waves, Wind } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SolariBoard } from "@/components/schedule/SolariBoard";
import { TempUnitToggle } from "@/components/awareness/TempUnitToggle";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/state-views";
import { formatTemp, useTempUnit } from "@/lib/tempUnit";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

type StationHour = { t: string; tempC: number; precipPct: number; code: number; windKmh: number };

type StationData = {
  place: { label: string; country: string | null; lat: number; lon: number; stampedAt: string | null };
  checkedLocal: string;
  current: {
    tempC: number; feelsC: number; humidityPct: number; condition: string;
    windKmh: number; windKn: number; windDir: string;
  };
  today: { hiC: number; loC: number };
  hours: StationHour[];
  rainWindows: Array<{ from: string; to: string; peak: number }>;
  marine: string;
  watch: {
    id: string; goal: string; state: string; sitrep: string | null;
    checkedAt: string | null; nextCheckAt: string | null;
  } | null;
  generatedAt: string;
};

const hhmm = (localIso: string) => localIso.slice(11, 16);

export default function WeatherStation() {
  const [data, setData] = useState<StationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [tempUnit] = useTempUnit();

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.functions.invoke("weather-station");
    if (e) {
      setError("The station could not be reached just now.");
    } else if ((d as { error?: string })?.error === "no_ground") {
      setData(null);
    } else if ((d as { error?: string })?.error) {
      setError("The telemetry source did not answer. That is a failed read, not a weather report.");
    } else {
      setError(null);
      setData(d as StationData);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const checkNow = useCallback(async () => {
    if (!data?.watch || sweeping) return;
    setSweeping(true);
    try {
      await supabase.functions.invoke("watch-sweep", { body: { watch_id: data.watch.id, force: true } });
      await load();
      toast({ title: "Checked.", description: "The advisory strip is fresh as of right now." });
    } catch {
      toast({ title: "Check failed.", description: "The sweep could not be reached. Try again in a moment." });
    } finally {
      setSweeping(false);
    }
  }, [data?.watch, sweeping, load]);

  const maxPrecip = useMemo(
    () => Math.max(1, ...(data?.hours ?? []).map((h) => h.precipPct)),
    [data?.hours],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <LoadingState title="Reading the sky…" description="Pulling live telemetry for your stamped ground." />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <ErrorState title="No read." description={error} onRetry={() => { setLoading(true); void load(); }} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-md px-4 pt-16">
        <EmptyState
          title="No ground to read."
          description="The station reads the sky above your stamped ground. Stamp where you are on Today and this page comes alive."
        />
        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-primary">Back to Today</Link>
        </div>
      </div>
    );
  }

  const { current, today, place } = data;

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 pb-24 pt-4">
      {/* Header — place, fix, unit switch. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/" className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ArrowLeft className="h-3 w-3" /> Today
          </Link>
          <h1 className="truncate text-lg font-semibold">{place.label}</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {place.lat.toFixed(2)}° · {place.lon.toFixed(2)}° · checked {hhmm(data.checkedLocal)} local
          </p>
        </div>
        <TempUnitToggle className="mt-4" />
      </div>

      {/* The board — current sky in split-flap. */}
      <SolariBoard
        text={`${current.condition} ${formatTemp(current.tempC, tempUnit)}`}
        className="w-full"
      />

      {/* Now — the instrument cluster. */}
      <Card className="vanta-card grid grid-cols-2 gap-3 p-4">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{formatTemp(current.tempC, tempUnit)}</div>
          <div className="text-[11px] text-muted-foreground">feels like {formatTemp(current.feelsC, tempUnit)}</div>
        </div>
        <div className="space-y-1 text-[12px] text-foreground/85">
          <div className="flex items-center gap-1.5">
            <Wind className="h-3 w-3 text-muted-foreground" />
            {Math.round(current.windKmh)} km/h ({current.windKn} kn){current.windDir ? ` ${current.windDir}` : ""}
          </div>
          <div className="flex items-center gap-1.5">
            <CloudRain className="h-3 w-3 text-muted-foreground" />
            humidity {current.humidityPct}%
          </div>
          <div className="text-muted-foreground">
            hi {formatTemp(today.hiC, tempUnit)} · lo {formatTemp(today.loC, tempUnit)}
          </div>
        </div>
      </Card>

      {/* Next 24 hours — temp line + rain bars. */}
      <Card className="vanta-card p-4">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Next 24 hours
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1">
          {data.hours.map((h, i) => (
            <div key={h.t} className="flex w-9 shrink-0 flex-col items-center gap-1">
              <span className="font-mono text-[9px] text-muted-foreground">{hhmm(h.t)}</span>
              <span className="text-[11px] tabular-nums">{formatTemp(h.tempC, tempUnit).replace("°", "°")}</span>
              <div className="flex h-10 w-4 items-end rounded-sm bg-muted/40">
                <div
                  className={cn("w-full rounded-sm", h.precipPct >= 50 ? "bg-primary/80" : "bg-primary/35")}
                  style={{ height: `${Math.max(4, Math.round((h.precipPct / maxPrecip) * 100))}%` }}
                  title={`${h.precipPct}% rain`}
                />
              </div>
              {i % 4 === 0 && <span className="font-mono text-[8.5px] text-muted-foreground/70">{h.precipPct}%</span>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-foreground/80">
          {data.rainWindows.length
            ? `Rain likely ${data.rainWindows.map((w) => `${hhmm(w.from)}–${hhmm(w.to)} (peaks ${w.peak}%)`).join(", ")}.`
            : "No rain window above 50% in the next 24 hours."}
        </p>
      </Card>

      {/* Sea & ferries — telemetry-derived, clearly a forecast. */}
      <Card className="vanta-card p-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <Waves className="h-3 w-3" /> Sea &amp; ferries
        </div>
        <p className="text-[12.5px] leading-snug text-foreground/85">{data.marine}</p>
      </Card>

      {/* Advisory strip — the watch's recorded sitrep, never blended in. */}
      <Card className="vanta-card p-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            On the record
          </span>
          {data.watch && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              disabled={sweeping}
              onClick={() => void checkNow()}
            >
              {sweeping ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Check now
            </Button>
          )}
        </div>
        {data.watch?.sitrep ? (
          <>
            <p className="text-[12.5px] leading-snug text-foreground/85">{data.watch.sitrep}</p>
            {data.watch.checkedAt && (
              <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                advisory checked {formatDistanceToNow(new Date(data.watch.checkedAt), { addSuffix: true })}
              </p>
            )}
          </>
        ) : data.watch ? (
          <p className="text-[12.5px] text-muted-foreground">
            The watch is on but has no read on record yet — Check now writes the first line.
          </p>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            No local watch is standing here. Ask Echo to keep an eye on {place.label.split(",")[0]} and its sitreps land on this strip.
          </p>
        )}
      </Card>

      <p className="px-1 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
        Open-Meteo model telemetry for these exact coordinates — a forecast, not a guarantee
      </p>
    </div>
  );
}
