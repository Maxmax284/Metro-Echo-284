// TransferLane — standing in a connection airport, in the room you open first.
//
// Doctrine:
//   - Same checklist module as the flight card and the candidate card, so no
//     surface invents its own version of what is known.
//   - It appears only when the leg you are on has landed and there is an onward
//     flight — confirmed or still a proposal, said plainly which.
//   - Reading only. The actions, and recording a local fact, live in Flights.
import { ClipboardCheck } from "lucide-react";
import { useFlightPlans } from "@/hooks/useFlightPlans";
import { useJourney } from "@/hooks/useJourney";
import { TransferSteps } from "@/components/schedule/TransferSteps";
import { airportWords } from "@/lib/airports";
import { flightPhase } from "@/lib/flightStatus";
import type { LiveFlight } from "@/lib/flightStatus";
import type { FlightPlan } from "@/lib/flightPlan";
import { LEAD_BAR, MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function TransferLane({ onOpen }: { onOpen: () => void }) {
  const { plans } = useFlightPlans();
  const journey = useJourney(plans);
  const legs = journey.current?.legs ?? [];
  const index = journey.where?.legIndex ?? 0;
  const leg = legs[index] ?? null;
  const plan = leg ? plans.find((p) => p.id === leg.plan_id) ?? null : null;
  if (!plan) return null;

  const snap = plan.live_status as LiveFlight | null;
  if (!snap || flightPhase(snap) !== "landed") return null;

  const airport = (plan.destination ?? snap.arrival.iata ?? "").trim().toUpperCase();
  if (airport.length !== 3) return null;

  /* The onward leg already on the journey, or the nearest proposal that leaves
     from where this one landed. A proposal is labelled as one. */
  const nextLeg = legs[index + 1] ?? null;
  const confirmedOnward = nextLeg ? plans.find((p) => p.id === nextLeg.plan_id) ?? null : null;
  const candidateOnward: FlightPlan | null =
    confirmedOnward ??
    plans.find(
      (p) =>
        p.id !== plan.id &&
        (p.origin ?? "").trim().toUpperCase() === airport &&
        p.status !== "dropped" &&
        p.status !== "flown",
    ) ??
    null;
  if (!candidateOnward) return null;
  const confirmed = !!confirmedOnward;
  const onwardFlight =
    candidateOnward.options.find((o) => o.id === candidateOnward.chosen_option_id) ?? candidateOnward.options[0];
  const name = onwardFlight?.flight_no ?? "your onward flight";
  const place = airportWords(airport) || airport;

  return (
    <section className={cn("vanta-card space-y-2 px-3 py-3", LEAD_BAR, "text-primary/50")}>
      <div className="flex items-start gap-2">
        <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug text-foreground">
            Landed at {place} · {confirmed ? "changing planes" : "possible onward flight"} on {name}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {confirmed
              ? "Confirm gate, boarding time and transfer steps on the official board or at an airline desk."
              : "Still a proposal. Confirm it is yours in Flights before Echo treats it as your connection."}
          </p>
        </div>
      </div>
      <TransferSteps
        airport={airport}
        onward={candidateOnward}
        confirmed={confirmed}
        providerGate={(candidateOnward.live_status as LiveFlight | null)?.departure.gate ?? null}
      />
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "w-full rounded-md border border-border/60 px-3 py-2 text-left text-[11.5px] text-foreground/90",
          MOTION_ROW,
          MOTION_FOCUS,
        )}
      >
        Open your flights to record what the board or staff told you
      </button>
    </section>
  );
}
