// Flights — its own front door for flight browsing.
//
// The flight desk given room to breathe, at a plain address, without the rest
// of the schedule desk around it. The deep desk still lives in Schedule.
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FlightDesk } from "@/components/schedule/FlightDesk";
import { FlowRail, FLOWS } from "@/components/work/FlowRail";

export default function FlightsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to Echo"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Flights</h1>
          <p className="text-xs text-muted-foreground">
            A number and a day is enough. Echo fills in what the airline actually says.
          </p>
        </div>
      </header>

      <FlowRail beats={FLOWS.flights} className="mb-4" />
      <FlightDesk />

      <p className="mt-4 text-[11.5px] leading-snug text-muted-foreground">
        Want your flights next to the rest of the day?{" "}
        <Link className="underline underline-offset-2" to="/?surface=schedule&tab=flights">
          Open the schedule desk
        </Link>
        .
      </p>
    </div>
  );
}
