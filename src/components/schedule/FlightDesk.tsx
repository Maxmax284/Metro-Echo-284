// FlightDesk — Echo prepares a flight, you confirm it.
//
// Doctrine:
//   - No fare feed exists here, so Echo never presents a price as the market's.
//     Every number carries where it came from: you typed it, or you pasted it.
//   - Preparing is a draft with a fate. Confirming records it on your board.
//     Nothing is bought, held, or checked in — the standing line says so.
//   - A pasted quote is read conservatively: a line without a flight code and a
//     time is handed back as unread rather than guessed at.
import { useMemo, useState } from "react";
import { Plane, PlusCircle, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useFlightPlans } from "@/hooks/useFlightPlans";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatInTimeZone } from "date-fns-tz";
import { vantaToast } from "@/lib/vantaVoice";
import {
  FLIGHT_LAW,
  SOURCE_WORDS,
  canConfirm,
  optionWords,
  parseQuote,
  planTitle,
  planWords,
  sortOptions,
  type FlightOption,
} from "@/lib/flightPlan";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FlightDesk() {
  const { timezone } = useUserTimezone();
  const { plans, loading, error, refresh, prepare, confirm, drop } = useFlightPlans();
  const clock = (iso: string) => {
    const d = new Date(iso);
    return Number.isFinite(d.getTime()) ? formatInTimeZone(d, timezone, "HH:mm") : "—";
  };

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departOn, setDepartOn] = useState(today());
  const [returnOn, setReturnOn] = useState("");
  const [passengers, setPassengers] = useState("1");
  const [currency, setCurrency] = useState("USD");
  const [quote, setQuote] = useState("");
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});

  const read = useMemo(() => parseQuote(quote, departOn, currency), [quote, departOn, currency]);

  const open = plans.filter((p) => p.status === "prepared");
  const settled = plans.filter((p) => p.status !== "prepared");

  const submit = async () => {
    if (!origin.trim() || !destination.trim()) {
      vantaToast.warning("A flight needs somewhere to leave from and somewhere to land.");
      return;
    }
    if (!read.options.length) {
      vantaToast.warning("Paste or type at least one flight line with a code and a time — Echo will not invent one.");
      return;
    }
    setBusy(true);
    try {
      await prepare({
        origin,
        destination,
        depart_on: departOn,
        return_on: returnOn || null,
        passengers: Number(passengers) || 1,
        currency: currency.trim().toUpperCase() || null,
        source: "pasted",
        options: read.options as FlightOption[],
      });
      setQuote("");
      vantaToast.success("Prepared. It waits for your yes on the board.");
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "That flight could not be prepared.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Reading your prepared flights…" />;

  return (
    <div className="space-y-3">
      {error && <ErrorState detail={error} onRetry={() => void refresh()} />}

      <Card className="vanta-card space-y-3 p-3">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-[13px] font-medium">Prepare a flight</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="fd-from" className="text-[11px]">From</Label>
            <Input id="fd-from" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="JFK" className="h-10 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fd-to" className="text-[11px]">To</Label>
            <Input id="fd-to" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="BKK" className="h-10 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fd-out" className="text-[11px]">Out</Label>
            <Input id="fd-out" type="date" value={departOn} onChange={(e) => setDepartOn(e.target.value)} className="h-10 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fd-back" className="text-[11px]">Back (optional)</Label>
            <Input id="fd-back" type="date" value={returnOn} onChange={(e) => setReturnOn(e.target.value)} className="h-10 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fd-pax" className="text-[11px]">Travellers</Label>
            <Input id="fd-pax" type="number" min={1} value={passengers} onChange={(e) => setPassengers(e.target.value)} className="h-10 text-[13px]" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fd-cur" className="text-[11px]">Currency</Label>
            <Input id="fd-cur" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" className="h-10 text-[13px]" />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="fd-quote" className="text-[11px]">The flights, one per line</Label>
          <Textarea
            id="fd-quote"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={4}
            placeholder={"TG 601 · 08:45 → 12:20 · non-stop · $412\nEK 385 · 22:10 → 18:05 · 1 stop · $358"}
            className="text-[13px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Paste it from wherever you found it. Echo reads the flight code, the times and the price — it never fills in
            a number the line did not carry.
          </p>
        </div>

        {read.options.length > 0 && (
          <div className="rounded-[2px] border border-border/60 p-2">
            <p className="vanta-machine-label mb-1 text-foreground/70">What Echo read</p>
            <ul className="space-y-1">
              {sortOptions(read.options).map((o) => (
                <li key={o.id} className="text-[12px] text-foreground/85">{optionWords(o, clock)}</li>
              ))}
            </ul>
            {read.unread.length > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {read.unread.length} {read.unread.length === 1 ? "line" : "lines"} it could not read, left out rather than guessed at.
              </p>
            )}
          </div>
        )}

        <Button onClick={() => void submit()} disabled={busy} className="h-10 w-full text-[13px]">
          <PlusCircle className="mr-1 h-4 w-4" aria-hidden />
          Prepare it
        </Button>
        <p className="text-[11px] text-muted-foreground/80">{FLIGHT_LAW}</p>
      </Card>

      <Card className="vanta-card space-y-2 p-3">
        <p className="vanta-machine-label text-foreground/70">Waiting on your yes</p>
        {open.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">
            Nothing prepared. A flight lands here when you prepare one above, and it stays a draft until you confirm it
            — here or on the Board.
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((p) => {
              const pick = chosen[p.id] ?? p.options[0]?.id ?? "";
              const verdict = canConfirm(p, pick);
              return (
                <li key={p.id} className="space-y-2 border-l-2 border-primary/50 pl-2">
                  <p className="text-[13px] text-foreground/90">{planTitle(p)}</p>
                  <p className="text-[11px] text-muted-foreground">{SOURCE_WORDS[p.source]}.</p>
                  <ul className="space-y-1">
                    {sortOptions(p.options).map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => setChosen((prev) => ({ ...prev, [p.id]: o.id }))}
                          aria-pressed={pick === o.id}
                          className={cn(
                            "w-full rounded-[2px] border px-2 py-2 text-left text-[12px]",
                            MOTION_FOCUS,
                            pick === o.id ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/60 text-foreground/80",
                          )}
                        >
                          {optionWords(o, clock)}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-9 text-[12px]"
                      disabled={!verdict.ok || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await confirm(p, pick);
                          vantaToast.success("Confirmed on your board. No ticket was bought.");
                        } catch (e) {
                          vantaToast.warning(e instanceof Error ? e.message : "That could not be confirmed.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Confirm this one
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 text-[12px]"
                      onClick={() => void drop(p)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Drop it
                    </Button>
                    {!verdict.ok && verdict.reason && (
                      <span className="text-[11px] text-muted-foreground">{verdict.reason}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {settled.length > 0 && (
        <Card className="vanta-card space-y-1.5 p-3">
          <p className="vanta-machine-label text-foreground/70">Settled</p>
          <ul className="space-y-1">
            {settled.map((p) => (
              <li key={p.id} className="text-[12px] text-foreground/85">{planWords(p, clock)}</li>
            ))}
          </ul>
        </Card>
      )}

      <AftermathHint text="A confirmed flight becomes departure and landing entries on your Board. Echo records; buying stays yours." />
    </div>
  );
}
