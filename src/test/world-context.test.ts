import { describe, it, expect } from "vitest";
import { worldFacts, worldContextBlock, worldTopicLine, regionOverrules } from "@/lib/worldContext";
import { environmentEdge, environmentLine, situationalAsks } from "@/lib/environmentEdge";
import { fusePlace, type PlaceEvidence } from "@/lib/placeState";

const NOW = new Date("2026-09-17T16:00:00Z");

describe("world context spine", () => {
  it("holds stamped facts for a country Echo has notes on", () => {
    const rows = worldFacts("US");
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every((r) => !!r.stamp.checkedOn)).toBe(true);
    expect(rows.map((r) => r.topic)).toContain("plugs");
  });

  it("holds nothing at all for a country with no notes", () => {
    expect(worldFacts("Uzbekistan")).toEqual([]);
    expect(worldContextBlock("Uzbekistan")).toBe("");
  });

  it("lets a state note overrule the country note on tax", () => {
    expect(regionOverrules("US", "VA", "tax")).toBe(true);
    const line = worldTopicLine("US", "VA", "tax")!;
    expect(line).toContain("Virginia");
    expect(line).toContain("VA");
  });

  it("leaves the country note alone where no state note exists", () => {
    expect(regionOverrules("US", "MT", "tax")).toBe(false);
    expect(worldTopicLine("US", "MT", "tax")).not.toContain("Virginia");
  });

  it("names what it does not hold instead of generalising", () => {
    const block = worldContextBlock("TH");
    expect(block).toContain("Not recorded");
    expect(block).toContain("Never speak about people");
  });
});

describe("environment edge", () => {
  const here: PlaceEvidence = {
    kind: "stated",
    role: "current",
    where: { country: "US", region: "VA", locality: "Arlington" },
    level: "locality",
    stamp: { source: "you said so", authority: "reported", readAt: NOW.toISOString() },
  };

  it("shows where, the clock there and what is next", () => {
    const edge = environmentEdge(
      {
        place: fusePlace("current", [here], NOW),
        timezone: "America/New_York",
        next: { words: "next thing", atIso: "2026-09-17T20:30:00Z" },
      },
      NOW,
    );
    expect(edge.where).toBe("ARLINGTON, VA");
    expect(edge.clock).toBe("EDT");
    expect(edge.next).toBe("next thing 4:30 PM");
    expect(environmentLine(edge)).toBe("ARLINGTON, VA · EDT | next thing 4:30 PM");
  });

  it("prefers a live countdown over a clock time", () => {
    const edge = environmentEdge(
      { place: null, timezone: "Asia/Tokyo", countdown: { words: "connection", minutes: 208 } },
      NOW,
    );
    expect(edge.next).toBe("connection 3h 28m");
  });

  it("renders nothing when nothing is known", () => {
    const edge = environmentEdge({ place: null, timezone: null, next: null }, NOW);
    expect(edge.empty).toBe(true);
    expect(environmentLine(edge)).toBe("");
  });

  it("carries a place conflict into the line instead of hiding it", () => {
    const state = fusePlace(
      "current",
      [
        { ...here, where: { country: "JP", locality: "Tokyo" } },
        { ...here, kind: "device_fix", where: { country: "KR", locality: "Seoul" } },
      ],
      NOW,
    );
    const edge = environmentEdge({ place: state, timezone: "Asia/Tokyo" }, NOW);
    expect(edge.conflict).toContain("Seoul");
    expect(environmentLine(edge)).toContain("disagree");
  });
});

describe("situational asks", () => {
  it("returns nothing when the situation makes nothing answerable", () => {
    expect(situationalAsks({})).toEqual([]);
  });

  it("asks about leaving the airport only on a long layover", () => {
    expect(situationalAsks({ atAirport: true, layoverMinutes: 45 }).map((a) => a.id)).not.toContain("leave_airport");
    expect(situationalAsks({ atAirport: true, layoverMinutes: 208 }).map((a) => a.id)).toContain("leave_airport");
  });

  it("never offers more than three", () => {
    const asks = situationalAsks({
      atAirport: true,
      layoverMinutes: 300,
      cashCountry: true,
      needsCare: true,
      housingCostKnown: true,
      changesTonight: 4,
      abroad: true,
      haveLocalFacts: true,
    });
    expect(asks.length).toBe(3);
  });
});
