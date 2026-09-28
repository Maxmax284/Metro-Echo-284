// stationMarks — the marks you deliberately left on the station, folded from
// the receipts themselves.
//
// A mark is a place you stamped (place.stamped) or a trip you closed with
// your own word (journey.wrapped_up). Nothing else lands on the wall — no
// inferred visits, no route history, no breadcrumbs — and the rollback
// receipts (place.stamp_lifted, journey.wrap_up_reopened) take their mark
// back off. Names ride as snapshots from the event payloads, so a forgotten
// place never takes its mark's name with it, and no mark ever carries
// coordinates.
//
// Pure: no I/O, no clock — the rows come in, the wall comes out, so the fold
// stays testable.
import { format } from "date-fns";

export type StationMarkKind = "place" | "journey";

export type StationMark = {
  /** Stable identity — "place:<entity id>" or "journey:<pressed at>". */
  key: string;
  kind: StationMarkKind;
  /** Name snapshot from the receipt — never coordinates. */
  name: string;
  /** ISO of the deliberate act. */
  at: string;
  /**
   * Pointer to the record behind the mark: the place id for a stamp, the
   * journey id (its legs' plan ids joined with "+") for a wrap. Null when
   * the receipt was pressed before records were linked — then the receipt
   * itself is all the record there is, and the replay says so.
   */
  recordId: string | null;
};

export type StationMarkEvent = {
  entity_id: string | null;
  event: string;
  payload: unknown;
  created_at: string;
};

export const STATION_MARK_EVENTS = [
  "place.stamped",
  "place.stamp_lifted",
  "journey.wrapped_up",
  "journey.wrap_up_reopened",
] as const;

function payloadWord(payload: unknown, field: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Fold the receipts into the marks still standing. Latest word per entity wins. */
export function stationMarks(rows: readonly StationMarkEvent[]): StationMark[] {
  const places = new Map<string, StationMark>();
  const journeys: StationMark[] = [];
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const row of sorted) {
    switch (row.event) {
      case "place.stamped": {
        if (!row.entity_id) break;
        places.set(row.entity_id, {
          key: `place:${row.entity_id}`,
          kind: "place",
          name: payloadWord(row.payload, "label") ?? "A place you stamped",
          at: payloadWord(row.payload, "stamped_at") ?? row.created_at,
        });
        break;
      }
      case "place.stamp_lifted":
        if (row.entity_id) places.delete(row.entity_id);
        break;
      case "journey.wrapped_up":
        journeys.push({
          key: `journey:${row.created_at}`,
          kind: "journey",
          name: payloadWord(row.payload, "route") ?? "A trip you closed",
          at: row.created_at,
        });
        break;
      case "journey.wrap_up_reopened":
        // Reopening lifts the latest standing wrap — rollback is real.
        journeys.pop();
        break;
    }
  }
  return [...places.values(), ...journeys].sort((a, b) => b.at.localeCompare(a.at));
}

export function countStationMarks(rows: readonly StationMarkEvent[]): number {
  return stationMarks(rows).length;
}

/** Deterministic tilt for a wall stamp, so the wall never reshuffles. */
export function wallTilt(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 12) - 6; // -6° … +5°
}

/** "26 Sep 2026" — the date a mark was pressed, passport style. */
export function markDateWords(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return format(new Date(ms), "d MMM yyyy");
}

/* --- Cabinet rotation -----------------------------------------------------
   The cabinet holds six dials and no more. The sixth slot hosts one extra
   dial a day — travel, the platform clock, or the marks count — picked by
   the date so it never flickers within a day and never piles up into a
   widget heap. */

export type RotatingDialId = "travel" | "clock" | "marks";

export function rotatingDial(dayKey: string, available: readonly RotatingDialId[]): RotatingDialId {
  if (available.length === 0) return "travel";
  let h = 0;
  for (const ch of dayKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return available[h % available.length];
}
