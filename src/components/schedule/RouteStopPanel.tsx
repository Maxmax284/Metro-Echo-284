// RouteStopPanel — one stop on your route, read against its own wall.
//
// Doctrine:
//   - Kept facts only: the airport table, the currency table, the published
//     emergency number. Nothing here is fetched and no rate is invented.
//   - The wall is art. It carries no information and says so.
//   - One panel, both views. The sketch and the map read the same stop the
//     same way, so the two pictures can never disagree in words.
import { arrivalFacts, helpCells, shiftWords } from "@/lib/arrivalFacts";
import { wallFor } from "@/lib/placeWalls";
import type { RouteStop } from "@/lib/routeMap";
import { cn } from "@/lib/utils";

const ROLE_WORDS: Record<RouteStop["role"], string> = {
  origin: "you leave from here",
  stop: "you change here",
  final: "you end here",
};

export function RouteStopPanel({
  stop,
  homeZone,
  className,
}: {
  stop: RouteStop;
  /** The clock Echo is keeping, so the stop can state the difference. */
  homeZone?: string | null;
  className?: string;
}) {
  const facts = arrivalFacts(stop.iata, stop.at, homeZone);
  const wall = wallFor({ city: stop.city, country: stop.country });
  const shift = facts ? shiftWords(facts) : null;
  const help = facts ? helpCells(facts) : null;

  return (
    <div className={cn("relative overflow-hidden rounded-md border border-border/60 bg-muted/15 p-2.5", className)}>
      {wall && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.22]"
          style={{ backgroundImage: `url(${wall.url})` }}
        />
      )}
      <div className="relative space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-street text-lg tracking-wide">{stop.iata}</span>
          <span className="text-[12.5px] text-foreground/85">
            {stop.city ? `${stop.city}${stop.country ? `, ${stop.country}` : ""}` : "not in Echo's airport table"}
          </span>
          <span className="ml-auto vanta-machine-label text-foreground/60">{ROLE_WORDS[stop.role]}</span>
        </div>

        <div className="space-y-1 text-[11.5px] text-foreground/85">
          {facts?.localTime ? (
            <p>
              {stop.role === "origin" ? "Leaves" : "Lands"} {facts.localTime} local
              {facts.localDate ? ` · ${facts.localDate}` : "."}
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
  );
}
