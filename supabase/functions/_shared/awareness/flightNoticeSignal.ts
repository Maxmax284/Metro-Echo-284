// flightNoticeSignal — a flight Echo read somewhere, still waiting on an answer.
//
// Doctrine:
//   - The signal carries facts only. Whether it reaches Today, the phone or a
//     chat is the central ladder's decision, never this adapter's.
//   - It is a question, not news. The next step is always answering it, never
//     anything that would put a flight on the board by itself.
// Pure module: no IO, no Deno globals.
import type { AwarenessSignal, ScopeIdentity } from "./signal.ts";
import { registerSignalKind } from "./registry.ts";

export const FLIGHT_NOTICED = "flight_noticed";

/* Mail and messages that carry a booking. Impact sits above a stalled document
   and below an overdue promise: missing it means missing a flight, but a draft
   nobody answers has never moved anything on its own. */
registerSignalKind({ kind: FLIGHT_NOTICED, source: "mail", baseImpact: 0.55, label: "Flight noticed" });

export type NoticedFlightRow = {
  id: string;
  flight_no: string | null;
  airline: string | null;
  origin: string | null;
  destination: string | null;
  depart_on: string | null;
  ownership: string | null;
  origin_kind: string | null;
  source_words: string | null;
  created_at: string;
};

function where(row: NoticedFlightRow): string {
  const a = (row.origin ?? "").trim();
  const b = (row.destination ?? "").trim();
  if (a && b) return `${a} to ${b}`;
  if (b) return `to ${b}`;
  if (a) return `out of ${a}`;
  return "";
}

/** Hours until the flight leaves, when a date is on record. */
export function hoursUntilDeparture(row: NoticedFlightRow, nowMs: number): number | null {
  if (!row.depart_on) return null;
  const t = Date.parse(`${row.depart_on}T12:00:00Z`);
  if (Number.isNaN(t)) return null;
  return (t - nowMs) / 3_600_000;
}

/**
 * One signal per unanswered recognised flight. The dedupe key is deliberately
 * the same one the recognition already wrote, so the ladder speaks about the
 * existing question instead of raising a second one.
 */
export function flightNoticeSignals(
  rows: NoticedFlightRow[],
  scope: ScopeIdentity,
  nowMs: number,
): AwarenessSignal[] {
  const out: AwarenessSignal[] = [];
  for (const row of rows) {
    if ((row.ownership ?? "unknown") !== "unknown") continue;
    const flight = (row.flight_no ?? "").trim();
    if (!flight) continue;
    const hours = hoursUntilDeparture(row, nowMs);
    /* A flight that already left cannot be answered usefully. */
    if (hours != null && hours < -24) continue;

    const leg = where(row);
    const when = row.depart_on ? ` on ${row.depart_on}` : "";
    out.push({
      id: `flight-noticed:${row.id}`,
      source: "mail",
      type: FLIGHT_NOTICED,
      scope,
      entityType: "flight_plan",
      entityId: row.id,
      timestamp: row.created_at,
      summary: `${flight}${leg ? ` ${leg}` : ""}${when} — is this one of yours?`,
      why: `Echo read this flight in ${row.source_words?.trim() || "something that arrived"} and cannot tell whose it is.`,
      nextStep: "Answer it on the flight desk. Nothing goes on your board until you do.",
      confidence: 0.6,
      sourceRefs: [{ kind: "flight_plan", id: row.id, label: flight }],
      metadata: { flight_no: flight, depart_on: row.depart_on, origin_kind: row.origin_kind },
      dedupeKey: `flight_noticed:${flight}:${row.depart_on ?? "unknown"}`,
    });
  }
  return out;
}
