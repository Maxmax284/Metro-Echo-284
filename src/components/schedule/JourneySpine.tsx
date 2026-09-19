// JourneySpine — the trip as a rail you read at three in the morning.
//
// Doctrine:
//   - One card, not a list of flights. Air legs are tight segments; the ground
//     between them renders wider, because the sit is the story.
//   - The leg you are in is lit, the rest are dimmed. Two big numbers on top:
//     time left here, next gate.
//   - Every state line says whose word it is and when it was read. Position is
//     derived, and the card says so.
//   - "That didn't happen" is always reachable. Your word beats the feed.
import { useState } from "react";
import { ChevronDown, Clock, MapPin, Plane, RadioTower, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { vantaToast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { airportWords } from "@/lib/airports";
import { flightTimeWords } from "@/lib/flightClock";
import { airportZone } from "@/lib/travelSense";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import {
  OVERRIDE_CHOICES,
  OVERRIDE_WORDS,
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
  onOverride,
  onClearOverride,
}: {
  leg: Leg;
  live: boolean;
  /** Each end reads in the local time at that airport, the way a ticket does. */
  clock: (at: string | null, iata: string | null) => string;
  onOverride: (state: LegStateKind) => Promise<void> | void;
  onClearOverride: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
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
        {leg.flight_no ? <span className="text-sm text-muted-foreground">{leg.flight_no}</span> : null}
        {leg.override ? (
          <Badge variant="outline" className="text-[11px]">
            your word
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {clock(leg.from.at, leg.from.iata)} → {clock(leg.to.at, leg.to.iata)}
        {leg.from.terminal ? ` · terminal ${leg.from.terminal}` : ""}
        {leg.from.gate ? ` · gate ${leg.from.gate}` : " · no gate filed"}
      </p>
      <p className={cn("mt-1 text-sm", state.stale ? "text-amber-600 dark:text-amber-400" : "text-foreground/80")}>
        {leg.override ? OVERRIDE_WORDS[leg.override] : state.words}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {state.source === "you" ? "Your word" : state.source === "the airline" ? "The airline's word" : "Worked out from the clock"}
        {" · "}
        {readingWords(leg.live_checked_at)}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setOpen((v) => !v)}>
          <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden />
          That didn&apos;t happen
          <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
        </Button>
        {leg.override ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={async () => {
              await onClearOverride();
              vantaToast.say("Back to the airline's word on this leg.");
            }}
          >
            Put it back to the airline
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
          {OVERRIDE_CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              className="block w-full min-h-11 rounded-md px-3 py-2 text-left text-sm hover:bg-background"
              onClick={async () => {
                await onOverride(c.value);
                setOpen(false);
                vantaToast.say(OVERRIDE_WORDS[c.value]);
              }}
            >
              <span className="font-medium">{c.label}</span>
              <span className="block text-xs text-muted-foreground">{c.description}</span>
            </button>
          ))}
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
  onOverride,
  onClearOverride,
  onDismissNews,
}: {
  journey: Journey;
  where: { kind: string; legIndex: number; iata: string | null; words: string; checked: string | null } | null;
  news: string[];
  savedAt: string | null;
  onOverride: (planId: string, state: LegStateKind) => Promise<void> | void;
  onClearOverride: (planId: string) => Promise<void> | void;
  onDismissNews: () => void;
}) {
  const numbers = bigNumbers(journey);
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
          <p className="font-street text-3xl tracking-wide">{numbers.timeLeft ?? "not on record"}</p>
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
              onOverride={(s) => onOverride(seg.leg.plan_id, s)}
              onClearOverride={() => onClearOverride(seg.leg.plan_id)}
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
