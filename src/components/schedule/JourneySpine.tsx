// JourneySpine — the trip as a rail you read at three in the morning.
//
// Doctrine:
//   - One card, not a list of flights. Air legs are tight segments; the ground
//     between them renders wider, because the sit is the story.
//   - The leg you are in is lit, the rest are dimmed. Two big numbers on top:
//     time left here, next gate.
//   - Every state line says whose word it is and when it was read. Position is
//     derived, and the card says so.
//   - No manual "I'm on it" buttons. A traveler is not a flight logger; the
//     clock and the airline's word carry the rail.
import { Clock, MapPin, Plane, RadioTower } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { airportWords } from "@/lib/airports";
import { flightTimeWords } from "@/lib/flightClock";
import { airportZone } from "@/lib/travelSense";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import {
  STATE_WORDS,
  bigNumbers,
  durationWords,
  legState,
  type Journey,
  type Leg,
  type LegStateKind,
  type Segment,
} from "@/lib/journey";
import { LayoverCard } from "./LayoverCard";
import { TravellerWord } from "./TravellerWord";

function readingWords(at: string | null): string {
  if (!at) return "no reading from the airline yet";
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60_000);
  if (!Number.isFinite(mins)) return "read at an unrecorded time";
  if (mins < 1) return "read just now";
  if (mins < 60) return `read ${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `read ${hours}h ago` : `read ${Math.round(hours / 24)}d ago`;
}

function LegRow({
  leg,
  live,
  clock,
  onSay,
  onClear,
}: {
  leg: Leg;
  live: boolean;
  /** Each end reads in the local time at that airport, the way a ticket does. */
  clock: (at: string | null, iata: string | null) => string;
  /** Your word about this leg, not just the one Echo thinks you are on. */
  onSay?: (planId: string, state: LegStateKind) => Promise<void>;
  onClear?: (planId: string) => Promise<void>;
}) {
  const state = legState(leg);
  return (
    <div className={cn("relative pl-6", live ? "opacity-100" : "opacity-60")}>
      <span
        aria-hidden
        className={cn(
          "absolute left-1 top-2 h-2.5 w-2.5 rounded-full",
          live ? "bg-primary ring-4 ring-primary/20" : "bg-muted-foreground/50",
        )}
      />
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-street text-lg tracking-wide">{leg.from.iata || "???"}</span>
        <Plane className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="font-street text-lg tracking-wide">{leg.to.iata || "???"}</span>
        {/* The operating number leads, because that is what the board says. */}
        {leg.flight_no ? (
          <span className="text-sm font-medium text-foreground">
            {leg.airline ? `${leg.airline} ` : ""}
            {leg.flight_no}
          </span>
        ) : null}
      </div>
      {leg.ticket_flight_no ? (
        <p className="text-xs text-muted-foreground">Your ticket says {leg.ticket_flight_no}.</p>
      ) : null}
      <p className="mt-1 text-sm text-muted-foreground">
        {clock(leg.from.at, leg.from.iata)} → {clock(leg.to.at, leg.to.iata)}
        {leg.from.terminal ? ` · terminal ${leg.from.terminal}` : ""}
        {leg.from.gate ? ` · gate ${leg.from.gate}` : " · no gate filed"}
      </p>
      <p className={cn("mt-1 text-sm", state.stale ? "text-amber-600 dark:text-amber-400" : "text-foreground/80")}>
        {state.words}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {state.source === "you" ? "Your word" : state.source === "the airline" ? "The airline's word" : "Worked out from the clock"}
        {" · "}
        {readingWords(leg.live_checked_at)}
      </p>
      {/* Your word belongs on the leg you are actually on, which is not always the
          one Echo thinks. One tap per leg, and it says whose word it is on. */}
      {onSay ? (
        <div className="mt-1.5">
          <TravellerWord
            yourWord={state.source === "you" ? state.kind : null}
            onSay={(kind) => onSay(leg.plan_id, kind)}
            onClear={() => onClear?.(leg.plan_id) ?? Promise.resolve()}
          />
        </div>
      ) : null}
    </div>
  );
}

export function JourneySpine({
  journey,
  where,
  news,
  savedAt,
  onDismissNews,
  landingAt = null,
  onSay,
  onClear,
}: {
  journey: Journey;
  where: { kind: string; legIndex: number; iata: string | null; words: string; checked: string | null } | null;
  news: string[];
  savedAt: string | null;
  onDismissNews: () => void;
  /** The landing time read off the cabin screen, when the traveller gave one. */
  landingAt?: string | null;
  /** Record your word against any leg of the trip, not only the live one. */
  onSay?: (planId: string, state: LegStateKind) => Promise<void>;
  onClear?: (planId: string) => Promise<void>;
}) {
  const numbers = bigNumbers(journey, new Date(), landingAt);
  const liveIndex = where?.legIndex ?? 0;
  const { timezone } = useUserTimezone();
  /* Times read the way a person says them — 1:15 AM tomorrow, not 01:15 — and in
     the local time at that end of the leg, the way the ticket prints them. */
  const clock = (at: string | null, iata: string | null) =>
    at ? flightTimeWords(at, airportZone(iata) ?? timezone) : "not on record";

  return (
    <Card className="vanta-card space-y-4 p-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Your journey</p>
        <h3 className="font-street text-2xl tracking-wide">{journey.title}</h3>
        {where ? <p className="mt-1 text-sm text-foreground/80">{where.words}</p> : null}
      </div>

      {/* The two numbers that matter when you are tired and the terminal is loud. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 p-3">
          <p className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden /> {numbers.timeLeftLabel}
          </p>
          <p className="font-street text-3xl tracking-wide">{numbers.timeLeft ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <p className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
            <MapPin className="h-3 w-3" aria-hidden /> {numbers.gateLabel}
          </p>
          <p className="font-street text-3xl tracking-wide">{numbers.gate ?? "—"}</p>
        </div>
      </div>

      {news.length ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">What changed since this phone last looked</p>
          <ul className="mt-1 space-y-1 text-sm">
            {news.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-1 h-8 px-2 text-xs" onClick={onDismissNews}>
            Got it
          </Button>
        </div>
      ) : null}

      {/* The rail. Air legs tight, ground segments wide. */}
      <div className="relative space-y-5 border-l border-border/70 pl-1">
        {journey.segments.map((seg: Segment, i) =>
          seg.kind === "air" ? (
            <LegRow
              key={`air-${seg.leg.plan_id}`}
              leg={seg.leg}
              live={journey.legs.indexOf(seg.leg) === liveIndex}
              clock={clock}
            />
          ) : (
            <div key={`ground-${i}`} className="py-3 pl-6">
              <LayoverCard layover={seg.layover} nextLeg={seg.before} live={journey.legs.indexOf(seg.after) === liveIndex} />
            </div>
          ),
        )}
      </div>

      {/* One caveat, not a wall of doctrine. The terminal board is the only line
          that earns its place on a card you read while walking. */}
      <div className="flex items-start gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        <RadioTower className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        <p>
          Times are local to each airport. The board in the terminal wins.
          {savedAt ? ` Saved to this phone ${readingWords(savedAt)}, so it reads with no service.` : ""}
        </p>
      </div>
    </Card>
  );
}

/** Where a journey lands when there is nothing to show yet. Empty states teach. */
export function NoJourneyYet() {
  return (
    <p className="text-sm text-muted-foreground">
      A journey shows up here once two of your flights land at the same airport within a day of each other — Echo chains
      them into one trip with the sit in the middle. Add a flight by number and it will do the chaining itself.
    </p>
  );
}

export { STATE_WORDS, durationWords, airportWords };
