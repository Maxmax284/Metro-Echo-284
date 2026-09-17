import { describe, it, expect } from "vitest";
import {
  fusePlace,
  placeWords,
  conflictWords,
  placeStateLine,
  type PlaceEvidence,
} from "@/lib/placeState";
import {
  transitionBetween,
  airportArrival,
  transitionWords,
  keepsNoTrail,
} from "@/lib/placeTransitions";

const NOW = new Date("2026-09-17T16:00:00Z");
const fresh = (mins: number) => new Date(NOW.getTime() - mins * 60_000).toISOString();

const stated = (where: PlaceEvidence["where"], level: PlaceEvidence["level"], mins = 5): PlaceEvidence => ({
  kind: "stated",
  role: "current",
  where,
  level,
  stamp: { source: "you said so", authority: "reported", readAt: fresh(mins) },
});

const journey = (where: PlaceEvidence["where"], mins = 10): PlaceEvidence => ({
  kind: "journey",
  role: "current",
  where,
  level: "locality",
  stamp: { source: "filed journey", authority: "provider", readAt: fresh(mins) },
});

describe("place fusion", () => {
  it("says nothing when there is no evidence for the role", () => {
    const state = fusePlace("current", [], NOW);
    expect(state.where).toEqual({});
    expect(placeWords(state)).toBeNull();
    expect(placeStateLine(state)).toBe("");
  });

  it("never uses evidence filed against another role", () => {
    const destination: PlaceEvidence = { ...stated({ country: "JP", locality: "Tokyo" }, "locality"), role: "destination" };
    const state = fusePlace("current", [destination], NOW);
    expect(placeWords(state)).toBeNull();
  });

  it("caps a device clock at country level", () => {
    const tz: PlaceEvidence = {
      kind: "device_timezone",
      role: "current",
      where: { country: "US", region: "VA", locality: "Arlington" },
      level: "locality",
      stamp: { source: "device clock", authority: "reported", readAt: fresh(1) },
    };
    const state = fusePlace("current", [tz], NOW);
    expect(state.where.country).toBe("US");
    expect(state.where.locality).toBeUndefined();
    expect(state.level).toBe("country");
  });

  it("reads the two most specific known levels like a person", () => {
    const state = fusePlace("current", [stated({ country: "US", region: "VA", locality: "Arlington" }, "locality")], NOW);
    expect(placeWords(state)).toBe("Arlington, VA");
  });

  it("shows a conflict instead of picking a side", () => {
    const state = fusePlace(
      "current",
      [
        journey({ country: "JP", locality: "Tokyo" }),
        { ...journey({ country: "KR", locality: "Seoul" }, 12), kind: "device_fix" },
      ],
      NOW,
    );
    expect(state.conflicts.length).toBeGreaterThan(0);
    expect(state.confidence).toBe("thin");
    const words = conflictWords(state)!;
    expect(words).toContain("Tokyo");
    expect(words).toContain("Seoul");
    expect(words).toContain("not going to pick");
  });

  it("keeps the coarser level when a finer one is contested", () => {
    const state = fusePlace(
      "current",
      [journey({ country: "JP", locality: "Tokyo" }), journey({ country: "JP", locality: "Osaka" }, 11)],
      NOW,
    );
    expect(state.where.country).toBe("JP");
    expect(state.where.locality).toBeUndefined();
  });

  it("calls a day-old fix thin rather than current truth", () => {
    const old: PlaceEvidence = {
      ...stated({ country: "TH", locality: "Ko Samui" }, "locality"),
      stamp: { source: "you said so", authority: "reported", readAt: new Date(NOW.getTime() - 40 * 3_600_000).toISOString() },
    };
    const state = fusePlace("current", [old], NOW);
    expect(state.confidence).toBe("thin");
    expect(placeStateLine(state)).toContain("thin evidence");
  });
});

describe("transition ledger", () => {
  const before = fusePlace("current", [stated({ country: "US", region: "VA", metro: "DC area" }, "metro")], NOW);
  const after = fusePlace("current", [stated({ country: "TH", region: "Surat Thani", metro: "Ko Samui" }, "metro")], NOW);

  it("records the country change, not the three finer ones", () => {
    const t = transitionBetween(before, after, NOW.toISOString())!;
    expect(t.kind).toBe("country_change");
    expect(transitionWords(t)).toContain("changed country");
  });

  it("records nothing when nothing changed", () => {
    expect(transitionBetween(before, before, NOW.toISOString())).toBeNull();
  });

  it("records nothing from a contested read", () => {
    const contested = fusePlace(
      "current",
      [journey({ country: "JP", locality: "Tokyo" }), { ...journey({ country: "KR", locality: "Seoul" }, 12), kind: "device_fix" }],
      NOW,
    );
    expect(transitionBetween(before, contested, NOW.toISOString())).toBeNull();
  });

  it("records nothing on a cold first read", () => {
    expect(transitionBetween(null, after, NOW.toISOString())?.kind).toBe("country_change");
  });

  it("keeps an airport arrival but never a trail", () => {
    const rows = [airportArrival(after, "BKK", NOW.toISOString()), transitionBetween(before, after, NOW.toISOString())!];
    expect(rows[0].kind).toBe("airport_arrival");
    expect(keepsNoTrail(rows)).toBe(true);
  });
});
