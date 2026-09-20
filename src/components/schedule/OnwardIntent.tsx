// OnwardIntent — the next hop, named without inventing a flight.
//
// When a trip finishes, a traveller often knows where they are going next
// before they know the flight. This card holds that one intention — an
// airport code, kept on the device — and waits. No phantom flight number, no
// made-up date, no countdown. When the real number exists, the ordinary add
// path takes it and Echo watches it like any other flight.
import { useEffect, useState } from "react";
import { ArrowRight, Compass, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { airportWords } from "@/lib/flightAirports";

const KEY = "echo.onward.next";

export type OnwardHop = { from: string; to: string; at: string };

export function readOnwardHop(): OnwardHop | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnwardHop>;
    if (!parsed || typeof parsed.to !== "string" || parsed.to.length !== 3) return null;
    return { from: String(parsed.from ?? ""), to: parsed.to, at: String(parsed.at ?? "") };
  } catch {
    return null;
  }
}

export function writeOnwardHop(hop: OnwardHop | null) {
  try {
    if (!hop) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(hop));
  } catch {
    /* storage blocked — the card still works for this visit */
  }
}

export function OnwardIntent({
  landedIata,
  onAddFlight,
}: {
  /** Where the finished trip put you down — the hop leaves from here. */
  landedIata: string | null;
  /** Opens the ordinary add-a-flight path when the real number exists. */
  onAddFlight?: () => void;
}) {
  const [hop, setHop] = useState<OnwardHop | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    setHop(readOnwardHop());
  }, []);

  const clean = code.trim().toUpperCase();

  const keep = () => {
    if (!/^[A-Z]{3}$/.test(clean)) return;
    const next: OnwardHop = {
      from: (landedIata ?? "").trim().toUpperCase(),
      to: clean,
      at: new Date().toISOString(),
    };
    setHop(next);
    writeOnwardHop(next);
    setCode("");
  };

  const drop = () => {
    setHop(null);
    writeOnwardHop(null);
  };

  const fromWords = hop?.from ? airportWords(hop.from) : null;
  const toWords = hop ? airportWords(hop.to) : null;

  return (
    <section
      aria-label="Next hop"
      className="space-y-2 rounded-xl border border-border/60 bg-card/60 p-3"
    >
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <Compass className="h-3.5 w-3.5 text-primary" aria-hidden />
        Next hop
      </p>

      {!hop ? (
        <div className="space-y-2">
          <p className="text-[12.5px] leading-snug text-foreground/90">
            Headed somewhere after this{landedIata ? ` — after ${airportWords(landedIata)}` : ""}? Name the
            airport and Echo keeps the seat warm. No flight is invented and nothing counts down until the real
            number is on your record.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28 space-y-1">
              <Label htmlFor="oi-to" className="text-[11px]">
                Airport code
              </Label>
              <Input
                id="oi-to"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                placeholder="USM"
                className="h-11 uppercase"
                autoComplete="off"
              />
            </div>
            <Button size="sm" className="h-11 text-[12.5px]" disabled={!/^[A-Z]{3}$/.test(clean)} onClick={keep}>
              Keep it on my desk
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-foreground">
            {hop.from ? (
              <>
                <span>{hop.from}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </>
            ) : null}
            <span>{hop.to}</span>
            {toWords ? <span className="font-normal text-muted-foreground">· {toWords}</span> : null}
          </p>
          <p className="text-[12px] leading-snug text-foreground/85">
            No flight on record for this hop yet{fromWords ? ` — you're on the ground at ${fromWords}` : ""}.
            When you have the flight number, add it like any other flight and Echo takes it from there: times,
            the board, and a receipt for what it finds.
          </p>
          <div className="flex flex-wrap gap-2">
            {onAddFlight ? (
              <Button size="sm" className="h-11 text-[12.5px]" onClick={onAddFlight}>
                Add the flight now
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-11 text-[12px] text-muted-foreground"
              onClick={drop}
            >
              <X className="mr-1 h-3.5 w-3.5" aria-hidden />
              Drop this hop
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
