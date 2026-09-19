// TransferSteps — the landed-transfer checklist, read-only, wherever it is needed.
//
// Doctrine:
//   - Same module as the flight card's panel, so Today, the candidate card and
//     Flights cannot disagree about what is known.
//   - Known facts carry their source. Unknown facts say to check locally.
//   - The only link is the airport's own published page, and only when one is
//     kept. Echo never describes a desk or a walking route it cannot see.
import { Check, CircleHelp, ExternalLink } from "lucide-react";
import type { FlightPlan } from "@/lib/flightPlan";
import { airportHelp, NO_HELP_PAGE } from "@/lib/airportHelp";
import { localTransferFacts, transferChecklist } from "@/lib/transferVerification";
import { cn } from "@/lib/utils";

export function AirportHelpLine({ airport, className }: { airport: string; className?: string }) {
  const help = airportHelp(airport);
  if (!help)
    return <p className={cn("text-[10.5px] leading-snug text-muted-foreground", className)}>{NO_HELP_PAGE}</p>;
  return (
    <a
      href={help.url}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] text-[11px] text-primary underline decoration-primary/40 underline-offset-2",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {help.label}
    </a>
  );
}

export function TransferSteps({
  airport,
  onward,
  confirmed,
  providerGate,
  className,
}: {
  airport: string;
  onward: FlightPlan;
  confirmed: boolean;
  providerGate?: string | null;
  className?: string;
}) {
  const saved = localTransferFacts(onward);
  const checklist = transferChecklist({ confirmed, providerGate, local: saved });
  return (
    <div className={cn("space-y-1.5", className)} aria-label={`Transfer steps at ${airport}`}>
      <ul className="space-y-1.5">
        {checklist.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-[11px] leading-snug">
            {item.state === "known" ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
            ) : (
              <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            )}
            <span>
              <span className="font-medium text-foreground">{item.label}:</span>{" "}
              <span className="text-muted-foreground">{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <AirportHelpLine airport={airport} />
    </div>
  );
}
