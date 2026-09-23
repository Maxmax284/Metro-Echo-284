// flightRead — what is prepared, and what was confirmed.
//
// Doctrine:
//   - Reads the person's own prepared flights. It cannot prepare, confirm, drop
//     or buy anything: confirming happens by a tap on the Board.
//   - Every plan carries where its prices came from, so a chat answer never
//     implies a live fare.
type SupabaseClient = { from: (table: string) => any };
import { planWords, type FlightPlan } from "./flightPlan.ts";
import { anchorLive } from "./flightStatus.ts";
import { TERMINAL_CAVEAT, bigNumbers, journeysFrom, whereOnJourney } from "./journey.ts";
import { countryNotes } from "./countryNotes.ts";
import { airport, airportMismatchWords, airportWords } from "./airports.ts";
import { groundPath, groundWords } from "./groundPath.ts";
import { carrierId, mergeIdentity, operatorWords, type FlightIdentity } from "./flightIdentity.ts";
import { gateBoardWords } from "./gateBoard.ts";

function scoped(q: any, userId: string, orgId: string | null) {
  const u = q.eq("user_id", userId);
  return orgId ? u.eq("organization_id", orgId) : u.is("organization_id", null);
}

export async function flightRead(
  sb: SupabaseClient,
  scope: { userId: string; orgId: string | null },
  /** The person's own words, when they named an airport. Used only to ask, never to decide. */
  said: string | null = null,
): Promise<string> {
  const { data } = await scoped(
    sb.from("flight_plans").select("*").order("depart_on", { ascending: true }).limit(20),
    scope.userId,
    scope.orgId,
  );
  const rows = ((data ?? []) as any[]).map(
    (r) =>
      ({
        ...r,
        options: Array.isArray(r.options) ? r.options : [],
        event_ids: Array.isArray(r.event_ids) ? r.event_ids : [],
      }) as FlightPlan,
  );
  if (!rows.length) {
    return "No flight is prepared. Schedule → Flights takes a route, the dates and the flight lines you paste, and holds it as a draft until you confirm it on the Board. If a booking turns up in something Echo already reads, it files it there too and asks whose it is. Echo never buys a ticket.";
  }
  const asked = rows.filter((r) => r.status === "prepared" && r.ownership === "unknown");
  const waiting = rows.filter((r) => r.status === "prepared" && r.ownership !== "unknown" && r.ownership !== "theirs");
  const watched = rows.filter((r) => r.ownership === "theirs" && r.status !== "dropped");
  const done = rows.filter((r) => r.status === "confirmed" && r.ownership !== "theirs");
  const lines: string[] = [];

  /* If the legs chain into a trip, that is the answer, and it goes first. Where
     you are is derived from what the airline filed, and the line says so. */
  const journey = journeysFrom(rows)[0] ?? null;
  if (journey) {
    const where = whereOnJourney(journey);
    const numbers = bigNumbers(journey);
    /* "Where do I physically go next" is the only question that matters in a
       departures hall, so it is answered first, with the airline that actually
       flies the aircraft — that is what the boards and the counters say. */
    const leg = journey.legs[where.legIndex] ?? journey.legs[0] ?? null;
    const plan = leg ? (rows.find((r) => r.id === leg.plan_id) ?? null) : null;
    const option = plan ? (plan.options.find((o) => o.id === plan.chosen_option_id) ?? plan.options[0] ?? null) : null;
    const identity = option
      ? mergeIdentity((option.identity ?? null) as FlightIdentity | null, {
          marketing:
            (option.identity as FlightIdentity | null)?.marketing ??
            carrierId({ carrier: option.airline, flight_no: option.flight_no }),
        })
      : null;
    /* Pinned first: an unpinned wall clock here would put "leave for the airport"
       hours off for anyone whose phone is not in the departure city. */
    const snap = anchorLive((plan?.live_status ?? null) as never) as
      | {
          status?: string | null;
          departure?: {
            iata?: string | null;
            terminal?: string | null;
            gate?: string | null;
            scheduled?: string | null;
            estimated?: string | null;
            actual?: string | null;
            delay_min?: number | null;
          };
          arrival?: {
            iata?: string | null;
            terminal?: string | null;
            gate?: string | null;
            scheduled?: string | null;
            estimated?: string | null;
            actual?: string | null;
            delay_min?: number | null;
          };
        }
      | null;

    const depIso = snap?.departure?.estimated ?? snap?.departure?.scheduled ?? option?.depart_at ?? null;
    const depMs = depIso ? Date.parse(depIso) : NaN;
    /* The person's own words are the only thing that can say they are already
       inside the airport or past security. Echo takes their word and nothing else. */
    const saidLower = (said ?? "").toLowerCase();
    const atAirport = /\b(terminal|airport|departures|check[- ]?in|counter|kerb|curb|dropped off|just landed|just got (?:here|in))\b/.test(saidLower);
    const pastSecurity = /\b(through security|past security|cleared security|airside|at the gate|gate area|duty[- ]free)\b/.test(saidLower);
    const phase =
      (atAirport || pastSecurity) && (where.kind === "before" || where.kind === "at_airport") ? "at_airport" : where.kind;
    const inAir = phase === "in_air";
    const ground = groundPath({
      where: phase,
      identity,
      fromPlace: leg?.from.iata ? airportWords(leg.from.iata) : null,
      toPlace: leg?.to.iata ? airportWords(leg.to.iata) : null,
      terminal: (inAir ? snap?.arrival?.terminal : snap?.departure?.terminal) ?? null,
      gate: (inAir ? snap?.arrival?.gate : snap?.departure?.gate) ?? null,
      minsToDeparture: Number.isFinite(depMs) ? Math.round((depMs - Date.now()) / 60_000) : null,
      throughSecurity: pastSecurity,
    });
    lines.push(groundWords(ground));
    /* The board itself: terminal, gate, how late, when it lands. Same facts the
       layover card shows, said out loud, and only where they exist. */
    const board = gateBoardWords(
      {
        flightNo: option?.flight_no ?? null,
        status: snap?.status ?? null,
        departure: {
          iata: snap?.departure?.iata ?? leg?.from.iata ?? null,
          terminal: snap?.departure?.terminal ?? leg?.from.terminal ?? null,
          gate: snap?.departure?.gate ?? null,
          at: snap?.departure?.estimated ?? snap?.departure?.actual ?? snap?.departure?.scheduled ?? option?.depart_at ?? null,
          delayMin: snap?.departure?.delay_min ?? null,
        },
        arrival: {
          iata: snap?.arrival?.iata ?? leg?.to.iata ?? null,
          terminal: snap?.arrival?.terminal ?? leg?.to.terminal ?? null,
          gate: snap?.arrival?.gate ?? null,
          at: snap?.arrival?.actual ?? snap?.arrival?.estimated ?? snap?.arrival?.scheduled ?? option?.arrive_at ?? null,
          delayMin: snap?.arrival?.delay_min ?? null,
          landed: Boolean(snap?.arrival?.actual),
        },
        layover: where.layover
          ? {
              iata: where.layover.iata,
              arriveTerminal: where.layover.arriveTerminal,
              departTerminal: where.layover.departTerminal,
              terminalChange: where.layover.terminalChange,
            }
          : null,
      },
      new Date(),
    );
    for (const line of board) lines.push(line);
    const op = operatorWords(identity);
    if (op) lines.push(op);
    /* Landed, the useful facts change: money and the number to call. Kept notes
       only, with the day they were checked. */
    if (phase === "done" || phase === "on_ground") {
      const arriveNotes = countryNotes(airport(leg?.to.iata ?? null)?.cc ?? null);
      if (arriveNotes) {
        lines.push(`${arriveNotes.country} spends ${arriveNotes.currency}. Emergency: ${arriveNotes.emergency}.`);
      }
    }
    lines.push("");
    /* The itinerary follows the move. It is context, not the answer. */
    lines.push(`Your journey: ${journey.title}.`);
    lines.push(where.words);
    if (numbers.timeLeft) lines.push(`${numbers.timeLeft} ${numbers.timeLeftLabel}. ${numbers.gate ? `Next gate ${numbers.gate}.` : "No gate filed yet."}`);
    if (where.layover) {
      lines.push(where.layover.words);
      if (where.layover.terminalChange === "yes") {
        lines.push(`That is a terminal change, ${where.layover.arriveTerminal} to ${where.layover.departTerminal}.`);
      }
      const notes = countryNotes(airport(where.layover.iata)?.cc ?? null);
      if (where.layover.canLeaveAirport && notes) {
        lines.push(`There is room to leave the airport. Kept notes for ${notes.country}: ${notes.transport[0]?.line ?? ""} (checked ${notes.transport[0]?.checked_on ?? "an unrecorded date"}).`);
      }
    }
    if (ground.needsCheckIn) {
      lines.push(
        "The check-in zone is not on record. Schedule → Flights has a look-it-up tap that reads one official airline page for it; Echo will not name a zone without one.",
      );
    }
    /* A named airport that is not this journey's is a question, not a correction.
       Dallas and Dulles are one slurred syllable apart and four hundred miles. */
    const clash = airportMismatchWords(said, leg?.from.iata ?? null);
    if (clash) {
      lines.push(clash);
    } else if (leg?.from.iata) {
      lines.push(
        `This journey leaves from ${airportWords(leg.from.iata)}. If you are standing somewhere else, say which airport — Echo will not guess which one you mean.`,
      );
    }
    lines.push(TERMINAL_CAVEAT);
    lines.push("");
  }

  if (asked.length) {
    lines.push(
      `${asked.length} ${asked.length === 1 ? "flight was" : "flights were"} noticed and Echo does not know whose ${asked.length === 1 ? "it is" : "they are"}:`,
    );
    for (const p of asked) {
      const who = p.traveller_name ? ` in the name of ${p.traveller_name}` : "";
      const from = p.noticed_from?.sender?.name ?? p.noticed_from?.sender?.email ?? null;
      lines.push(`• ${planWords(p)}${who}${from ? `, sent by ${from}` : ""}`);
    }
    lines.push("Schedule → Flights is where you say mine, mine too, theirs, or not mine. It asks once.");
  }
  if (waiting.length) {
    lines.push(`${waiting.length} ${waiting.length === 1 ? "flight is" : "flights are"} waiting on your yes:`);
    for (const p of waiting) lines.push(`• ${planWords(p)}`);
  }
  if (done.length) {
    lines.push(`Confirmed and on the board:`);
    for (const p of done) lines.push(`• ${planWords(p)}`);
  }
  if (watched.length) {
    lines.push(`Someone else's, watched and kept off your board:`);
    for (const p of watched) {
      lines.push(`• ${planWords(p)}${p.traveller_name ? ` · ${p.traveller_name}` : ""}`);
    }
  }
  lines.push("Confirming happens on the Board, by your tap. Echo records the flight; it never buys it.");
  return lines.join("\n");
}
