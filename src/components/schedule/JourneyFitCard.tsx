// JourneyFitCard — what a newly added flight would mean for the trip underway.
//
// Doctrine:
//   - A proposal, never an edit. Echo says what it would do, shows the
//     arithmetic, and waits.
//   - The one fact it cannot know is asked for, with the airport it would bet on
//     already typed in — and still yours to change.
//   - Nothing on the flight you are on is touched by anything here.
import { useState, type ReactNode } from "react";
import { GitMerge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { JourneyFit } from "@/lib/journeyFit";
import type { SaidTimeKind } from "@/lib/flightSaidTime";


const KIND_WORDS: Record<JourneyFit["kind"], string> = {
  needs_route: "One fact short of a leg",
  needs_time: "Possible connection — departure time needed",
  chains: "This joins your trip",
  stay: "A stay, not a connection",
  elsewhere: "Its own trip",
};

export function JourneyFitCard({
  fit,
  busy = false,
  onSetRoute,
  onSetTime,
  steps,
}: {
  fit: JourneyFit;
  busy?: boolean;
  onSetRoute?: (from: string, to: string) => void | Promise<void>;
  /** The one fact a possible connection is missing: when it leaves, or boards. */
  onSetTime?: (time: string, kind: SaidTimeKind) => void | Promise<void>;
  /** Landed-transfer steps for this airport, when the trip is standing in it. */
  steps?: ReactNode;
  /** Where this record came from, in the same words the flight card uses. */
  source?: string;
}) {
  const [from, setFrom] = useState(fit.suggest?.iata ?? "");
  const [to, setTo] = useState("");
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<SaidTimeKind>("departure");
  const ask = fit.kind === "needs_route" && !!onSetRoute;
  const askTime = fit.kind === "needs_time" && !!onSetTime;


  return (
    <Card className="vanta-card space-y-2 border-primary/40 p-3">
      <div className="flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-primary" aria-hidden />
        <p className="vanta-machine-label text-foreground/70">{KIND_WORDS[fit.kind]}</p>
      </div>
      <p className="text-[13px] text-foreground/90">{fit.lead}</p>
      {fit.detail.map((line) => (
        <p key={line} className="text-[11.5px] text-muted-foreground">
          {line}
        </p>
      ))}

      {/* Standing in the transfer airport: what is known, what to check, and the
          airport's own page. Read-only here — recording a local fact lives on
          the flight card, behind a review step. */}
      {steps ? (
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <p className="text-[11.5px] font-medium text-foreground">Transfer steps here</p>
          {steps}
        </div>
      ) : null}


      {/* The one missing fact, asked for where it is missed. Optional: leaving it
          empty keeps the flight exactly as separate as it already is. */}
      {askTime ? (
        <div className="space-y-2 border-t border-border/60 pt-2">
          <p className="text-[12px] text-foreground/85">
            Got the time on a ticket or boarding pass? Put it in — optional, and it stays your word.
          </p>
          <div className="flex items-end gap-2">
            <div className="min-w-[6rem] flex-1 space-y-1">
              <Label htmlFor={`fit-time-${fit.plan_id}`} className="text-[11px]">
                Time on your ticket
              </Label>
              <Input
                id={`fit-time-${fit.plan_id}`}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="07:15"
                inputMode="numeric"
                className="h-11 text-[15px] tracking-wide"
              />
            </div>
            <Button
              className="h-11 min-w-[4.5rem] text-[13px]"
              disabled={busy || !time.trim()}
              onClick={() => void onSetTime?.(time, kind)}
            >
              Save time
            </Button>
          </div>
          <div className="flex gap-1.5" role="group" aria-label="What kind of time this is">
            {(["departure", "boarding"] as SaidTimeKind[]).map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={kind === k ? "default" : "outline"}
                className="h-9 text-[12px]"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k === "departure" ? "Departure time" : "Boarding time"}
              </Button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {kind === "boarding"
              ? "Boarding is kept as boarding. Echo counts from it and does not invent a take-off time the airline has not filed."
              : "Read as the local clock at the airport it leaves from. Saved as your word, with a receipt."}
          </p>
        </div>
      ) : null}



      {ask ? (
        <div className="space-y-2 border-t border-border/60 pt-2">
          <p className="text-[12px] text-foreground/85">Where does it leave from, and where does it go?</p>
          <div className="flex items-end gap-2">
            <div className="min-w-[4.5rem] flex-1 space-y-1">
              <Label htmlFor={`fit-from-${fit.plan_id}`} className="text-[11px]">
                From
              </Label>
              <Input
                id={`fit-from-${fit.plan_id}`}
                value={from}
                onChange={(e) => setFrom(e.target.value.toUpperCase())}
                maxLength={3}
                autoCapitalize="characters"
                className="h-11 text-[15px] tracking-widest"
              />
            </div>
            <div className="min-w-[4.5rem] flex-1 space-y-1">
              <Label htmlFor={`fit-to-${fit.plan_id}`} className="text-[11px]">
                To
              </Label>
              <Input
                id={`fit-to-${fit.plan_id}`}
                value={to}
                onChange={(e) => setTo(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="BKK"
                autoCapitalize="characters"
                className="h-11 text-[15px] tracking-widest"
              />
            </div>
            <Button
              className="h-11 min-w-[4.5rem] text-[13px]"
              disabled={busy || from.length !== 3 || to.length !== 3}
              onClick={() => void onSetRoute?.(from, to)}
            >
              Save
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {fit.suggest
              ? `${fit.suggest.iata} is filled in because that is where this trip lands. Change it if this one leaves somewhere else.`
              : "Three-letter airport codes."}{" "}
            Saved as your word, with a receipt.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
