// InAirPack — the card while you are on the aircraft, with no feed from it.
//
// Doctrine:
//   - The track is the great circle between the two airports on record, and the
//     marker rides the clock. It says whose word it is on.
//   - Miles to landing and time left come off the filed times. No time, no number.
//   - Cabin power and Wi-Fi are usual practice, labelled. Nothing is read off
//     this aircraft.
//   - It works with no signal: everything here is already on the device.
import { useEffect, useState } from "react";
import { Plug } from "lucide-react";
import { AirportClock } from "./AirportClock";
import { FlightArc } from "./FlightArc";
import { SolariBoard } from "./SolariBoard";
import { cabinRead, inAirRead, instantAlong, OFFLINE_LAW } from "@/lib/inAir";

export function InAirPack({
  fromIata,
  toIata,
  departAt,
  arriveAt,
  clock,
  homeZone,
}: {
  fromIata: string | null;
  toIata: string | null;
  departAt: string | null;
  arriveAt: string | null;
  clock: (iso: string) => string;
  homeZone?: string | null;
}) {
  /* Ticks on the minute so the miles and the time left move while you watch. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const read = inAirRead({ fromIata, toIata, departAt, arriveAt, now });
  const cabin = cabinRead(read.totalMi);
  const from = (fromIata ?? "").trim().toUpperCase();
  const to = (toIata ?? "").trim().toUpperCase();

  return (
    <div className="space-y-3 border-t border-border/50 pt-3">
      <p className="vanta-machine-label text-foreground/70">In the air</p>

      <FlightArc
        from={from || "—"}
        to={to || "—"}
        progress={read.progress}
        phase="flying"
        instantAt={instantAlong(departAt, arriveAt)}
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
          {read.flownMi.toLocaleString()} of {read.totalMi.toLocaleString()} miles flown, on the filed times. The
          airline has filed no radar position, so the plane on the track rides the clock, not a fix.
        </p>
      )}

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
