// Boarding — the state between the terminal and the air. Your word only.
import { describe, expect, it } from "vitest";
import {
  OVERRIDE_CHOICES,
  OVERRIDE_WORDS,
  STATE_WORDS,
  bigNumbers,
  legState,
  whereOnJourney,
  type Journey,
  type Leg,
} from "@/lib/journey";
import { groundPath } from "@/lib/groundPath";

const NOW = new Date("2026-09-19T00:45:00Z");

const leg = (over: Partial<Leg> = {}): Leg => ({
  plan_id: "p1",
  order: 0,
  flight_no: "BR3",
  airline: "EVA Air",
  from: { iata: "IAD", at: "2026-09-19T01:15:00Z", basis: "scheduled", terminal: null, gate: null },
  to: { iata: "TPE", at: "2026-09-19T15:00:00Z", basis: "scheduled", terminal: null, gate: null },
  live_checked_at: null,
  filed_status: "scheduled",
  override: null,
  override_note: null,
  ...over,
});

const journey = (l: Leg): Journey => ({ id: "j1", legs: [l], segments: [], title: "Dulles to Taipei" });

describe("boarding", () => {
  it("is offered as a choice between the terminal and the air", () => {
    const values = OVERRIDE_CHOICES.map((c) => c.value);
    expect(values).toContain("boarding");
    expect(values.indexOf("boarding")).toBeLessThan(values.indexOf("in_air"));
    expect(OVERRIDE_WORDS.boarding).toContain("doors are not shut");
    expect(STATE_WORDS.boarding).toBe("boarding");
  });

  it("holds the traveller's word without claiming a departure", () => {
    const s = legState(leg({ override: "boarding" }), NOW);
    expect(s.kind).toBe("boarding");
    expect(s.source).toBe("you");
    expect(s.stale).toBe(false);
  });

  it("puts the journey on board, not in the air", () => {
    const where = whereOnJourney(journey(leg({ override: "boarding" })), NOW);
    expect(where.kind).toBe("boarding");
    expect(where.nextLeg).toBeNull();
    expect(where.words).toContain("On board");
  });

  it("still counts down to the filed departure", () => {
    const big = bigNumbers(journey(leg({ override: "boarding" })), NOW);
    expect(big.timeLeft).toBe("30m");
    expect(big.timeLeftLabel).toBe("until the filed departure");
  });

  it("clears the terminal out of the next move", () => {
    const read = groundPath({
      where: "boarding",
      identity: null,
      fromPlace: "Washington Dulles",
      toPlace: "Taipei",
      terminal: null,
      gate: null,
      minsToDeparture: 30,
    });
    expect(read.step).toBe("boarding");
    expect(read.lead).toContain("On board");
    expect(read.lead).toContain("Nothing left to do in the terminal");
    expect(read.needsCheckIn).toBe(false);
  });
});
