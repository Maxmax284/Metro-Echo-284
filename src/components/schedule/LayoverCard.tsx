// LayoverCard — the sit between two flights, with the subtraction shown.
//
// Doctrine:
//   - Time you actually have, not the gap on the ticket. Landing to next
//     boarding, minus boarding, minus a terminal change, minus immigration —
//     and every deduction is printed so you can argue with it.
//   - Unknown stays unknown. A terminal that was not filed is "not on record",
//     never assumed to be the same one.
//   - Terminal listings come from a places provider, one category at a time,
//     only when you ask. Hours only where published, with the reading time on it.
//   - Leaving the airport is offered only when the math says there is room.
import { useState } from "react";
import { Coffee, Footprints, RefreshCw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEAVE_AIRPORT_MIN, durationWords, type Layover, type Leg } from "@/lib/journey";
import { CATEGORIES, INTEL_LAW, emptyWords, placeWords, readingAgeWords } from "@/lib/airportIntel";
import { countryNotes, noNotesWords, notesCheckedOn } from "@/lib/countryNotes";
import { airport } from "@/lib/airports";
import { useAirportIntel } from "@/hooks/useJourney";

export function LayoverCard({
  layover,
  nextLeg,
  live,
  past = false,
}: {
  layover: Layover;
  nextLeg: Leg;
  live: boolean;
  /** The connection is behind you. History, not guidance. */
  past?: boolean;
}) {
  const [showMath, setShowMath] = useState(false);
  const [showGround, setShowGround] = useState(false);
  const [openPast, setOpenPast] = useState(false);
  const { byCategory, busy, look } = useAirportIntel(layover.iata || null);
  const place = airport(layover.iata);
  const notes = place ? countryNotes(place.cc) : null;

  /* A sit you have already sat through says how long it was, and nothing else.
     Terminals, gates and getting-out advice are no longer anyone's business. */
  if (past && !live) {
    return (
      <div className="text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Timer className="h-3 w-3 shrink-0" aria-hidden />
          <span>
            {durationWords(layover.gapMin) ?? "Time not on record"} at {layover.place} · behind you
          </span>
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 px-2 text-[11px]"
          onClick={() => setOpenPast((v) => !v)}
        >
          {openPast ? "Hide what was on record" : "What was on record"}
        </Button>
        {openPast ? (
          <ul className="mt-1 space-y-1">
            <li>
              {layover.terminalChange === "yes"
                ? `terminal ${layover.arriveTerminal} → ${layover.departTerminal}`
                : layover.terminalChange === "no"
                  ? "same terminal"
                  : "terminals not on record"}
            </li>
            <li>
              {layover.border === "different"
                ? "border crossed on the way in"
                : layover.border === "same"
                  ? "no border here"
                  : "immigration not on record"}
            </li>
            {nextLeg.from.gate ? <li>gate {nextLeg.from.gate}</li> : null}
            <li>Yours after deductions: {durationWords(layover.usableMin) ?? "could not be worked out"}</li>
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-dashed p-3",
        live ? "border-primary/50 bg-primary/5" : "border-border/60 opacity-70",
      )}
    >
      <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Timer className="h-3 w-3" aria-hidden /> The sit
      </p>
      <p className="mt-1 font-street text-xl tracking-wide">{layover.place}</p>
      <p className="mt-1 text-sm text-foreground/80">{layover.words}</p>

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline">
          {layover.terminalChange === "yes"
            ? `terminal ${layover.arriveTerminal} → ${layover.departTerminal}`
            : layover.terminalChange === "no"
              ? "same terminal"
              : "terminals not on record"}
        </Badge>
        <Badge variant="outline">
          {layover.border === "different"
            ? "border crossed on the way in"
            : layover.border === "same"
              ? "no border here"
              : "immigration not on record"}
        </Badge>
        {nextLeg.from.gate ? <Badge variant="outline">next gate {nextLeg.from.gate}</Badge> : null}
      </div>

      <Button variant="ghost" size="sm" className="mt-2 h-8 px-2 text-xs" onClick={() => setShowMath((v) => !v)}>
        {showMath ? "Hide the math" : "Show the math"}
      </Button>
      {showMath ? (
        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
          <li>On the clock: {durationWords(layover.gapMin) ?? "one of the two times is not on record"}</li>
          {layover.deductions.map((d) => (
            <li key={d.line}>
              − {d.minutes == null ? "unknown" : `${d.minutes}m`} · {d.line}
            </li>
          ))}
          <li className="text-foreground/80">
            Yours: {durationWords(layover.usableMin) ?? "cannot be worked out"}
          </li>
        </ul>
      ) : null}

      {/* What is around you, only when you ask for it. */}
      {live ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">What&apos;s around you</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Button
                key={c.key}
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                disabled={busy === c.key}
                onClick={() => look(c.key)}
              >
                {busy === c.key ? <RefreshCw className="mr-1 h-3 w-3 animate-spin" aria-hidden /> : null}
                {c.label}
              </Button>
            ))}
          </div>

          {CATEGORIES.filter((c) => byCategory[c.key]).map((c) => {
            const r = byCategory[c.key];
            return (
              <div key={c.key} className="rounded-md border border-border/60 p-2">
                <p className="text-sm font-medium">{c.label}</p>
                {r.error ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    The places provider could not be read just now, so Echo has nothing to show for this one.
                  </p>
                ) : r.places.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{emptyWords(c, layover.place)}</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {r.places.map((p) => (
                      <li key={p.id}>
                        <span className="text-foreground/85">{placeWords(p)}</span>
                        {p.address ? <span className="block">{p.address}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {readingAgeWords(r.fetched_at)}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground">{INTEL_LAW}</p>
        </div>
      ) : null}

      {/* Leaving the airport, and only then the ground stuff. */}
      <div className="mt-3">
        {layover.canLeaveAirport ? (
          <>
            <p className="flex items-center gap-1 text-sm">
              <Footprints className="h-3.5 w-3.5" aria-hidden />
              {durationWords(layover.usableMin)} is enough to leave the airport, on the times on record.
            </p>
            <Button variant="ghost" size="sm" className="mt-1 h-8 px-2 text-xs" onClick={() => setShowGround((v) => !v)}>
              {showGround ? "Hide getting out" : "Getting out, money, and the shakedowns"}
            </Button>
            {showGround ? (
              notes ? (
                <div className="mt-2 space-y-2 text-xs">
                  <div>
                    <p className="font-medium text-foreground/85">Getting in and out</p>
                    <ul className="space-y-1 text-muted-foreground">
                      {notes.transport.map((n) => (
                        <li key={n.line}>
                          {n.line} <span className="opacity-70">— checked {n.checked_on}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground/85">Money</p>
                    <ul className="space-y-1 text-muted-foreground">
                      {notes.money.map((n) => (
                        <li key={n.line}>
                          {n.line} <span className="opacity-70">— checked {n.checked_on}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium text-foreground/85">Watch out</p>
                    <ul className="space-y-1 text-muted-foreground">
                      {notes.watch_out.map((n) => (
                        <li key={n.line}>
                          {n.line} <span className="opacity-70">— checked {n.checked_on}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-muted-foreground">
                    Emergency here: {notes.emergency}. Oldest line in these notes was checked {notesCheckedOn(notes)}.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{noNotesWords(place?.country ?? null)}</p>
              )
            ) : null}
          </>
        ) : (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <Coffee className="h-3.5 w-3.5" aria-hidden />
            {layover.usableMin == null
              ? "Whether there is room to leave the airport cannot be worked out — one of the two times is not on record."
              : `Not enough room to leave the airport — ${durationWords(layover.usableMin)} yours, and Echo only suggests it above ${durationWords(LEAVE_AIRPORT_MIN)}.`}
          </p>
        )}
      </div>
    </div>
  );
}
