// FlightRouteMap — your trip as a route you can tap: on a real map, or as the
// paper sketch when a map is the wrong answer.
//
// Doctrine:
//   - Every stop comes off a leg already on record. The drawing carries no
//     status: the deck above it owns the live reading.
//   - The aircraft appears only on a filed fix. No fix, no plane, and the card
//     says the track is worked out from the clock — the same words as the arc.
//   - The map is loaded only when it is shown and fenced off, so a map problem
//     can never take the words down with it.
//   - Tapping a stop reads that airport's kept facts. Nothing here is fetched.
import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, CircleDot, Globe2, Map as MapIcon, PenLine, Plane } from "lucide-react";
import { arcPath, placeStops, routeLegVisuals, routeStops } from "@/lib/routeMap";
import type { Journey } from "@/lib/journey";
import type { TrackSource } from "@/lib/flightStatus";
import type { Aircraft } from "./FlightRadarMapInner";
import { FlightRouteGlobe } from "./FlightRouteGlobe";
import { RouteStopPanel } from "./RouteStopPanel";
import { cn } from "@/lib/utils";

const FlightRadarMapInner = lazy(() =>
  import("./FlightRadarMapInner").then((m) => ({ default: m.FlightRadarMapInner })),
);

class MapFence extends Component<{ children: ReactNode; onBroken: () => void }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  componentDidCatch() {
    this.props.onBroken();
  }
  render() {
    if (this.state.broken) {
      return (
        <p className="p-3 text-[11.5px] text-muted-foreground">
          The map didn't load this time. The sketch below reads from the same record.
        </p>
      );
    }
    return this.props.children;
  }
}

const W = 320;
const H = 168;

export function FlightRouteMap({
  journey,
  homeZone,
  /** The aircraft's own filed fix, when the airline posted one. */
  aircraft = null,
  activeLegIndex = null,
  confirmedPlanIds = new Set<string>(),
  positionSource = "none",
  className,
}: {
  journey: Journey | null | undefined;
  homeZone?: string | null;
  aircraft?: Aircraft | null;
  activeLegIndex?: number | null;
  confirmedPlanIds?: ReadonlySet<string>;
  positionSource?: TrackSource;
  className?: string;
}) {
  const stops = useMemo(() => routeStops(journey), [journey]);
  const placed = useMemo(() => placeStops(stops, { width: W, height: H }), [stops]);
  const [selected, setSelected] = useState<string | null>(null);
  const legs = useMemo(() => routeLegVisuals(stops, activeLegIndex, confirmedPlanIds), [stops, activeLegIndex, confirmedPlanIds]);
  const [view, setView] = useState<"map" | "globe" | "sketch">("map");

  if (stops.length < 2) return null;

  const missing = stops.filter((s) => !s.point);
  const pick = stops.find((s) => s.iata === selected) ?? stops[0];
  const drawn = stops.filter((s) => !!s.point);

  return (
    <Card className={cn("vanta-card space-y-2.5 p-3", className)}>
      <div className="flex items-center gap-2">
        <MapIcon className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-[13px] font-medium">Your route</p>
        <div className="ml-auto flex overflow-hidden rounded-md ring-1 ring-border/60" role="group" aria-label="Route view">
          <Button
            type="button" variant="ghost"
            onClick={() => setView("map")}
            aria-pressed={view === "map"}
            className={cn(
              "vanta-focus h-8 rounded-none px-2 text-[11px] hover:bg-primary/15 hover:text-foreground",
              view === "map" ? "bg-primary/20 text-foreground" : "text-muted-foreground",
            )}
          >
            Map
          </Button>
          <Button
            type="button" variant="ghost"
            onClick={() => setView("globe")}
            aria-pressed={view === "globe"}
            className={cn("vanta-focus h-8 rounded-none px-2 text-[11px] hover:bg-primary/15 hover:text-foreground", view === "globe" ? "bg-primary/20 text-foreground" : "text-muted-foreground")}
          >
            <Globe2 className="h-3 w-3" aria-hidden />
            Globe
          </Button>
          <Button
            type="button" variant="ghost"
            onClick={() => setView("sketch")}
            aria-pressed={view === "sketch"}
            className={cn(
              "vanta-focus h-8 rounded-none px-2 text-[11px] hover:bg-primary/15 hover:text-foreground",
              view === "sketch" ? "bg-primary/20 text-foreground" : "text-muted-foreground",
            )}
          >
            <PenLine className="h-3 w-3" aria-hidden />
            Sketch
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border/60 bg-muted/15">
        {view === "map" && drawn.length > 0 ? (
          <MapFence onBroken={() => undefined}>
            <Suspense
              fallback={<p className="p-3 text-[11.5px] text-muted-foreground">Drawing the map…</p>}
            >
              <FlightRadarMapInner
                stops={placed}
                aircraft={aircraft}
                selected={pick.iata}
                 activeLegIndex={activeLegIndex}
                 confirmedPlanIds={confirmedPlanIds}
                onSelect={setSelected}
              />
            </Suspense>
          </MapFence>
        ) : view === "globe" ? (
          <FlightRouteGlobe
            stops={stops}
            aircraft={aircraft}
            activeLegIndex={activeLegIndex}
            confirmedPlanIds={confirmedPlanIds}
            selected={pick.iata}
            onSelect={setSelected}
          />
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-[168px] w-full" role="img" aria-label="Your flight route">
            {/* Paper grid. Static, decorative. */}
            {[0.25, 0.5, 0.75].map((g) => (
              <g key={g} aria-hidden>
                <line x1={W * g} y1="0" x2={W * g} y2={H} stroke="hsl(var(--border))" strokeOpacity="0.3" />
                <line x1="0" y1={H * g} x2={W} y2={H * g} stroke="hsl(var(--border))" strokeOpacity="0.3" />
              </g>
            ))}

            {placed.slice(0, -1).map((a, i) => {
              const leg = legs.find((item) => item.from.iata === a.iata && item.to.iata === placed[i + 1].iata);
              return (
              <path
                key={`${a.iata}-${placed[i + 1].iata}`}
                d={arcPath(a, placed[i + 1])}
                fill="none"
                stroke={leg?.state === "complete" ? "hsl(var(--signal))" : "hsl(var(--primary))"}
                strokeOpacity={leg?.state === "upcoming" ? "0.42" : "0.85"}
                strokeWidth={leg?.state === "current" ? "2.4" : "1.75"}
                strokeDasharray={leg?.record === "proposed" ? "4 4" : undefined}
                className={leg?.state === "current" ? "flight-arc-draw" : undefined}
                aria-hidden
              />
            );})}

            {placed.map((s) => {
              const on = s.iata === pick.iata;
              return (
                <g
                  key={s.iata}
                  role="button"
                  tabIndex={0}
                  aria-label={`${s.iata}${s.city ? ` · ${s.city}` : ""}`}
                  onClick={() => setSelected(s.iata)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelected(s.iata);
                  }}
                  className="cursor-pointer outline-none"
                >
                  <circle cx={s.x} cy={s.y} r="12" fill="transparent" />
                  {on && <circle cx={s.x} cy={s.y} r="8" fill="hsl(var(--primary))" fillOpacity="0.18" />}
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r={s.role === "stop" ? 3 : 4}
                    fill={on ? "hsl(var(--primary))" : "hsl(var(--background))"}
                    stroke="hsl(var(--primary))"
                    strokeWidth="1.5"
                  />
                  <text
                    x={s.x}
                    y={s.y - 10}
                    textAnchor="middle"
                    className="font-mono"
                    fontSize="10"
                    fill="hsl(var(--foreground))"
                    fillOpacity={on ? 0.95 : 0.7}
                  >
                    {s.iata}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <p className="text-[10.5px] text-muted-foreground/80">
        {aircraft
          ? `${aircraft.label} · provider live fix.`
          : positionSource === "clock"
            ? "Estimated position is time-interpolated on the flight strip only. This geographic view shows the route, not a radar claim."
            : "Route only · no current aircraft position on record."}
      </p>

      <details className="group rounded-md border border-border/50 bg-muted/10 px-2.5 py-2">
        <summary className="vanta-focus flex cursor-pointer list-none items-center gap-2 text-[11px] text-muted-foreground">
          <CircleDot className="h-3.5 w-3.5 text-primary" aria-hidden />
          Route options
          <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-2 grid gap-1.5 border-t border-border/40 pt-2 text-[10.5px] text-muted-foreground sm:grid-cols-2">
          <p><span className="mr-1.5 inline-block h-0.5 w-5 bg-signal align-middle" />Completed leg</p>
          <p><span className="mr-1.5 inline-block h-0.5 w-5 bg-primary align-middle" />Current confirmed leg</p>
          <p><span className="mr-1.5 inline-block w-5 border-t border-dashed border-primary/60 align-middle" />Proposed or unconfirmed leg</p>
          <p className="flex items-center gap-1.5"><Plane className="h-3 w-3 text-primary" aria-hidden />Plane requires a current provider fix</p>
        </div>
      </details>

      {missing.length > 0 && (
        <p className="text-[10.5px] text-muted-foreground/80">
          {missing.map((s) => s.iata).join(", ")} {missing.length === 1 ? "is" : "are"} on your route but Echo keeps no
          coordinate for {missing.length === 1 ? "it" : "them"}, so {missing.length === 1 ? "it is" : "they are"} not
          drawn.
        </p>
      )}

      {/* The stop you tapped, read against its own wall. */}
      <RouteStopPanel stop={pick} homeZone={homeZone} />
    </Card>
  );
}
