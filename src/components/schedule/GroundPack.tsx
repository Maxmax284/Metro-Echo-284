// GroundPack — everything you need on the ground at the other end, offline.
//
// Doctrine:
//   - Every line comes from the kept country tables bundled with the app, so
//     this reads with no signal, in a queue, at passport control.
//   - Nothing is inferred. A section with nothing kept says so and stops.
//   - No rate, no live departure, no promise. Each practical line carries the
//     day it was checked.
//   - Echo says the number. It never dials, and nothing here runs anything.
import { useState } from "react";
import {
  ChevronDown,
  Coins,
  Languages,
  LifeBuoy,
  Plug,
  Signal,
  TrainFront,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";
import { MachineLabel } from "@/components/ui/instrument";
import { arrivalGroundPack, type ArrivalNote } from "@/lib/arrivalGround";

function Notes({ notes }: { notes: ArrivalNote[] }) {
  return (
    <ul className="space-y-1">
      {notes.map((note) => (
        <li key={note.line} className="text-[11px] leading-snug text-foreground/85">
          {note.line}
          <span className="text-muted-foreground"> Checked {note.checked_on}.</span>
        </li>
      ))}
    </ul>
  );
}

function Block({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-primary" aria-hidden>
          {icon}
        </span>
        <MachineLabel className="text-foreground/70">{label}</MachineLabel>
      </div>
      {children}
    </div>
  );
}

/**
 * The full ground pack for an arrival airport. Folded by default: the stamp
 * above already carries the clock, the money and the number, and this opens
 * only when someone wants the detail.
 */
export function GroundPack({
  iata,
  arrived = true,
  className,
}: {
  iata: string | null | undefined;
  arrived?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pack = arrivalGroundPack(iata);
  if (!pack) return null;

  const where = pack.city ?? pack.iata;
  const nothingKept =
    !pack.transitNotes.length &&
    !pack.moneyNotes.length &&
    !pack.phrases.length &&
    !pack.watchOut.length &&
    !pack.emergency.length;

  return (
    <div className={cn("border-t border-border/50 pt-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex min-h-[36px] w-full items-center justify-between gap-2 rounded-[2px] border border-border/60 px-2",
          "text-[11px] text-foreground/85 hover:border-primary/40 hover:text-foreground",
          MOTION_FOCUS,
        )}
      >
        <span>
          {nothingKept
            ? `Nothing kept about ${where} yet`
            : arrived
              ? `On the ground in ${where}`
              : `For when you land in ${where}`}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {nothingKept ? (
            <p className="text-[11px] leading-snug text-foreground/85">
              Echo has no kept notes for {pack.country ?? where}. It would rather say that than write
              travel advice it cannot stand behind.
            </p>
          ) : (
            <>
              <p className="text-[10.5px] leading-snug text-muted-foreground">
                Written by hand and readable with no signal. Notes, not a live feed — check anything
                that costs you money or a flight.
              </p>

              <Block icon={<Coins className="h-3.5 w-3.5" />} label="Money">
                <p className="text-[11px] leading-snug text-foreground/85">
                  {pack.currency
                    ? `Spending is in ${pack.currency}${pack.currencySymbol ? ` (${pack.currencySymbol})` : ""}. No rate is shown here — ask Echo and it reads one fresh.`
                    : `Echo does not have the currency for ${pack.country ?? where} on record.`}
                </p>
                {pack.moneyNotes.length ? <Notes notes={pack.moneyNotes} /> : null}
                {pack.paying ? (
                  <p className="text-[11px] leading-snug text-foreground/85">{pack.paying}</p>
                ) : null}
                {pack.tipping ? (
                  <p className="text-[11px] leading-snug text-foreground/85">Tipping: {pack.tipping}</p>
                ) : null}
              </Block>

              <Block icon={<TrainFront className="h-3.5 w-3.5" />} label="Getting into town">
                {pack.transitNotes.length ? (
                  <Notes notes={pack.transitNotes} />
                ) : (
                  <p className="text-[11px] leading-snug text-foreground/85">
                    No verified airport-to-city route is on record.
                  </p>
                )}
              </Block>

              <Block icon={<Languages className="h-3.5 w-3.5" />} label="Words that help">
                {pack.phrases.length ? (
                  <ul className="space-y-1">
                    {pack.phrases.map((phrase) => (
                      <li key={phrase.words} className="text-[11px] leading-snug text-foreground/85">
                        <span className="font-medium text-foreground">{phrase.words}</span>
                        <span className="text-muted-foreground"> — {phrase.means}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] leading-snug text-foreground/85">
                    No kept phrase list for {pack.country ?? where}.
                  </p>
                )}
              </Block>

              <Block icon={<LifeBuoy className="h-3.5 w-3.5" />} label="If something goes wrong">
                {pack.emergency.length ? (
                  <ul className="space-y-1">
                    {pack.emergency.map((row) => (
                      <li key={row.number} className="text-[11px] leading-snug text-foreground/85">
                        {row.label}: <span className="font-mono">{row.number}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] leading-snug text-foreground/85">
                    No published emergency number on record for {pack.country ?? where} — ask airport
                    staff.
                  </p>
                )}
                {pack.emergencyNote ? (
                  <p className="text-[11px] leading-snug text-foreground/85">{pack.emergencyNote}</p>
                ) : null}
                <p className="text-[10.5px] leading-snug text-muted-foreground">
                  These are national numbers. Echo has no airport-specific terminal or security line
                  on record, and it cannot make the call for you.
                </p>
              </Block>

              {(pack.plugs || pack.voltage || pack.sim || pack.phone) && (
                <Block icon={<Plug className="h-3.5 w-3.5" />} label="Power and phone">
                  {(pack.plugs || pack.voltage) && (
                    <p className="text-[11px] leading-snug text-foreground/85">
                      Sockets {pack.plugs ?? "not on record"}
                      {pack.voltage ? `, ${pack.voltage}` : ""}.
                    </p>
                  )}
                  {pack.sim && (
                    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-foreground/85">
                      <Signal className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
                      {pack.sim}
                    </p>
                  )}
                  {pack.phone && (
                    <p className="text-[11px] leading-snug text-foreground/85">
                      Dialling code {pack.phone}.
                    </p>
                  )}
                </Block>
              )}

              {pack.watchOut.length ? (
                <Block icon={<TriangleAlert className="h-3.5 w-3.5" />} label="Watch out">
                  <Notes notes={pack.watchOut} />
                </Block>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
