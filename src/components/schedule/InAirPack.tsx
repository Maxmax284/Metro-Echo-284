// InAirPack — the card while you are on the aircraft, with no feed from it.
//
// Doctrine:
//   - The track is the great circle between the two airports on record, and the
//     marker rides the clock. It says whose word it is on.
//   - Miles to landing and time left come off the filed times, unless you have
//     read the landing time off the cabin screen — then they come off that, and
//     the card says so. The flight computer knows the wind; the timetable does not.
//   - Cabin power and Wi-Fi are usual practice, labelled. Nothing is read off
//     this aircraft.
//   - It works with no signal: everything here is already on the device.
import { useEffect, useState } from "react";
import { MonitorSmartphone, Plug } from "lucide-react";
import { AirportClock } from "./AirportClock";
import { FlightArc } from "./FlightArc";
import { SolariBoard } from "./SolariBoard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cabinRead, inAirRead, instantAlong, OFFLINE_LAW } from "@/lib/inAir";
import { cabinDriftWords, CABIN_SOURCE } from "@/lib/cabinEstimate";
import { flightTimeWords } from "@/lib/flightClock";
import { airportZone } from "@/lib/travelSense";

export function InAirPack({
  fromIata,
  toIata,
  departAt,
  arriveAt,
  clock,
  homeZone,
  cabinAt = null,
  onCabinRead,
}: {
  fromIata: string | null;
  toIata: string | null;
  departAt: string | null;
  arriveAt: string | null;
  clock: (iso: string) => string;
  homeZone?: string | null;
  /** The landing time you read off the seat-back screen, already anchored. */
  cabinAt?: string | null;
  /** "HH:MM" as shown on the screen, or null to go back to the filed time. */
  onCabinRead?: (hhmm: string | null) => void;
}) {
  /* Ticks on the minute so the miles and the time left move while you watch. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const [typed, setTyped] = useState("");
  const [asking, setAsking] = useState(false);

  /* The landing the numbers run against: your reading of the screen when you
     have given one, the filed time otherwise. */
  const landingAt = cabinAt ?? arriveAt;
  const read = inAirRead({ fromIata, toIata, departAt, arriveAt: landingAt, now });
  const cabin = cabinRead(read.totalMi);
  const from = (fromIata ?? "").trim().toUpperCase();
  const to = (toIata ?? "").trim().toUpperCase();
  const drift = cabinAt ? cabinDriftWords(cabinAt, arriveAt) : null;
  const toZone = airportZone(to) ?? homeZone ?? null;

  return (
    <div className="space-y-3 border-t border-border/50 pt-3">
      <p className="vanta-machine-label text-foreground/70">In the air</p>

      <FlightArc
        from={from || "—"}
        to={to || "—"}
        progress={read.progress}
        phase="flying"
        instantAt={instantAlong(departAt, landingAt)}
        clock={clock}
      />

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <SolariBoard
          text={read.toGoMi === null ? "NOT ON RECORD" : `${read.toGoMi.toLocaleString()} MI`}
          label="Miles to landing"
          tone={read.toGoMi === null ? "warn" : "primary"}
        />
        <SolariBoard text={read.leftWords?.toUpperCase() ?? "NOT ON RECORD"} label="Time left" />
        <SolariBoard text={cabin.power} label="Cabin power" tone={cabin.power === "NOT ON RECORD" ? "warn" : undefined} />
        <SolariBoard text={cabin.wifi} label="Wi-Fi" tone={cabin.wifi === "NOT ON RECORD" ? "warn" : undefined} />
      </div>

      {read.flownMi !== null && read.totalMi !== null && (
        <p className="text-[11px] text-foreground/80">
          {read.flownMi.toLocaleString()} of {read.totalMi.toLocaleString()} miles flown, on{" "}
          {cabinAt ? CABIN_SOURCE : "the filed times"}. The airline has filed no radar position, so the plane on the
          track rides the clock, not a fix.
        </p>
      )}

      {/* The one number on this aircraft that Echo cannot read and you can. */}
      <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
        <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
          <MonitorSmartphone className="h-3.5 w-3.5 text-primary" aria-hidden />
          Landing time on the cabin screen
        </p>
        {cabinAt ? (
          <>
            <p className="text-[11px] leading-snug text-muted-foreground">
              You read {flightTimeWords(cabinAt, toZone)} off the screen
              {drift ? ` — ${drift}` : ""}. The numbers above run on that, not the timetable.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11.5px]"
                onClick={() => {
                  setTyped("");
                  setAsking(true);
                }}
              >
                Screen says something else
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-[11.5px]" onClick={() => onCabinRead?.(null)}>
                Go back to the filed time
              </Button>
            </div>
          </>
        ) : (
          <p className="text-[11px] leading-snug text-muted-foreground">
            The numbers above run on the airline's filed landing of{" "}
            {arriveAt ? flightTimeWords(arriveAt, toZone) : "a time not on record"}. The screen in front of you knows
            the wind and the timetable does not, so if it shows a different landing time, tell Echo and the countdown
            follows it.
          </p>
        )}

        {(asking || !cabinAt) && onCabinRead && (
          <div className="flex flex-wrap items-end gap-2 pt-0.5">
            <div className="min-w-[6.5rem] space-y-1">
              <Label htmlFor="cabin-landing" className="text-[10.5px]">
                Local landing time at {to || "the airport"}
              </Label>
              <Input
                id="cabin-landing"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="05:40"
                inputMode="numeric"
                className="h-9 w-[6.5rem] text-[14px] tracking-wide"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && typed.trim()) {
                    onCabinRead(typed.trim());
                    setAsking(false);
                  }
                }}
              />
            </div>
            <Button
              size="sm"
              className="h-9 text-[12px]"
              disabled={!typed.trim()}
              onClick={() => {
                onCabinRead(typed.trim());
                setAsking(false);
              }}
            >
              Use this
            </Button>
          </div>
        )}
      </div>

      <AirportClock iata={to || null} homeZone={homeZone} label="Clock where you land" />

      <div className="space-y-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
        <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
          <Plug className="h-3.5 w-3.5 text-primary" aria-hidden />
          Power and signal
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">{cabin.caveat}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{OFFLINE_LAW}</p>
      </div>
    </div>
  );
}
