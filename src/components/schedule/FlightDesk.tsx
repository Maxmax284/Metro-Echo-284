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
import { MapPin, Plane, PlusCircle, RadioTower, ScanLine, Trash2, WifiOff } from "lucide-react";
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
import { useNetworkReach, QUIET_SKY } from "@/hooks/useNetworkReach";
import { JourneySpine } from "./JourneySpine";
import { FlightEvidenceCard } from "./FlightEvidenceCard";
import { FlightLive } from "./FlightLive";
import { InAirPack } from "./InAirPack";

import { GroundLead } from "./GroundLead";
import { TravellerWord } from "./TravellerWord";
import type { LegStateKind } from "@/lib/journey";

import { PreDeparturePack } from "./PreDeparturePack";
import { preDeparturePack } from "@/lib/preDeparture";
import { groundPath, type GroundRead } from "@/lib/groundPath";
import { connectionAt, type ConnectionRead } from "@/lib/connectionRead";
import { journeyFit, routeOnRecord } from "@/lib/journeyFit";
import { JourneyFitCard } from "./JourneyFitCard";

import { airportStageLabel, readStage, writeStage, type GroundStage } from "@/lib/groundStage";
import { cabinLandingAt, readCabinEstimate, writeCabinEstimate } from "@/lib/cabinEstimate";
import { boardIdentity, carrierId, checkInCarrier, checkInWords, isCodeshare, mergeIdentity, type FlightIdentity } from "@/lib/flightIdentity";
import { terminalPath } from "@/lib/terminalPath";
import { TerminalMap } from "./TerminalMap";
import { FlightRouteMap } from "./FlightRouteMap";
import { GatePass } from "./GatePass";
import { gateMode } from "@/lib/gatePass";
import { AirportClock } from "./AirportClock";
import { ArrivalStamp } from "./ArrivalStamp";
import { SolariBoard } from "./SolariBoard";
import { FlightAlertsCard } from "./FlightAlertsCard";
import { TransferVerification } from "./TransferVerification";
import { EntryReadiness } from "./EntryReadiness";
import { MAX_WINDOW_DAYS } from "@/lib/entryReadiness";

import { OnwardIntent } from "./OnwardIntent";
import { TransferSteps } from "./TransferSteps";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { airportEndClock, flightClock } from "@/lib/flightClock";
import { vantaToast } from "@/lib/vantaVoice";
import {
  FLIGHT_LAW,
  canConfirm,
  optionWords,
  parseQuote,
  planTitle,
  planWords,
  planSourceWords,
  sortOptions,
  type FlightOption,
  type FlightPlan,
} from "@/lib/flightPlan";
import { OWNERSHIP_CHOICES, SOURCE_WORDS as NOTICE_SOURCE_WORDS, type NoticeSource } from "@/lib/flightRecognize";
import { QUICK_LAW } from "@/lib/flightQuick";
import type { SaidTimeKind } from "@/lib/flightSaidTime";

import { flightPhase, readingAge, statusWords, trackProgress, type LiveFlight } from "@/lib/flightStatus";
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
  /* With the doors shut there are no bars. The card says so once and stops
     asking the airline, rather than throwing connection errors. */
  const { online } = useNetworkReach();
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
    setRoute,
    setSaidTime,
    setLocalTransferVerification,

  } = useFlightPlans();
  /* Which flight is having its check-in area read, so only that card waits. */
  const [looking, setLooking] = useState<string | null>(null);
  /** Which flight's terminal walk is open, opened from the board row. */
  const [walk, setWalk] = useState<string | null>(null);
  /* 12-hour, with the day when it is not today. "Be there by 22:15" is a riddle. */
  const clock = useMemo(() => flightClock(timezone), [timezone]);
  /* Each end on its own airport clock: the departure where it leaves, the landing
     where it lands. */
  const endClock = useMemo(() => airportEndClock(timezone), [timezone]);

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
  /* Optional. A time you have in front of you, on your word — never required,
     and never invented when you leave it empty. */
  const [quickTime, setQuickTime] = useState("");
  const [quickKind, setQuickKind] = useState<SaidTimeKind>("departure");

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
  /* The landing time off the seat-back screen. Read in a cabin with no signal,
     so it stays on this device — and it wins the countdown while it is there. */
  const [cabinReads, setCabinReads] = useState<Record<string, string | null>>({});

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

  /** The whole manual path: a number and a day. A time only if you have one. */
  const quickAdd = async () => {
    setBusy(true);
    try {
      const res = await addByNumber(quickNo, quickDate);
      if (!res.ok) {
        vantaToast.warning(res.reason ?? "That flight could not be added.");
        return;
      }
      let said: string | null = null;
      if (quickTime.trim() && res.plan) {
        const timed = await setSaidTime(res.plan, quickTime, quickKind);
        if (!timed.ok) vantaToast.warning(timed.reason ?? "The flight is on your record; that time did not save.");
        else said = timed.words ?? null;
      }
      setQuickNo("");
      setQuickTime("");
      vantaToast.success(said ?? res.words ?? "On your record.");
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

  /**
   * What the terminal prints, and the ticket number said once. When the ticket
   * and the aircraft carry the same number there is no second name to mention.
   */
  const boardWords_ = (plan: FlightPlan): { board: string | null; ticket: string | null } => {
    const id = identityOf(plan);
    const board = boardIdentity(id);
    const name = board ? [board.carrier, board.flight_no].filter(Boolean).join(" ") : null;
    return { board: name, ticket: isCodeshare(id) ? (id?.marketing?.flight_no ?? null) : null };
  };

  const groundContext = (plan: FlightPlan): {
    read: GroundRead;
    stage: GroundStage;
    offerStage: boolean;
    pack: ReturnType<typeof preDeparturePack>;
    where: string;
  } => {
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
    /* One departure instant for the whole card. A ticket time with no zone is
       the wall clock at the origin airport, so it is anchored there before any
       arithmetic — otherwise the countdown reads the device's zone and the
       cutoffs under the board disagree with the board above them. */
    const fromIata = (plan.origin ?? "").trim().toUpperCase() || null;
    const departAt = anchorToZone(
      snap?.departure.estimated ?? snap?.departure.scheduled ?? option?.depart_at ?? null,
      airportZone(fromIata),
    );
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
    /* The one tap is only offered while it still changes the answer: on the
       ground, with no gate filed, and near enough to departure to matter. Once a
       gate is posted the board answers the question, so the tap disappears
       instead of cycling for nothing. */
    const gateFiled = !!(snap?.departure.gate ?? "").trim();
    const mins = Number.isFinite(depMs) ? Math.round((depMs - Date.now()) / 60_000) : null;
    const nearEnough = mins == null || (mins < 12 * 60 && mins > -180);
    const offerStage =
      !gateFiled && nearEnough && (where === "before" || where === "at_airport");
    /* The countdown errands sit under the move while they are still useful;
       once boarding takes over the card, the pack steps out of the way. */
    const pack = preDeparturePack({
      departAt,
      fromIata,
      toIata: (plan.destination ?? "").trim().toUpperCase() || null,
    });
    return { read, stage, offerStage, pack, where };
  };

  /** One flight, reduced to what the journey reasoning actually needs. */
  const fitPlan = (plan: FlightPlan) => {
    const option = plan.options.find((o) => o.id === plan.chosen_option_id) ?? plan.options[0] ?? null;
    return {
      id: plan.id,
      origin: plan.origin ?? null,
      destination: plan.destination ?? null,
      depart_on: plan.depart_on ?? null,
      depart_at: option?.depart_at ?? null,
      flight_no: option?.flight_no ?? null,
    };
  };

  /**
   * What this flight would mean for the trip already underway: the next leg out
   * of where you land, a stay, or its own trip. A proposal, never an edit.
   */
  const fitOf = (plan: FlightPlan) => journeyFit({ journey: journey.current, plan: fitPlan(plan) });

  const groundBlock = (plan: FlightPlan, lead = false, allowPhysicalStage = true) => {
    const { read, stage, offerStage, pack, where } = groundContext(plan);
    const originIata = (plan.origin ?? "").trim().toUpperCase() || null;
    const originPlace = originIata ? airportWords(originIata) : plan.origin;
    return (
      <div className="space-y-2">
        <GroundLead
          read={read}
          lead={lead}
          stage={offerStage && allowPhysicalStage ? stage : undefined}
          onStage={(s) => setStage(plan.id, s)}
          stageLabel={airportStageLabel(originPlace, originIata)}
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
        {/* Once you are on the aircraft the countdown errands stand down: bag
            drop, security and check-in cutoffs are behind you. */}
        {where === "boarding" || where === "in_air" || where === "done" || where === "stopped" ? null : (
          <PreDeparturePack pack={pack} lead={lead} />
        )}
      </div>
    );
  };

  const groundAhead = (plan: FlightPlan, inAir = false, connection: ConnectionRead | null = null) => {
    if (plan.live_status) return null;
    const from = (plan.origin ?? "").trim().toUpperCase();
    const to = (plan.destination ?? "").trim().toUpperCase();
    const at = anchorToZone(plan.options.find((o) => o.arrive_at)?.arrive_at ?? null, airportZone(to));
    /* The clock at the airport you leave from, live, so the board reads right
       standing at the gate — not only after the wheels are down. Once you are on
       the aircraft the same clock is the time where you left, not a gate. */
    const here = /^[A-Z]{3}$/.test(from) ? (
      <AirportClock
        iata={from}
        homeZone={timezone}
        label={inAir ? "Time where you left" : "Local time at the gate"}
      />
    ) : null;
    const there = /^[A-Z]{3}$/.test(to) && at ? (
      <ArrivalStamp iata={to} at={at} homeZone={timezone} arrived={false} connection={connection} />
    ) : null;
    if (!here && !there) return null;
    return (
      <div className="space-y-2.5">
        {here}
        {there}
      </div>
    );
  };


  /* Before the first provider reading, the board still exists — but every
     operational field says exactly what is not filed instead of disappearing. */
  const boardAhead = (
    plan: FlightPlan,
    read: GroundRead | null | undefined,
    inAir = false,
    onBoard = false,
  ) => {
    const identity = boardWords_(plan);
    const status = inAir
      ? "IN THE AIR"
      : onBoard
        ? "ON BOARD"
        : read?.step === "find_check_in"
          ? "CHECK-IN"
          : read?.step === "boarding"
            ? "BOARDING TIME NOT FILED"
            : "GATE PENDING";
    return (
      <div className="space-y-2 border-t border-border/50 pt-3">
        <p className="vanta-machine-label text-foreground/70">{inAir ? "Arrivals board" : "Airport board"}</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
          <SolariBoard text={identity.board ?? "NOT FILED"} label="Flight" />
          <SolariBoard text="NOT FILED" label="Terminal" />
          <SolariBoard text="NOT FILED" label="Gate" />
          <SolariBoard text={status} label="Status" tone={status.includes("NOT FILED") ? "warn" : "primary"} />
        </div>
        {identity.ticket && <p className="text-[10.5px] text-muted-foreground/80">Your ticket says {identity.ticket}.</p>}
        {inAir && (
          <p className="text-[10.5px] text-muted-foreground/80">
            On your word that you are on it. The airline has filed no arrival terminal or gate yet.
          </p>
        )}
        {onBoard && !inAir && (
          <p className="text-[10.5px] text-muted-foreground/80">
            On your word that you are on board. The airline has filed no push-back, so the departure time
            here is still the filed one.
          </p>
        )}
        {/* On board, the walk is behind you. Offering it again is clutter. */}
        {onBoard && !inAir ? null : terminalWalk(plan, read, inAir)}
      </div>
    );
  };

  /**
   * The walk through the terminal, opened from the board row. Order of stops and
   * what is filed at each one — never a floor plan Echo does not have.
   */
  const terminalWalk = (
    plan: FlightPlan,
    read: GroundRead | null | undefined,
    inAir = false,
    arrivalIntent: "connection" | "destination" | "unknown" = "destination",
  ) => {
    const snap = plan.live_status as LiveFlight | null;
    const phase = snap ? flightPhase(snap) : "waiting";
    const arrivalSide = inAir || phase === "flying" || phase === "landed";
    const identity = identityOf(plan);
    const stops = terminalPath({
      step: read?.step ?? null,
      carrier: checkInCarrier(identity),
      zone: checkInWords(identity),
      terminal: arrivalSide ? (snap?.arrival.terminal ?? null) : (snap?.departure.terminal ?? null),
      gate: arrivalSide ? (snap?.arrival.gate ?? null) : (snap?.departure.gate ?? null),
      place: airportWords(((arrivalSide ? plan.destination : plan.origin) ?? "").trim().toUpperCase()) ||
        (arrivalSide ? plan.destination : plan.origin),
      arrivalSide,
      arrivalIntent,
    });
    const open = walk === plan.id;
    return (
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11.5px]"
          onClick={() => setWalk(open ? null : plan.id)}
          aria-expanded={open}
        >
          <MapPin className="mr-1 h-3.5 w-3.5" aria-hidden />
          {open
            ? "Hide the terminal path"
            : arrivalSide
              ? arrivalIntent === "connection"
                ? "See the transfer path"
                : arrivalIntent === "unknown"
                  ? "Choose arrivals or transfer"
                  : "See the arrival path"
              : "Walk through the terminal"}
        </Button>
        {open && <TerminalMap stops={stops} />}
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

  const confirmedRoutePlans = useMemo(
    () => new Set(plans.filter((plan) => plan.status === "confirmed").map((plan) => plan.id)),
    [plans],
  );

  const liveLine = (plan: FlightPlan): string | null => {
    if (live[plan.id]) return live[plan.id];
    const snapshot = plan.live_status as LiveFlight | null;
    if (!snapshot || !plan.live_checked_at) return null;
    return `${statusWords(snapshot, endClock)} ${readingAge(plan.live_checked_at)}.`;
  };

  /* The flight the journey says you are on right now. Its move leads the screen. */
  const liveLeg = journey.current?.legs[journey.where?.legIndex ?? 0] ?? null;
  const livePlan = liveLeg ? (plans.find((p) => p.id === liveLeg.plan_id) ?? null) : null;
  const liveSnapshot = livePlan?.live_status as LiveFlight | null | undefined;
  const activeGround = livePlan ? groundContext(livePlan) : null;
  /* When this leg lands somewhere you are only changing planes, the arrival end
     of the card answers the transfer, not the city. */
  const onward = useMemo(
    () => connectionAt(journey.current?.legs ?? [], journey.where?.legIndex ?? 0),
    [journey.current, journey.where],
  );
  const possibleOnward = open.some((plan) => {
    const fit = fitOf(plan);
    return fit?.kind === "needs_time" || fit?.kind === "chains";
  });
  const candidateOnward = open.find((plan) => {
    const fit = fitOf(plan);
    return fit?.kind === "needs_time" || fit?.kind === "chains";
  }) ?? null;
  const confirmedOnwardPlan = onward
    ? plans.find((plan) => plan.id === journey.current?.legs[(journey.where?.legIndex ?? 0) + 1]?.plan_id) ?? null
    : null;
  const transferPlan = confirmedOnwardPlan ?? candidateOnward;
  const transferConfirmed = !!confirmedOnwardPlan;
  const transferSnapshot = transferPlan?.live_status as LiveFlight | null | undefined;
  /* The airport you are standing in, only once this leg has actually landed.
     The provider's word or your own both count — a leg with no filed data at
     all (your ticket-stamp flight) still lands when you say so. */
  const landedHere =
    !!livePlan &&
    (!!liveSnapshot && flightPhase(liveSnapshot) === "landed" ||
      livePlan.leg_state === "landed");
  const landedAt = landedHere && livePlan
    ? (livePlan.destination ?? liveSnapshot?.arrival.iata ?? "").trim().toUpperCase() || null
    : null;
  const remainingSettled = settled.filter((p) => p.id !== livePlan?.id);
  const settledGroups = useMemo(() => {
    const groups = new Map<string, { plan: FlightPlan; count: number }>();
    for (const plan of remainingSettled) {
      const key = `${plan.status}|${plan.ownership ?? ""}|${planWords(plan, clock)}`;
      const group = groups.get(key);
      if (group) group.count += 1;
      else groups.set(key, { plan, count: 1 });
    }
    return [...groups.values()];
  }, [remainingSettled, clock]);
  /* The filed landing, anchored at the arrival airport — both the fallback for
     the countdown and the day the cabin screen's clock is pinned to. */
  const liveFiledArrival = livePlan
    ? anchorToZone(
        livePlan.options.find((o) => o.arrive_at)?.arrive_at ?? null,
        airportZone((livePlan.destination ?? "").trim().toUpperCase() || null),
      )
    : null;
  /* The filed departure, anchored at the airport it leaves from. Gate mode and
     the boarding window are both read against it — never against the device. */
  const liveFiledDeparture = livePlan
    ? anchorToZone(
        livePlan.options.find((o) => o.depart_at)?.depart_at ?? null,
        airportZone((livePlan.origin ?? "").trim().toUpperCase() || null),
      )
    : null;
  const liveOriginIata = (livePlan?.origin ?? "").trim().toUpperCase() || null;
  /* Gate mode: the flight you are about to board leaves today and has not gone.
     While that holds, boarding time, gate, seat and zone lead and the rest of
     the card stows. Once the leg you were on is down, the flight that matters is
     the onward one — that is the card a person in a terminal is reading. */
  const gateRead = useMemo(() => {
    const nowIso = new Date().toISOString();
    const forPlan = (plan: FlightPlan | null, landed: boolean, inAir: boolean) => {
      if (!plan) return null;
      const originIata = (plan.origin ?? "").trim().toUpperCase() || null;
      const destIata = (plan.destination ?? "").trim().toUpperCase() || null;
      const departAt = anchorToZone(
        plan.options.find((o) => o.depart_at)?.depart_at ?? null,
        airportZone(originIata),
      );
      if (!gateMode({ departAt, nowIso, landed, inAir })) return null;
      const arriveAt = anchorToZone(
        plan.options.find((o) => o.arrive_at)?.arrive_at ?? null,
        airportZone(destIata),
      );
      return { plan, originIata, destIata, departAt, arriveAt };
    };
    const legWord = (plan: FlightPlan | null) =>
      forPlan(plan, plan?.leg_state === "landed", plan?.leg_state === "boarded");
    /* Any other flight of yours leaving today and still to go — the one you are
       standing in a terminal for once the leg behind you is down. */
    const other = plans
      .filter((p) => p.status === "confirmed" && p.id !== livePlan?.id && p.id !== confirmedOnwardPlan?.id)
      .map(legWord)
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => Date.parse(a.departAt ?? "") - Date.parse(b.departAt ?? ""));
    return (
      forPlan(livePlan, landedHere, activeGround?.where === "in_air") ??
      legWord(confirmedOnwardPlan) ??
      other[0] ??
      null
    );
  }, [plans, livePlan, landedHere, activeGround, confirmedOnwardPlan]);
  const gateNow = !!gateRead;
  /* A flight that has not left yet and lands within the filing window of an
     arrival card. The window is the point: a card you can only file three days
     out is no use the moment you are standing at the desk. Times are anchored
     at the departure airport, never read in the device's zone. */
  const entryAhead = useMemo(() => {
    if (landedHere) return null;
    const now = Date.now();
    const horizon = now + MAX_WINDOW_DAYS * 86_400_000;
    const rows = plans
      .filter((plan) => plan.status === "confirmed" || plan.status === "prepared")
      .map((plan) => {
        const at = anchorToZone(
          plan.options.find((o) => o.depart_at)?.depart_at ?? null,
          airportZone((plan.origin ?? "").trim().toUpperCase() || null),
        );
        const arriveAt = anchorToZone(
          plan.options.find((o) => o.arrive_at)?.arrive_at ?? null,
          airportZone((plan.destination ?? "").trim().toUpperCase() || null),
        );
        return { plan, arriveAt, ms: at ? Date.parse(at) : Number.NaN };
      })
      .filter((row) => Number.isFinite(row.ms) && row.ms >= now && row.ms <= horizon)
      .sort((a, b) => a.ms - b.ms);
    return rows[0] ?? null;
  }, [plans, landedHere]);

  const cabinLanding = livePlan ? (cabinReads[livePlan.id] ?? readCabinEstimate(livePlan.id)?.at ?? null) : null;
  const takeCabinRead = (planId: string, destination: string | null, hhmm: string | null) => {
    if (!hhmm) {
      writeCabinEstimate(planId, null);
      setCabinReads((prev) => ({ ...prev, [planId]: null }));
      return;
    }
    const at = cabinLandingAt(hhmm, liveFiledArrival, anchorToZone, airportZone((destination ?? "").trim().toUpperCase() || null));
    if (!at) return;
    writeCabinEstimate(planId, at);
    setCabinReads((prev) => ({ ...prev, [planId]: at }));
  };


  if (loading) return <LoadingState label="Reading your prepared flights…" />;

  return (
    <div className="space-y-3">
      {error && <ErrorState detail={error} onRetry={() => void refresh()} />}

      {/* Settings are not the next move. While a trip is live they sit under it. */}
      {livePlan ? null : <FlightAlertsCard />}

      {/* The trip you are actually on comes before anything you might add — and
          the move comes before the trip. A person reading this is walking. */}
      {journey.current ? (
        <>
        {livePlan ? (
          <Card className="vanta-card space-y-3 p-3">
            {/* Gate mode leads on a departure day: the boarding time, the gate,
                the seat and the zone, before anything else on the card. */}
            {gateRead ? (
              <GatePass
                plan={gateRead.plan}
                flightLabel={
                  boardWords_(gateRead.plan).board ??
                  `${gateRead.originIata ?? gateRead.plan.origin} → ${gateRead.destIata ?? gateRead.plan.destination}`
                }
                providerGate={
                  (gateRead.plan.live_status as LiveFlight | null)?.departure.gate ?? null
                }
                departAt={gateRead.departAt}
                departLocal={gateRead.departAt ? endClock(gateRead.departAt, gateRead.originIata) : null}
                arriveLocal={gateRead.arriveAt ? endClock(gateRead.arriveAt, gateRead.destIata) : null}
                fmt={(iso) => endClock(iso, gateRead.originIata)}
                online={online}
                onSave={async (facts) => {
                  await setLocalTransferVerification(gateRead.plan, facts);
                }}
              />
            ) : null}
            {groundBlock(livePlan)}
            {liveSnapshot ? (
              <FlightLive
                live={liveSnapshot}
                checkedAt={livePlan.live_checked_at ?? null}
                clock={endClock}
                homeZone={timezone}
                reading={readingPlanId === livePlan.id}
                board={boardWords_(livePlan).board}
                ticket={boardWords_(livePlan).ticket}
                groundStep={activeGround?.read.step}
                 belowBoard={terminalWalk(
                   livePlan,
                   activeGround?.read,
                   activeGround?.where === "in_air",
                   onward ? "connection" : possibleOnward ? "unknown" : "destination",
                 )}
                connection={onward}
                 uncertainTransfer={!onward && possibleOnward}
                compact={gateNow}
                embedded
              />
            ) : (
              <>
                {boardAhead(
                  livePlan,
                  activeGround?.read,
                  activeGround?.where === "in_air",
                  activeGround?.where === "boarding",
                )}
                {groundAhead(livePlan, activeGround?.where === "in_air", onward)}

                {/* On the aircraft with no feed from it: the track, the miles
                    left, the clock where you land, and what the cabin usually
                    carries — all off the device, so it holds with no signal. */}
                {activeGround?.where === "in_air" && (
                  <InAirPack
                    fromIata={(livePlan.origin ?? "").trim().toUpperCase() || null}
                    toIata={(livePlan.destination ?? "").trim().toUpperCase() || null}
                    departAt={anchorToZone(
                      livePlan.options.find((o) => o.depart_at)?.depart_at ?? null,
                      airportZone((livePlan.origin ?? "").trim().toUpperCase() || null),
                    )}
                    arriveAt={liveFiledArrival}
                    clock={clock}
                    homeZone={timezone}
                    cabinAt={cabinLanding}
                    onCabinRead={(hhmm) => takeCabinRead(livePlan.id, livePlan.destination, hhmm)}
                  />
                )}
              </>
            )}


            {/* No bars is the normal case with the doors shut. Said once, plainly,
                instead of a stale-feed warning or a retry nobody asked for. */}
            {!online && (
              <p className="flex items-start gap-1.5 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] leading-snug text-muted-foreground">
                <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {QUIET_SKY}
              </p>
            )}

            {landedHere && transferPlan ? (
              <TransferVerification
                airport={landedAt ?? "the connection airport"}
                onward={transferPlan}
                confirmed={transferConfirmed}
                online={online}
                providerGate={transferSnapshot?.departure.gate ?? null}
                providerCheckedAt={transferPlan.live_checked_at ?? null}
                onConfirm={async (facts) => {
                  try {
                    await setLocalTransferVerification(transferPlan, facts);
                    vantaToast.success("Local transfer details recorded with a receipt.");
                  } catch (e) {
                    vantaToast.warning(e instanceof Error ? e.message : "Those local details did not save.");
                    throw e;
                  }
                }}
              />
            ) : null}

            {/* What the border expects. Asked while the flight is still ahead —
                an arrival card you file days early is no use in the hall — and
                again once it has landed. Never assumes immigration is cleared,
                bags are collected, or the next leg is booked. */}
            {landedHere && livePlan ? (
              <EntryReadiness
                planId={livePlan.id}
                fromIata={liveLeg?.from.iata ?? livePlan.origin}
                toIata={liveLeg?.to.iata ?? livePlan.destination}
                when="after"
              />
            ) : entryAhead ? (
              <EntryReadiness
                planId={entryAhead.plan.id}
                fromIata={entryAhead.plan.origin}
                toIata={entryAhead.plan.destination}
                arriveAt={entryAhead.arriveAt}
                when="before"
              />

            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border/50 pt-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-[12px]"
                disabled={busy || !online}
                onClick={() => void askLive(livePlan)}
              >
                <RadioTower className="mr-1 h-3.5 w-3.5" aria-hidden />
                {online ? "Check live status" : "No signal to check"}
              </Button>
              {/* The one place your word beats the feed: on it, still at the
                  airport, down, or did not happen. It records, it never books. */}
              <TravellerWord
                yourWord={livePlan.leg_state_source === "you" ? ((livePlan.leg_state as LegStateKind | null) ?? null) : null}
                onSay={(state) => journey.setLegState(livePlan.id, state)}
                onClear={() => journey.clearLegState(livePlan.id)}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-9 text-[12px]"
                disabled={busy}
                onClick={() => setRemoving(livePlan)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                Remove flight
              </Button>
            </div>

          </Card>
        ) : null}
        {/* The whole journey stands open. Folding the legs, the times and what
            changed behind a tap hid the one thing a traveller reads twice. */}
        <div className="space-y-3">
          <p className="px-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            Full journey — legs, times and what changed
          </p>
          <JourneySpine
            journey={journey.current}
            where={journey.where}
            news={journey.news}
            savedAt={journey.savedAt}
            onDismissNews={journey.dismissNews}
            landingAt={cabinLanding}
            onSay={(planId, state) => journey.setLegState(planId, state)}
            onClear={(planId) => journey.clearLegState(planId)}
          />
          {/* The same trip as a route you can tap, stop by stop. On a boarding
              day it waits behind one tap; the picture and every view are kept. */}
          {gateNow ? (
            <details className="rounded-md border border-border/60 bg-muted/15 p-2.5">
              <summary className="cursor-pointer list-none text-[11.5px] text-foreground/85">
                Route &amp; arrival details
              </summary>
              <div className="mt-2">
                <FlightRouteMap
                  journey={journey.current}
                  homeZone={timezone}
                  aircraft={aircraft}
                  activeLegIndex={journey.where?.legIndex ?? null}
                  confirmedPlanIds={confirmedRoutePlans}
                  positionSource={liveSnapshot ? trackProgress(liveSnapshot).source : "none"}
                  quietStops
                />
              </div>
            </details>
          ) : (
            <FlightRouteMap
              journey={journey.current}
              homeZone={timezone}
              aircraft={aircraft}
              activeLegIndex={journey.where?.legIndex ?? null}
              confirmedPlanIds={confirmedRoutePlans}
              positionSource={liveSnapshot ? trackProgress(liveSnapshot).source : "none"}
            />
          )}
        </div>
        {/* The international trip being over is not the whole journey being
            over — name the next hop, and no flight is invented for it. */}
        {journey.where?.kind === "done" ? (
          <OnwardIntent
            landedIata={
              journey.current?.legs[journey.current.legs.length - 1]?.to.iata ?? null
            }
            onAddFlight={() => document.getElementById("fd-quick-no")?.focus()}
          />
        ) : null}
        </>
      ) : null}

      {livePlan ? <FlightAlertsCard /> : null}

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
          {/* Optional, and it says so. A ticket in your hand often carries a time
              the provider does not, so there is somewhere to put it. */}
          <div className="min-w-[6rem] flex-1 space-y-1">
            <Label htmlFor="fd-quick-time" className="text-[11px]">
              Time (optional)
            </Label>
            <Input
              id="fd-quick-time"
              value={quickTime}
              onChange={(e) => setQuickTime(e.target.value)}
              placeholder="07:15"
              inputMode="numeric"
              className="h-11 text-[13px]"
              onKeyDown={(e) => {
                if (e.key === "Enter") void quickAdd();
              }}
            />
          </div>
          <Button onClick={() => void quickAdd()} disabled={busy} className="h-11 min-w-[5rem] text-[13px]">
            <PlusCircle className="mr-1 h-4 w-4" aria-hidden />
            Add
          </Button>
        </div>
        {quickTime.trim() ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="What kind of time this is">
            {(["departure", "boarding"] as SaidTimeKind[]).map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={quickKind === k ? "default" : "outline"}
                className="h-9 text-[12px]"
                aria-pressed={quickKind === k}
                onClick={() => setQuickKind(k)}
              >
                {k === "departure" ? "Departure time" : "Boarding time"}
              </Button>
            ))}
          </div>
        ) : null}

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
                    {p.origin_kind === "recognised" ? noticedWords(p) : planSourceWords(p)}
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
                      clock={endClock}
                      homeZone={timezone}
                      reading={busy || readingPlanId === p.id}
                      board={boardWords_(p).board}
                      ticket={boardWords_(p).ticket}
                    />
                  )}
                  {/* With no route on record, the ground read has no airport to
                      talk about — so it stands down rather than naming a place
                      that is not there, and the fit card asks the one question. */}
                  {routeOnRecord(fitPlan(p)) ? (
                    <p className="text-[11px] text-muted-foreground">
                      This is still a proposal. Saying it is yours or adding it to your journey does not say you have arrived at {airportWords((p.origin ?? "").trim().toUpperCase()) || p.origin}.
                    </p>
                  ) : null}
                  {fitOf(p) && (
                    <JourneyFitCard
                      fit={fitOf(p) as NonNullable<ReturnType<typeof fitOf>>}
                      busy={busy}
                      source={p.origin_kind === "recognised" ? noticedWords(p) : planSourceWords(p)}
                      steps={
                        landedAt && p.id === transferPlan?.id ? (
                          <TransferSteps
                            airport={landedAt}
                            onward={p}
                            confirmed={transferConfirmed}
                            providerGate={(p.live_status as LiveFlight | null)?.departure.gate ?? null}
                          />
                        ) : undefined
                      }
                      onSetRoute={async (from, to) => {
                        setBusy(true);
                        try {
                          const res = await setRoute(p, from, to);
                          if (!res.ok) vantaToast.warning(res.reason ?? "That route did not save.");
                          else vantaToast.success(`${from} → ${to}, on your word.`);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      onSetTime={async (time, kind) => {
                        setBusy(true);
                        try {
                          const res = await setSaidTime(p, time, kind);
                          if (!res.ok) vantaToast.warning(res.reason ?? "That time did not save.");
                          else vantaToast.success(res.words ?? "On your word, with a receipt.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />

                  )}
                  {liveLine(p) && <p className="text-[11.5px] text-foreground/85">{liveLine(p)}</p>}
                  {senseLines(p).map((line) => (
                    <p key={line} className="text-[11.5px] text-muted-foreground">
                      {line}
                    </p>
                  ))}
                  {(() => {
                    const fit = fitOf(p);
                    const onwardQuestion = fit?.kind === "needs_time" || fit?.kind === "chains";
                    return onwardQuestion ? (
                      <p className="text-[12.5px] font-medium text-foreground">
                        Is {fit.flight_no ?? "this"} your next flight after {fit.suggest?.place ?? "this trip"}?
                      </p>
                    ) : null;
                  })()}
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
                      {fitOf(p)?.kind === "chains"
                        ? "Yes, add it to my journey"
                        : fitOf(p)?.kind === "needs_time"
                          ? "Departure time needed before adding"
                          : "Add this flight to my board"}
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
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 text-[12px]"
                      onClick={() => {
                        const fit = fitOf(p);
                        if (fit?.kind === "needs_time" || fit?.kind === "chains") void answerOwnership(p, "not_mine");
                        else void drop(p);
                      }}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
                      {fitOf(p)?.kind === "needs_time" || fitOf(p)?.kind === "chains" ? "No, not mine" : "Drop draft"}
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

      {remainingSettled.length > 0 && (
        <details className="vanta-card group p-3">
          <summary className="vanta-focus cursor-pointer list-none text-[12px] text-foreground/80">
            <span className="vanta-machine-label text-foreground/70">Flight history</span>
            <span className="ml-2 text-muted-foreground">{remainingSettled.length} settled</span>
          </summary>
          <ul className="mt-3 space-y-2 border-t border-border/50 pt-3">
            {settledGroups.map(({ plan: p, count }) => (
              <li key={p.id} className="space-y-1">
                <p className="text-[12px] text-foreground/85">
                  {planWords(p, clock)}{count > 1 ? ` · ${count} identical records shown together` : ""}
                </p>
                {p.status === "confirmed" && (
                  <>
                    {(p.live_status as LiveFlight | null) && (
                      <FlightLive
                        live={p.live_status as LiveFlight}
                        checkedAt={p.live_checked_at ?? null}
                        clock={endClock}
                        homeZone={timezone}
                        reading={readingPlanId === p.id}
                        board={boardWords_(p).board}
                        ticket={boardWords_(p).ticket}
                        groundStep={groundContext(p).read.step}
                      />
                    )}
                    {groundBlock(p, false, !livePlan)}
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
        </details>
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
