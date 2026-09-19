// ArrivalStamp — the touchdown block: a customs stamp, the local clock, the
// money spent here and the number to call.
//
// Doctrine:
//   - Every line is a kept fact. An airport, currency or emergency number that
//     is not on record is written as not on record — never filled in.
//   - No rate is shown. The currency is named; a price would need a read.
//   - Echo says the number. It never dials.
//   - The stamp lands once on arrival. Reduced motion gets the same block, still.
import { useMemo } from "react";
import { arrivalFacts, helpCells, shiftWords } from "@/lib/arrivalFacts";
import { arrivalGroundPack } from "@/lib/arrivalGround";
import { TrainFront } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConnectionRead } from "@/lib/connectionRead";
import { SolariBoard } from "./SolariBoard";
import { GroundPack } from "./GroundPack";
import { ConnectionPack } from "./ConnectionPack";


export function ArrivalStamp({
  iata,
  at,
  homeZone,
  arrived = true,
  connection = null,
  className,
}: {
  /** Arrival airport code. */
  iata: string | null | undefined;
  /** The landing instant on record, or null when there isn't one. */
  at: string | null | undefined;
  /** The clock Echo is currently keeping, so the shift can be stated. */
  homeZone?: string | null;
  /**
   * True once the flight has actually landed. False reads the same facts about
   * the place you are heading to, and says so — it never claims you arrived.
   */
  arrived?: boolean;
  /**
   * Set when this landing is a connection, not the end of the trip. The city
   * pack is the wrong answer for a transit passenger, so it stands down and the
   * onward flight takes its place.
   */
  connection?: ConnectionRead | null;
  className?: string;
}) {
  const f = useMemo(() => arrivalFacts(iata, at, homeZone), [iata, at, homeZone]);
  if (!f) return null;

  const shift = shiftWords(f);
  const help = helpCells(f);
  const ground = arrivalGroundPack(iata);

  return (
    <div className={cn("space-y-2.5 rounded-md border border-border/60 bg-muted/15 p-2.5", className)}>
      {/* The stamp. Ink on the card, not a popup. Ahead of the landing it is the
          same plate, not inked, so nothing reads as already stamped. */}
      <div className="flex justify-center py-0.5">
        <div
          className={cn(
            "rounded-[3px] border-2 border-dashed px-3 py-1.5 text-center",
            arrived && !connection
              ? "arrival-stamp border-emerald-400/60 text-emerald-400/90"
              : "border-primary/45 text-primary/85",
          )}
        >
          <p className="vanta-machine-label leading-tight">
            {connection ? "Changing planes" : arrived ? "★ Arrived" : "Where you land"}
          </p>

          <p className="font-mono text-[13px] font-semibold leading-tight tracking-[0.12em]">
            {f.iata}
            {f.city ? ` · ${f.city}` : ""}
          </p>
          <p className="text-[9.5px] uppercase leading-tight tracking-[0.18em] opacity-80">
            {f.country ?? "country not on record"}
            {f.localDate ? ` · ${f.localDate}` : ""}
          </p>
        </div>
      </div>


      {/* The clock slip, the money and the number, all on the same board. On a
          connection only the clock matters — you are not spending here. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
        {f.localTime ? (
          <SolariBoard
            text={f.localTime}
            label={connection ? "Local time there" : arrived ? "Local time" : "Local landing time"}
            tone="primary"
          />
        ) : (
          <p className="text-[10.5px] text-muted-foreground/80">No landing time on record yet.</p>
        )}
        {!connection && f.currency && (
          <SolariBoard
            text={`${f.currencySymbol ?? ""} ${f.currency}`.trim()}
            label="Money here"
          />
        )}
        {!connection && help && <SolariBoard text={help} label="Emergency" tone="danger" />}
      </div>

      {connection ? (
        <ConnectionPack read={connection} />
      ) : (
        <>
          <div className="space-y-1 text-[11px] text-foreground/80">
            {shift && <p>{shift}</p>}
            {!f.city && <p>{f.iata} is not in Echo's airport table, so the clock and country here are unknown.</p>}
            {f.currency ? (
              <p>
                Spending {arrived ? "is" : "will be"} in {f.currency}. No rate is shown here — ask Echo for one and it
                reads it fresh.
              </p>
            ) : (
              <p>Echo does not have the currency for {f.country ?? f.iata} on record.</p>
            )}
            {help ? (
              <p>Emergency: {help}{f.help?.note ? ` ${f.help.note}` : ""} Echo cannot make the call for you.</p>
            ) : (
              <p>No published emergency number on record for {f.country ?? f.iata} — ask airport staff.</p>
            )}
            <p className="text-muted-foreground/75">Echo keeps your clock until you say switch.</p>
          </div>

          {/* The first move off the plane stays on the face of the card. Everything
              else — money, routes, words, numbers, sockets — sits one tap down in
              the ground pack, which reads with no signal. */}
          <div className="space-y-2 border-t border-border/50 pt-2">
            <div className="flex items-start gap-1.5">
              <TrainFront className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <p className="text-[11px] leading-snug text-foreground/85">
                {ground?.transit ?? "No verified airport-to-city shortcut is on record."}
                {ground?.transitCheckedOn ? <span className="text-muted-foreground"> Checked {ground.transitCheckedOn}.</span> : null}
              </p>
            </div>
          </div>

          <GroundPack iata={f.iata} arrived={arrived} />
        </>
      )}

    </div>
  );
}
