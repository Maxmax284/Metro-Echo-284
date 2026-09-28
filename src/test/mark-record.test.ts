import { describe, expect, it } from "vitest";
import {
  journeyPlanIds,
  legRecordWords,
  orderLegs,
  placeStampBeats,
  type LegRecord,
} from "@/lib/markRecord";
import type { StationMarkEvent } from "@/lib/stationMarks";

const leg = (over: Partial<LegRecord>): LegRecord => ({
  id: "p1",
  origin: "IAD",
  destination: "ZZZ",
  status: "planned",
  leg_state: null,
  leg_state_source: null,
  ...over,
});

const ev = (
  event: string,
  created_at: string,
  entity_id: string | null = "p1",
): StationMarkEvent => ({ entity_id, event, payload: null, created_at });

describe("journeyPlanIds", () => {
  it("splits the journey id back into its legs, in order", () => {
    expect(journeyPlanIds("leg1+leg2+leg3")).toEqual(["leg1", "leg2", "leg3"]);
  });

  it("a missing or empty pointer yields no legs — never a guess", () => {
    expect(journeyPlanIds(null)).toEqual([]);
    expect(journeyPlanIds(undefined)).toEqual([]);
    expect(journeyPlanIds("")).toEqual([]);
    expect(journeyPlanIds("++")).toEqual([]);
  });
});

describe("orderLegs", () => {
  it("puts fetched legs back in the order the journey flew them", () => {
    const legs = [leg({ id: "c" }), leg({ id: "a" }), leg({ id: "b" })];
    expect(orderLegs(legs, ["a", "b", "c"]).map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("a leg with no pointer rank sinks to the end rather than vanishing", () => {
    const legs = [leg({ id: "x" }), leg({ id: "a" })];
    expect(orderLegs(legs, ["a"]).map((l) => l.id)).toEqual(["a", "x"]);
  });
});

describe("legRecordWords", () => {
  it("a dropped leg is set aside, not flown", () => {
    expect(legRecordWords(leg({ status: "dropped" }))).toBe("IAD → ZZZ — set aside");
  });

  it("your landing word says so on the line", () => {
    expect(legRecordWords(leg({ leg_state: "landed", leg_state_source: "you" }))).toBe(
      "IAD → ZZZ — landed, your word",
    );
  });

  it("a landed or flown leg reads as landed", () => {
    expect(legRecordWords(leg({ leg_state: "landed", leg_state_source: null }))).toBe("IAD → ZZZ — landed");
    expect(legRecordWords(leg({ status: "flown" }))).toBe("IAD → ZZZ — landed");
  });

  it("anything else is on record — no outcome is invented", () => {
    expect(legRecordWords(leg({}))).toBe("IAD → ZZZ — on record");
  });

  it("a missing airport name falls back to the code, never a blank", () => {
    expect(legRecordWords(leg({ origin: "", destination: "" }))).toContain("?");
  });
});

describe("placeStampBeats", () => {
  it("reads one place's press/lift life oldest first, from the receipts alone", () => {
    const rows = [
      ev("place.stamped", "2026-09-28T10:00:00Z"),
      ev("place.stamp_lifted", "2026-09-27T10:00:00Z"),
      ev("place.stamped", "2026-09-26T10:00:00Z"),
    ];
    expect(placeStampBeats(rows, "p1")).toEqual([
      { kind: "pressed", at: "2026-09-26T10:00:00Z" },
      { kind: "lifted", at: "2026-09-27T10:00:00Z" },
      { kind: "pressed", at: "2026-09-28T10:00:00Z" },
    ]);
  });

  it("never borrows another place's beats", () => {
    const rows = [
      ev("place.stamped", "2026-09-26T10:00:00Z", "p2"),
      ev("journey.wrapped_up", "2026-09-26T11:00:00Z", null),
    ];
    expect(placeStampBeats(rows, "p1")).toEqual([]);
  });

  it("no place id means no history, not a guess", () => {
    expect(placeStampBeats([ev("place.stamped", "2026-09-26T10:00:00Z")], null)).toEqual([]);
  });
});
