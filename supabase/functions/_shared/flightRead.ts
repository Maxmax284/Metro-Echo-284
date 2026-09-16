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
    return "No flight is prepared. Schedule → Flights takes a route, the dates and the flight lines you paste, and holds it as a draft until you confirm it on the Board. Echo never buys a ticket.";
  }
  const waiting = rows.filter((r) => r.status === "prepared");
  const done = rows.filter((r) => r.status === "confirmed");
  const lines: string[] = [];
  if (waiting.length) {
    lines.push(`${waiting.length} ${waiting.length === 1 ? "flight is" : "flights are"} waiting on your yes:`);
    for (const p of waiting) lines.push(`• ${planWords(p)}`);
  }
  if (done.length) {
    lines.push(`Confirmed and on the board:`);
    for (const p of done) lines.push(`• ${planWords(p)}`);
  }
  lines.push("Confirming happens on the Board, by your tap. Echo records the flight; it never buys it.");
  return lines.join("\n");
}
