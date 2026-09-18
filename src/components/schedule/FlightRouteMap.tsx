// FlightRouteMap — your trip drawn as a route you can tap, stop by stop.
//
// Doctrine:
//   - Every stop comes off a leg already on record. The drawing carries no
//     status: the deck above it owns the live reading.
//   - Tapping a stop reads that airport's kept facts — clock, money, emergency —
//     behind the painted wall Echo keeps for that city. A city with no wall gets
//     the plain plate and says so.
//   - Nothing here is fetched. No airport lookup, no rate, no position claim.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { arrivalFacts, helpCells, shiftWords } from "@/lib/arrivalFacts";
import { wallFor } from "@/lib/placeWalls";
import { arcPath, placeStops, routeStops } from "@/lib/routeMap";
import type { Journey } from "@/lib/journey";
import { cn } from "@/lib/utils";

const W = 320;
const H = 168;

export function FlightRouteMap({
  journey,
  homeZone,
  className,
}: {
  journey: Journey | null | undefined;
  /** The clock Echo is keeping, so each stop can state the difference. */
  homeZone?: string | null;
  className?: string;
}) {
  const stops = useMemo(() => routeStops(journey), [journey]);
  const placed = useMemo(() => placeStops(stops, { width: W, height: H }), [stops]);
  const [selected, setSelected] = useState<string | null>(null);

  if (stops.length < 2) return null;

  const missing = stops.filter((s) => !s.point);
  const pick = stops.find((s) => s.iata === selected) ?? stops[0];
  const facts = arrivalFacts(pick.iata, pick.at, homeZone);
  const wall = wallFor({ city: pick.city, country: pick.country });
  const shift = facts ? shiftWords(facts) : null;
  const help = facts ? helpCells(facts) : null;

  return (
    <Card className={cn("vanta-card space-y-2.5 p-3", className)}>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" aria-hidden />
        <p className="text-[13px] font-medium">Your route</p>
        <p className="ml-auto text-[11px] text-muted-foreground">Tap a stop</p>
      </div>

      <div className="overflow-hidden rounded-md border border-border/60 bg-muted/15">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-[168px] w-full" role="img" aria-label="Your flight route">
          {/* Paper grid. Static, decorative. */}
          {[0.25, 0.5, 0.75].map((g) => (
            <g key={g} aria-hidden>
              <line x1={W * g} y1="0" x2={W * g} y2={H} stroke="hsl(var(--border))" strokeOpacity="0.3" />
              <line x1="0" y1={H * g} x2={W} y2={H * g} stroke="hsl(var(--border))" strokeOpacity="0.3" />
            </g>
          ))}

          {placed.slice(0, -1).map((a, i) => (
            <path
              key={`${a.iata}-${placed[i + 1].iata}`}
              d={arcPath(a, placed[i + 1])}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeOpacity="0.75"
              strokeWidth="1.75"
              className="flight-arc-draw"
              aria-hidden
            />
          ))}

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
                {on && (
                  <circle cx={s.x} cy={s.y} r="8" fill="hsl(var(--primary))" fillOpacity="0.18" />
                )}
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
      </div>

      {missing.length > 0 && (
        <p className="text-[10.5px] text-muted-foreground/80">
          {missing.map((s) => s.iata).join(", ")} {missing.length === 1 ? "is" : "are"} on your route but Echo keeps no
          coordinate for {missing.length === 1 ? "it" : "them"}, so {missing.length === 1 ? "it is" : "they are"} not
          drawn.
        </p>
      )}

      {/* The stop you tapped, read against its own wall. */}
      <div className="relative overflow-hidden rounded-md border border-border/60 bg-muted/15 p-2.5">
        {wall && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.22]"
            style={{ backgroundImage: `url(${wall.url})` }}
          />
        )}
        <div className="relative space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-street text-lg tracking-wide">{pick.iata}</span>
            <span className="text-[12.5px] text-foreground/85">
              {pick.city ? `${pick.city}${pick.country ? `, ${pick.country}` : ""}` : "not in Echo's airport table"}
            </span>
            <span className="ml-auto vanta-machine-label text-foreground/60">
              {pick.role === "origin" ? "you leave from here" : pick.role === "final" ? "you end here" : "you change here"}
            </span>
          </div>

          <div className="space-y-1 text-[11.5px] text-foreground/85">
            {facts?.localTime ? (
              <p>
                {pick.role === "origin" ? "Leaves" : "Lands"} {facts.localTime} local
                {facts.localDate ? ` · ${facts.localDate}` : ""}.
              </p>
            ) : (
              <p className="text-muted-foreground/85">No filed time for this stop yet.</p>
            )}
            {shift && <p>{shift}</p>}
            {facts?.currency ? (
              <p>
                Money here is {facts.currencySymbol ? `${facts.currencySymbol} ` : ""}
                {facts.currency}. No rate shown — ask Echo and it reads one fresh.
              </p>
            ) : (
              facts?.city && <p>Echo does not have the currency for {facts.country} on record.</p>
            )}
            {help ? (
              <p>Emergency: {help}. Echo cannot make the call for you.</p>
            ) : (
              facts?.city && <p>No published emergency number on record for {facts.country}.</p>
            )}
            <p className="text-[10.5px] text-muted-foreground/75">
              {wall
                ? `${wall.words} wall — art only, it carries nothing.`
                : "Echo keeps no painted wall for this city yet."}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
