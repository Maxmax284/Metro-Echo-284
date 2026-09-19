// FlightDesk — Echo prepares a flight, notices one, and you say what it is.
//
// Doctrine:
//   - Two ways in. You prepare a flight from times you paste, or Echo recognises
//     a booking in something already readable. A recognised booking is a
//     question with its evidence attached, never a fact.
//   - Whose it is, you answer. Once. The answer is remembered against the sender
//     so the same person's next booking is not asked about cold.
//   - Live status is a reading with a time on it. A provider that carries nothing
//     is reported as carrying nothing.
//   - Nothing here buys, holds, or checks anyone in. Confirming records.
import { useMemo, useState } from "react";
import { Plane, PlusCircle, RadioTower, ScanLine, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useFlightPlans } from "@/hooks/useFlightPlans";
import { useJourney } from "@/hooks/useJourney";
import { useFlightTelemetry } from "@/hooks/useFlightTelemetry";
import { JourneySpine } from "./JourneySpine";
import { FlightEvidenceCard } from "./FlightEvidenceCard";
import { FlightLive } from "./FlightLive";
import { GroundLead } from "./GroundLead";
import { groundPath } from "@/lib/groundPath";
import { readStage, writeStage, type GroundStage } from "@/lib/groundStage";
import { carrierId, mergeIdentity, type FlightIdentity } from "@/lib/flightIdentity";
import { FlightRouteMap } from "./FlightRouteMap";
import { AirportClock } from "./AirportClock";
import { ArrivalStamp } from "./ArrivalStamp";
import { FlightAlertsCard } from "./FlightAlertsCard";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { flightClock } from "@/lib/flightClock";
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
  type FlightPlan,
} from "@/lib/flightPlan";
import { OWNERSHIP_CHOICES, SOURCE_WORDS as NOTICE_SOURCE_WORDS, type NoticeSource } from "@/lib/flightRecognize";
import { QUICK_LAW } from "@/lib/flightQuick";
import { readingAge, statusWords, trackProgress, type LiveFlight } from "@/lib/flightStatus";
import { airportZone, anchorToZone, clockShift, leaveForFlight } from "@/lib/travelSense";
import { airportWords } from "@/lib/airports";
import { MOTION_FOCUS } from "@/lib/motion";
import { cn } from "@/lib/utils";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function noticedWords(plan: FlightPlan): string {
  const n = plan.noticed_from;
  if (!n) return "";
  const src = (n.source_words ?? NOTICE_SOURCE_WORDS[(n.source as NoticeSource) ?? "pasted"]) || "something on record";
  const who = n.sender?.name ?? n.sender?.email ?? null;
  const read = who ? `Read from ${src}, sent by ${who}.` : `Read from ${src}.`;
  /* Where it was booked, when the evidence named it. Provenance only — Echo
     never signs into a booking site and never takes a status from one. */
  return n.booking?.words ? `${read} ${n.booking.words}` : read;
}

/** Every later source that filled a blank on this flight. Recorded only. */
const FACT_WORDS: Record<string, string> = {
  origin: "where it leaves from",
  destination: "where it lands",
  depart_time: "the departure time",
  arrive_time: "the arrival time",
  booking_ref: "the confirmation code",
  traveller: "who is travelling",
};

function filledWords(plan: FlightPlan): string[] {
  const sources = plan.noticed_from?.sources ?? [];
  return sources
    .map((s) => {
      const facts = (s.filled ?? []).map((f) => FACT_WORDS[f] ?? f);
      if (!facts.length) return null;
      const src = s.source_words ?? "another source";
      return `${facts.join(", ")} came off ${src}`;
    })
    .filter((v): v is string => !!v);
}


export function FlightDesk() {
  const { timezone } = useUserTimezone();
  const {
    plans,
    loading,
    error,
    refresh,
    prepare,
    confirm,
    drop,
    answerOwnership,
    settleConflict,
    keepCondition,
    checkStatus,
    lookUpCheckIn,
    noticeText,
    addByNumber,
  } = useFlightPlans();
  /* Which flight is having its check-in area read, so only that card waits. */
  const [looking, setLooking] = useState<string | null>(null);
  /* 12-hour, with the day when it is not today. "Be there by 22:15" is a riddle. */
  const clock = useMemo(() => flightClock(timezone), [timezone]);

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departOn, setDepartOn] = useState(today());
  const [returnOn, setReturnOn] = useState("");
  const [passengers, setPassengers] = useState("1");
  const [currency, setCurrency] = useState("USD");
  const [quote, setQuote] = useState("");
  const [booking, setBooking] = useState("");
  const [quickNo, setQuickNo] = useState("");
  const [quickDate, setQuickDate] = useState(today());
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [live, setLive] = useState<Record<string, string>>({});
  /* Removal is asked once, plainly, and never assumed from a stray tap. */
  const [removing, setRemoving] = useState<FlightPlan | null>(null);
  /* Where you are standing. This device's word, kept on this device only. */
  const [stages, setStages] = useState<Record<string, GroundStage>>({});
  const stageOf = (planId: string): GroundStage => stages[planId] ?? readStage(planId);
  const setStage = (planId: string, stage: GroundStage) => {
    writeStage(planId, stage);
    setStages((prev) => ({ ...prev, [planId]: stage }));
  };

  const read = useMemo(() => parseQuote(quote, departOn, currency), [quote, departOn, currency]);

  /* The journey is derived from the same plans — no second source of truth. */
  const journey = useJourney(plans, refresh);

  /* Near a flight, the deck keeps its own reading current while you are looking
     at it — one flight at a time, held to the day's allowance of airline checks. */
  const { readingPlanId } = useFlightTelemetry(plans, checkStatus);

  const asked = plans.filter((p) => p.ownership === "unknown" && p.status === "prepared");
  const open = plans.filter((p) => p.status === "prepared" && p.ownership !== "unknown" && p.ownership !== "theirs");
  const watched = plans.filter((p) => p.ownership === "theirs" && p.status !== "dropped");
  const settled = plans.filter((p) => p.status !== "prepared" && p.ownership !== "theirs");

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

  /** The whole manual path: a number and a day. */
  const quickAdd = async () => {
    setBusy(true);
    try {
      const res = await addByNumber(quickNo, quickDate);
      if (!res.ok) {
        vantaToast.warning(res.reason ?? "That flight could not be added.");
        return;
      }
      setQuickNo("");
      vantaToast.success(res.words ?? "On your record.");
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "That flight could not be added.");
    } finally {
      setBusy(false);
    }
  };

  const readBooking = async () => {
    if (booking.trim().length < 8) {
      vantaToast.warning("Paste the booking itself — a confirmation mail, an itinerary, a forwarded message.");
      return;
    }
    setBusy(true);
    try {
      const res = await noticeText({ text: booking });
      setBooking("");
      if (!res.created && !res.known) {
        vantaToast.warning("Nothing in that read as a flight. A flight code and a date are what Echo needs.");
      } else if (res.asked) {
        vantaToast.success(`${res.created} flight read. It is waiting on you to say whose it is.`);
      } else {
        vantaToast.success(
          res.created ? `${res.created} flight filed against your record.` : "Already on your record. Nothing doubled.",
        );
      }
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "That booking could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const askLive = async (plan: FlightPlan) => {
    setBusy(true);
    try {
      const res = await checkStatus(plan);
      setLive((prev) => ({ ...prev, [plan.id]: res.news ? `${res.words} ${res.news}` : res.words }));
      if (res.news) vantaToast.success(res.news);
    } catch (e) {
      vantaToast.warning(e instanceof Error ? e.message : "That flight could not be read.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * The arithmetic around a flight: when to leave, and one line on what the clock
   * does on arrival. Two lines at most — nobody needs a lecture on jet lag while
   * they are working out what time to leave the house.
   */
  const senseLines = (plan: FlightPlan): string[] => {
    const snap = plan.live_status as LiveFlight | null;
    const code = (v?: string | null) => {
      const t = (v ?? "").trim().toUpperCase();
      return /^[A-Z]{3}$/.test(t) ? t : null;
    };
    const from = code(snap?.departure.iata) ?? code(plan.origin);
    const to = code(snap?.arrival.iata) ?? code(plan.destination);
    /* A ticket time is the wall clock where you take off. Anchored to that
       airport's zone so the leave-by arithmetic is real, and read back in the
       same local time you will be standing in. */
    const departAt = anchorToZone(
      snap?.departure.estimated ?? snap?.departure.scheduled ?? plan.options[0]?.depart_at ?? null,
      airportZone(from),
    );
    const there = flightClock(airportZone(from) ?? timezone);

    const out: string[] = [];
    if (departAt) out.push(leaveForFlight({ departAt, fromIata: from, toIata: to }, there).words);
    const shift = clockShift(from, to);
    /* The clock difference, first sentence only. The advice that used to follow
       it was never asked for. */
    if (shift && shift.direction !== "same") out.push(`${shift.words.split(". ")[0]}.`);
    return out;
  };

  /**
   * Where this flight puts you down — its clock, its money, its emergency
   * number — taken from the flight's own arrival airport. Shown from the ticket
   * alone, so it does not wait on the airline feed. The live deck inks its own
   * stamp once a reading exists, so this stands in only until then.
   */
  /**
   * The practical next move for one flight, derived from what is already on
   * record. It leads the card and it is one line: closer to the gate the
   * emphasis shifts from the clock to the counter, the board and the gate, with
   * no new card and nothing stacked on.
   */
  /** Both names for one flight: the ticket's and the terminal's. */
  const identityOf = (plan: FlightPlan): FlightIdentity | null => {
    const option = plan.options.find((o) => o.id === plan.chosen_option_id) ?? plan.options[0] ?? null;
    if (!option) return null;
    return mergeIdentity((option.identity ?? null) as FlightIdentity | null, {
      marketing:
        (option.identity as FlightIdentity | null)?.marketing ??
        carrierId({ carrier: option.airline, flight_no: option.flight_no }),
    });
  };

  const groundBlock = (plan: FlightPlan, lead = false) => {
    const snap = plan.live_status as LiveFlight | null;
    const option = plan.options.find((o) => o.id === plan.chosen_option_id) ?? plan.options[0] ?? null;
    const identity = identityOf(plan);
    /* Where the journey model says this person is, for this flight only — unless
       this device says they are already standing in the terminal. */
    const legIndex = (journey.current?.legs ?? []).findIndex((l) => l.plan_id === plan.id);
    const atThisLeg = legIndex >= 0 && journey.where?.legIndex === legIndex;
    const stage = stageOf(plan.id);
    const computed = atThisLeg ? journey.where!.kind : "before";
    const where = stage !== "away" && (computed === "before" || computed === "at_airport") ? "at_airport" : computed;
    const departAt =
      snap?.departure.estimated ?? snap?.departure.scheduled ?? option?.depart_at ?? null;
    const depMs = departAt ? Date.parse(departAt) : NaN;
    const read = groundPath({
      where,
      identity,
      fromPlace: airportWords((plan.origin ?? "").trim().toUpperCase()) || plan.origin,
      toPlace: airportWords((plan.destination ?? "").trim().toUpperCase()) || plan.destination,
      terminal: snap?.departure.terminal ?? null,
      gate: where === "in_air" ? (snap?.arrival.gate ?? null) : (snap?.departure.gate ?? null),
      minsToDeparture: Number.isFinite(depMs) ? Math.round((depMs - Date.now()) / 60_000) : null,
      throughSecurity: stage === "security",
    });
    return (
      <GroundLead
        read={read}
        lead={lead}
        stage={where === "in_air" || where === "done" ? undefined : stage}
        onStage={(s) => setStage(plan.id, s)}
        looking={looking === plan.id}
        onLookUp={async () => {
          setLooking(plan.id);
          try {
            vantaToast.info(await lookUpCheckIn(plan));
          } catch (e) {
            vantaToast.warning(e instanceof Error ? e.message : "That look-up did not go through.");
          } finally {
            setLooking(null);
          }
        }}
      />
    );
  };

  const groundAhead = (plan: FlightPlan) => {
    if (plan.live_status) return null;
    const from = (plan.origin ?? "").trim().toUpperCase();
    const to = (plan.destination ?? "").trim().toUpperCase();
    const at = anchorToZone(plan.options.find((o) => o.arrive_at)?.arrive_at ?? null, airportZone(to));
    /* The clock at the airport you leave from, live, so the board reads right
       standing at the gate — not only after the wheels are down. */
    const here = /^[A-Z]{3}$/.test(from) ? (
      <AirportClock iata={from} homeZone={timezone} label="Local time at the gate" />
    ) : null;
    const there = /^[A-Z]{3}$/.test(to) && at ? (
      <ArrivalStamp iata={to} at={at} homeZone={timezone} arrived={false} />
    ) : null;
    if (!here && !there) return null;
    return (
      <div className="space-y-2.5">
        {here}
        {there}
      </div>
    );
  };

  /* The aircraft is drawn only from a filed fix on a leg of this very trip.
     No fix, no plane — the route still draws, the position is simply not known. */
  const aircraft = useMemo(() => {
    const ids = new Set((journey.current?.legs ?? []).map((l) => l.plan_id));
    for (const p of plans) {
      if (!ids.has(p.id)) continue;
      const snap = p.live_status as LiveFlight | null;
      const pos = snap?.position ?? null;
      if (!pos || typeof pos.lat !== "number" || typeof pos.lon !== "number") continue;
      if (trackProgress(snap!).source !== "radar") continue;
      return {
        lat: pos.lat,
        lon: pos.lon,
        heading: typeof pos.heading_deg === "number" ? pos.heading_deg : null,
        label: snap?.flight_no ? `${snap.flight_no} · airline fix` : "airline fix",
      };
    }
    return null;
  }, [plans, journey.current]);

  const liveLine = (plan: FlightPlan): string | null => {
    if (live[plan.id]) return live[plan.id];
    const snapshot = plan.live_status as LiveFlight | null;
    if (!snapshot || !plan.live_checked_at) return null;
    return `${statusWords(snapshot, clock)} ${readingAge(plan.live_checked_at)}.`;
  };

  if (loading) return <LoadingState label="Reading your prepared flights…" />;

  return (
    <div className="space-y-3">
      {error && <ErrorState detail={error} onRetry={() => void refresh()} />}

      <FlightAlertsCard />

      {/* The trip you are actually on comes before anything you might add — and
          the move comes before the trip. A person reading this is walking. */}
      {journey.current ? (
        <>
        {livePlan ? groundBlock(livePlan, true) : null}
        <details className="group">
          <summary
            className={cn(
              "vanta-card flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[12px] text-foreground/80",
              MOTION_FOCUS,
            )}
          >
            <span>Full journey — legs, times and what changed</span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 space-y-3">
            <JourneySpine
              journey={journey.current}
              where={journey.where}
              news={journey.news}
              savedAt={journey.savedAt}
              onOverride={(planId, state) => journey.setLegState(planId, state)}
              onClearOverride={(planId) => journey.clearLegState(planId)}
              onDismissNews={journey.dismissNews}
            />
            {/* The same trip as a route you can tap, stop by stop. */}
            <FlightRouteMap journey={journey.current} homeZone={timezone} aircraft={aircraft} />
          </div>
        </details>
        </>
      ) : null}

      {/* What a later reading said, and the two honest answers to it. */}
      <FlightEvidenceCard
        plans={plans}
        onSettle={settleConflict}
        onKeepCondition={keepCondition}
        onLookUp={askLive}
      />


      {/* The manual way in, first thing on the desk and as small as a flight gets. */}
      <Card className="vanta-card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-[13px] font-medium">Add a flight</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[7.5rem] flex-1 space-y-1">
            <Label htmlFor="fd-quick-no" className="text-[11px]">Flight number</Label>
            <Input
              id="fd-quick-no"
              value={quickNo}
              onChange={(e) => setQuickNo(e.target.value)}
              placeholder="TG601"
              autoCapitalize="characters"
              className="h-11 text-[15px] tracking-wide"
              onKeyDown={(e) => {
                if (e.key === "Enter") void quickAdd();
              }}
            />
          </div>
          <div className="min-w-[9rem] flex-1 space-y-1">
            <Label htmlFor="fd-quick-date" className="text-[11px]">Day it leaves</Label>
            <Input
              id="fd-quick-date"
              type="date"
              value={quickDate}
              onChange={(e) => setQuickDate(e.target.value)}
              className="h-11 text-[13px]"
            />
          </div>
          <Button onClick={() => void quickAdd()} disabled={busy} className="h-11 min-w-[5rem] text-[13px]">
            <PlusCircle className="mr-1 h-4 w-4" aria-hidden />
            Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{QUICK_LAW}</p>
        <button
          type="button"
          onClick={() => setDetail((v) => !v)}
          className={cn("text-left text-[11.5px] text-primary/90 underline underline-offset-2", MOTION_FOCUS)}
          aria-expanded={detail}
        >
          {detail ? "Hide the longer way" : "Got a route, times or a price? Add the detail"}
        </button>
      </Card>

      {asked.length > 0 && (
        <Card className="vanta-card space-y-3 p-3">
          <p className="vanta-machine-label text-foreground/70">Echo noticed a flight</p>
          <ul className="space-y-3">
            {asked.map((p) => (
              <li key={p.id} className="space-y-2 border-l-2 border-primary/50 pl-2">
                <p className="text-[13px] text-foreground/90">{planTitle(p)}</p>
                {p.traveller_name && (
                  <p className="text-[12px] text-foreground/80">In the name of {p.traveller_name}.</p>
                )}
                <p className="text-[11px] text-muted-foreground">{noticedWords(p)}</p>
                {(p.noticed_from?.evidence ?? []).length > 0 && (
                  <ul className="space-y-0.5">
                    {(p.noticed_from?.evidence ?? []).map((line) => (
                      <li key={line} className="text-[11px] text-muted-foreground">
                        · {line}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[12.5px] text-foreground/85">Does this flight have anything to do with you?</p>
                <div className="flex flex-wrap gap-1.5">
                  {OWNERSHIP_CHOICES.map((choice) => (
                    <Button
                      key={choice.id}
                      size="sm"
                      variant={choice.id === "mine" ? "default" : "outline"}
                      className="h-9 text-[12px]"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await answerOwnership(p, choice.id);
                          vantaToast.success(choice.plain);
                        } catch (e) {
                          vantaToast.warning(e instanceof Error ? e.message : "That answer did not save.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {choice.label}
                    </Button>
                  ))}
                </div>
                {/* One reading from the airline, on your tap. It fills in the
                    route and the times the airline actually carries; it never
                    answers whose flight it is. */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 text-[12px]"
                  disabled={busy}
                  onClick={() => void askLive(p)}
                >
                  Look up the details
                </Button>
                {liveLine(p) && <p className="text-[11px] text-muted-foreground">{liveLine(p)}</p>}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground/80">
            Nothing goes on your board from a booking Echo found. It asks once, remembers who sent it, and waits.
          </p>
        </Card>
      )}

      <Card className="vanta-card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <ScanLine className="h-4 w-4 text-primary" aria-hidden />
          <p className="text-[13px] font-medium">Read a booking</p>
        </div>
        <Textarea
          value={booking}
          onChange={(e) => setBooking(e.target.value)}
          rows={3}
          placeholder={"Paste a confirmation mail, an itinerary or a forwarded message."}
          className="text-[13px]"
          aria-label="Paste a booking for Echo to read"
        />
        <Button variant="outline" onClick={() => void readBooking()} disabled={busy} className="h-10 w-full text-[13px]">
          Read it
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Echo reads the flight code, the date, the times and the name on it. It signs into nothing, and whatever it
          reads waits on your answer.
        </p>
      </Card>

      <Card className={cn("vanta-card space-y-3 p-3", !detail && "hidden")}>
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
            Nothing prepared. A flight lands here when you prepare one above, or when Echo reads one and you say it is
            yours — and it stays a draft until you confirm it, here or on the Board.
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((p) => {
              const pick = chosen[p.id] ?? p.options[0]?.id ?? "";
              const verdict = canConfirm(p, pick);
              return (
                <li key={p.id} className="space-y-2 border-l-2 border-primary/50 pl-2">
                  <p className="text-[13px] text-foreground/90">{planTitle(p)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.origin_kind === "recognised" ? noticedWords(p) : `${SOURCE_WORDS[p.source]}.`}
                  </p>
                  {/* Which source filled which fact. Recorded lines only. */}
                  {filledWords(p).map((line) => (
                    <p key={line} className="text-[11px] text-muted-foreground">
                      · {line}
                    </p>
                  ))}

                  {p.booking_ref && (
                    <p className="text-[11px] text-muted-foreground">Booking reference {p.booking_ref}.</p>
                  )}
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
                  {(p.live_status as LiveFlight | null) && (
                    <FlightLive
                      live={p.live_status as LiveFlight}
                      checkedAt={p.live_checked_at ?? null}
                      clock={clock}
                      homeZone={timezone}
                      reading={busy || readingPlanId === p.id}
                    />
                  )}
                  {groundBlock(p)}
                  {groundAhead(p)}
                  {liveLine(p) && <p className="text-[11.5px] text-foreground/85">{liveLine(p)}</p>}
                  {senseLines(p).map((line) => (
                    <p key={line} className="text-[11.5px] text-muted-foreground">
                      {line}
                    </p>
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
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
                      variant="outline"
                      className="h-9 text-[12px]"
                      disabled={busy}
                      onClick={() => void askLive(p)}
                    >
                      <RadioTower className="mr-1 h-3.5 w-3.5" aria-hidden />
                      Where is it now
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 text-[12px]" onClick={() => void drop(p)}>
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

      {watched.length > 0 && (
        <Card className="vanta-card space-y-2 p-3">
          <p className="vanta-machine-label text-foreground/70">Someone else's, watched</p>
          <ul className="space-y-2">
            {watched.map((p) => (
              <li key={p.id} className="space-y-1">
                <p className="text-[12.5px] text-foreground/85">
                  {planTitle(p)}
                  {p.traveller_name ? ` · ${p.traveller_name}` : ""}
                </p>
                {liveLine(p) && <p className="text-[11.5px] text-muted-foreground">{liveLine(p)}</p>}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11.5px]"
                  disabled={busy}
                  onClick={() => void askLive(p)}
                >
                  Where is it now
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground/80">
            These stay off your board. Echo watches them because you said to, and reads status only when you ask.
          </p>
        </Card>
      )}

      {settled.length > 0 && (
        <Card className="vanta-card space-y-1.5 p-3">
          <p className="vanta-machine-label text-foreground/70">Settled</p>
          <ul className="space-y-1.5">
            {settled.map((p) => (
              <li key={p.id} className="space-y-1">
                <p className="text-[12px] text-foreground/85">{planWords(p, clock)}</p>
                {p.status === "confirmed" && (
                  <>
                    {(p.live_status as LiveFlight | null) && (
                      <FlightLive
                        live={p.live_status as LiveFlight}
                        checkedAt={p.live_checked_at ?? null}
                        clock={clock}
                        homeZone={timezone}
                        reading={readingPlanId === p.id}
                      />
                    )}
                    {groundBlock(p)}
                    {groundAhead(p)}
                    {liveLine(p) && <p className="text-[11.5px] text-foreground/80">{liveLine(p)}</p>}
                    {senseLines(p).map((line) => (
                      <p key={line} className="text-[11.5px] text-muted-foreground">
                        {line}
                      </p>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-[11.5px]"
                      disabled={busy}
                      onClick={() => void askLive(p)}
                    >
                      Where is it now
                    </Button>
                  </>
                )}
                {p.status !== "dropped" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 text-[12px]"
                    disabled={busy}
                    onClick={() => setRemoving(p)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                    Remove this flight
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <AftermathHint text="A confirmed flight becomes departure and landing entries on your Board. Echo records and reads; buying stays yours." />

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this flight?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? planTitle(removing) : ""}
              {removing?.status === "confirmed"
                ? " — it comes off your record. The departure and landing entries it already wrote stay on your Board until you clear those. Nothing is cancelled with the airline."
                : " — it comes off your record. Nothing was booked, so nothing is cancelled with the airline."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const p = removing;
                setRemoving(null);
                if (!p) return;
                setBusy(true);
                try {
                  await drop(p);
                  vantaToast.success("Off your record. The receipt is in Receipts.");
                } catch (e) {
                  vantaToast.warning(e instanceof Error ? e.message : "That could not be removed.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
