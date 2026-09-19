import { Coins, Languages, Phone, TrainFront } from "lucide-react";
import { arrivalGroundPack } from "@/lib/arrivalGround";

export function ArrivalGroundPack({ iata, arrived = false }: { iata: string | null | undefined; arrived?: boolean }) {
  const pack = arrivalGroundPack(iata);
  if (!pack) return null;
  const where = pack.city ? `${pack.city} (${pack.iata})` : pack.iata;

  return (
    <section className="vanta-inset space-y-2.5 px-3 py-2.5" aria-label={`Arrival ground pack for ${where}`}>
      <div>
        <p className="vanta-machine-label text-primary/85">{arrived ? "On the ground" : "Ready when you land"}</p>
        <p className="mt-0.5 text-[13px] font-medium text-foreground">{where}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Coins className="h-3 w-3" aria-hidden /> Money
          </p>
          <p className="text-[12px] font-medium text-foreground">
            {pack.currency ? `${pack.currencySymbol ? `${pack.currencySymbol} ` : ""}${pack.currency}` : "Not on record"}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            <Phone className="h-3 w-3" aria-hidden /> At the terminal
          </p>
          <p className="text-[12px] font-medium text-foreground">
            {pack.emergency.length ? pack.emergency.map((row) => `${row.label} ${row.number}`).join(" · ") : "Not on record"}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border/50 pt-2">
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-foreground/85">
          <TrainFront className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span>
            {pack.transit ?? "No verified airport-to-city shortcut is on record."}
            {pack.transitCheckedOn ? <span className="text-muted-foreground"> Checked {pack.transitCheckedOn}.</span> : null}
          </span>
        </p>
        <div className="flex items-start gap-1.5">
          <Languages className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          {pack.phrases.length ? (
            <p className="text-[11.5px] leading-snug text-foreground/85">
              {pack.phrases.map((phrase) => `${phrase.words} — ${phrase.means}`).join(" · ")}
            </p>
          ) : (
            <p className="text-[11.5px] text-muted-foreground">No kept phrase list for {pack.country ?? "this destination"}.</p>
          )}
        </div>
        {pack.emergencyNote && <p className="text-[10.5px] text-muted-foreground">{pack.emergencyNote}</p>}
      </div>
    </section>
  );
}