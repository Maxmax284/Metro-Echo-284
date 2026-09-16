// flightRead — what is prepared, and what was confirmed.
//
// Doctrine:
//   - Reads the person's own prepared flights. It cannot prepare, confirm, drop
//     or buy anything: confirming happens by a tap on the Board.
//   - Every plan carries where its prices came from, so a chat answer never
//     implies a live fare.
type SupabaseClient = { from: (table: string) => any };
import { planWords, type FlightPlan } from "./flightPlan.ts";

function scoped(q: any, userId: string, orgId: string | null) {
  const u = q.eq("user_id", userId);
  return orgId ? u.eq("organization_id", orgId) : u.is("organization_id", null);
}

export async function flightRead(
  sb: SupabaseClient,
  scope: { userId: string; orgId: string | null },
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
