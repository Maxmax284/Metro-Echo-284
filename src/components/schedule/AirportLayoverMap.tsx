import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { ChevronDown, Map as MapIcon, Navigation, PlaneTakeoff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIRPORT_GEOMETRY_WORDS, airportLayoverFacts } from "@/lib/airportLayoverMap";
import type { Layover, Leg } from "@/lib/journey";

const AirportLayoverMapInner = lazy(() =>
  import("./AirportLayoverMapInner").then((module) => ({ default: module.AirportLayoverMapInner })),
);

class AirportMapFence extends Component<{ children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    return this.state.broken ? <p className="p-3 text-xs text-muted-foreground">{AIRPORT_GEOMETRY_WORDS.offline}</p> : this.props.children;
  }
}

function factWords(label: string, terminal: string | null, gate: string | null) {
  if (!terminal && !gate) return `${label}: terminal and gate not on record`;
  return `${label}: ${terminal ? `terminal ${terminal}` : "terminal not on record"} · ${gate ? `gate ${gate}` : "gate not on record"}`;
}

export function AirportLayoverMap({ layover, nextLeg }: { layover: Layover; nextLeg: Leg }) {
  const [open, setOpen] = useState(false);
  const facts = airportLayoverFacts(layover, nextLeg);

  return (
    <div className="mt-3 border-t border-border/50 pt-2.5">
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-full justify-start px-2 text-xs"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <MapIcon className="mr-2 h-3.5 w-3.5 text-primary" aria-hidden />
        Airport map
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </Button>

      {open ? (
        <div className="mt-2 overflow-hidden rounded-md border border-border/60 bg-muted/10">
          {facts.point && facts.iata ? (
            <AirportMapFence>
              <Suspense fallback={<p className="p-3 text-xs text-muted-foreground">Drawing the airport map…</p>}>
                <AirportLayoverMapInner point={facts.point} iata={facts.iata} />
              </Suspense>
            </AirportMapFence>
          ) : (
            <p className="p-3 text-xs text-muted-foreground">
              No checked airport coordinate is kept for this stop, so Echo will not place it on a map.
            </p>
          )}

          <div className="space-y-2 border-t border-border/50 p-3 text-xs">
            <p className="text-muted-foreground">{AIRPORT_GEOMETRY_WORDS.map}</p>
            <p>{factWords("Arriving", facts.arrivalTerminal, facts.arrivalGate)}</p>
            <p>{factWords("Onward", facts.onwardTerminal, facts.onwardGate)}</p>
            <div className="grid gap-2 pt-1 text-muted-foreground sm:grid-cols-2">
              <p className="flex items-start gap-1.5"><Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{AIRPORT_GEOMETRY_WORDS.walking}</p>
              <p className="flex items-start gap-1.5"><PlaneTakeoff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{AIRPORT_GEOMETRY_WORDS.taxi}</p>
            </div>
            <p className="text-[11px] text-muted-foreground/80">
              Airport geography: OpenStreetMap. Terminal and gate: {facts.checkedAt ? "latest airline reading on record" : "your saved flight record"}. Airport signs and displays win.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
