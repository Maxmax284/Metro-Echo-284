// NextMoveLane — the one travel sentence, in the room you open first.
//
// Doctrine:
//   - The same sentence as the flight card, from the same module. Today does not
//     get its own wording for the same fact.
//   - It shows up only when a flight is close enough to be the next thing you do,
//     and disappears the moment it isn't. Silence is the default.
//   - Reading only. Tapping it opens the flight, where the actions live.
import { Plane } from "lucide-react";
import { useJourney } from "@/hooks/useJourney";
import { useFlightPlans } from "@/hooks/useFlightPlans";
import { groundPath } from "@/lib/groundPath";
import { readStage } from "@/lib/groundStage";
import { boardIdentity, carrierId, mergeIdentity, type FlightIdentity } from "@/lib/flightIdentity";
import { airportWords } from "@/lib/airports";
import type { LiveFlight } from "@/lib/flightStatus";
import { LEAD_BAR, MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** How close a departure has to be before travel is the thing you are doing. */
const NEAR_MS = 30 * 60 * 60 * 1000;

export function NextMoveLane({ onOpen }: { onOpen: () => void }) {
  const { plans } = useFlightPlans();
  const journey = useJourney(plans);
  const leg = journey.current?.legs[journey.where?.legIndex ?? 0] ?? null;
  const plan = leg ? plans.find((p) => p.id === leg.plan_id) : null;
  if (!journey.current || !leg || !plan) return null;

  const where = journey.where?.kind ?? "before";
  if (where === "done" || where === "stopped") return null;

  const snap = plan.live_status as LiveFlight | null;
  const option = plan.options.find((o) => o.id === plan.chosen_option_id) ?? plan.options[0] ?? null;
  /* Same anchoring as the flight card: a ticket time with no zone is the wall
     clock at the origin airport, never the device's. Otherwise Today and Flights
     count down to two different moments. */
  const departAt = anchorToZone(
    snap?.departure.estimated ?? snap?.departure.scheduled ?? option?.depart_at ?? null,
    airportZone((plan.origin ?? "").trim().toUpperCase() || null),
  );
  const depMs = departAt ? Date.parse(departAt) : NaN;
  /* Far from a flight, this is not the next thing anyone is doing. */
  if (where === "before" && (!Number.isFinite(depMs) || depMs - Date.now() > NEAR_MS)) return null;

  const identity: FlightIdentity | null = option
    ? mergeIdentity((option.identity ?? null) as FlightIdentity | null, {
        marketing:
          (option.identity as FlightIdentity | null)?.marketing ??
          carrierId({ carrier: option.airline, flight_no: option.flight_no }),
      })
    : null;
  const stage = readStage(plan.id);
  const ground = groundPath({
    where: stage !== "away" && (where === "before" || where === "at_airport") ? "at_airport" : where,
    identity,
    fromPlace: airportWords((plan.origin ?? "").trim().toUpperCase()) || plan.origin,
    toPlace: airportWords((plan.destination ?? "").trim().toUpperCase()) || plan.destination,
    terminal: snap?.departure.terminal ?? null,
    gate: where === "in_air" ? (snap?.arrival.gate ?? null) : (snap?.departure.gate ?? null),
    minsToDeparture: Number.isFinite(depMs) ? Math.round((depMs - Date.now()) / 60_000) : null,
    throughSecurity: stage === "security",
  });
  if (ground.step === "none") return null;

  const board = boardIdentity(identity);
  const name = board ? [board.carrier, board.flight_no].filter(Boolean).join(" ") : leg.flight_no;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "vanta-card flex w-full items-start gap-2 px-3 py-3 text-left",
        MOTION_ROW,
        MOTION_FOCUS,
        LEAD_BAR,
        "text-primary/50",
      )}
    >
      <Plane className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium leading-snug text-foreground">{ground.lead}</span>
        {ground.detail[0] ? (
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{ground.detail[0]}</span>
        ) : null}
        {name ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{name} · opens your flight</span>
        ) : null}
      </span>
    </button>
  );
}
