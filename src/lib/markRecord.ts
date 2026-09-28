// markRecord — the record standing behind a station mark.
//
// Every mark on the wall is a receipt, and every receipt points at what it
// was pressed on: a place stamp carries the place's id, a journey wrap
// carries the journey id — which is the legs' plan ids joined with "+",
// because that is how journeysFrom names a journey. This module reads those
// pointers and puts the record into words. Pure: rows in, words out, so the
// replay stays testable and never invents a fact the receipts don't hold.
import { airportWords } from "@/lib/airports";
import type { StationMarkEvent } from "@/lib/stationMarks";

/** The compact leg row the replay reads — the same truth JourneySummary shows. */
export type LegRecord = {
  id: string;
  origin: string;
  destination: string;
  status: string;
  leg_state: string | null;
  leg_state_source: string | null;
};

/** A journey id is the legs' plan ids in order, joined with "+". */
export function journeyPlanIds(recordId: string | null | undefined): string[] {
  if (!recordId) return [];
  return recordId
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** One leg of the replay, in the words the books already use. */
export function legRecordWords(leg: LegRecord): string {
  const from = leg.origin || "?";
  const to = airportWords((leg.destination ?? "").toUpperCase()) || leg.destination || "?";
  if (leg.status === "dropped") return `${from} → ${to} — set aside`;
  if (leg.leg_state === "landed" && leg.leg_state_source === "you") return `${from} → ${to} — landed, your word`;
  if (leg.leg_state === "landed" || leg.status === "flown") return `${from} → ${to} — landed`;
  return `${from} → ${to} — on record`;
}

/** Order fetched legs the way the journey flew them — the id list is the order. */
export function orderLegs(legs: readonly LegRecord[], planIds: readonly string[]): LegRecord[] {
  const rank = new Map(planIds.map((id, i) => [id, i]));
  return [...legs].sort((a, b) => (rank.get(a.id) ?? planIds.length) - (rank.get(b.id) ?? planIds.length));
}

/** One beat of a stamp's life: pressed, lifted, pressed again. */
export type PlaceStampBeat = { kind: "pressed" | "lifted"; at: string };

/**
 * The press/lift history of one place, oldest first, from the receipts alone.
 * A mark that stands ends on a press; one that was lifted shows that too.
 */
export function placeStampBeats(
  rows: readonly StationMarkEvent[],
  entityId: string | null | undefined,
): PlaceStampBeat[] {
  if (!entityId) return [];
  return rows
    .filter(
      (r) =>
        r.entity_id === entityId &&
        (r.event === "place.stamped" || r.event === "place.stamp_lifted"),
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => ({ kind: r.event === "place.stamped" ? "pressed" : "lifted", at: r.created_at }));
}
