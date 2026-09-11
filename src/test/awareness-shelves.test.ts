import { describe, it, expect } from "vitest";
import { readShelves, neverReadLine, cleanScanSummary } from "@/lib/awarenessShelves";
import { readSituation, placeSpeaks, type SituationPlace } from "@/lib/situation";

const LAYERS = ["transport", "payments", "hazards", "scams", "connectivity", "timing"] as const;
const NOW = new Date("2026-09-05T04:00:00Z").getTime();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const base = {
  now: NOW,
  place: { label: "Spot", city: "Bangkok", region: null, country: "TH" },
  briefings: {} as Record<string, any>,
  layers: LAYERS,
};

describe("awareness shelves", () => {
  it("teaches how something lands on every empty shelf", () => {
    const read = readShelves(base);
    expect(read.shelves.map((s) => s.key)).toEqual(["now", "around", "changed", "coming"]);
    for (const shelf of read.shelves) {
      expect(shelf.lines).toHaveLength(0);
      expect(shelf.quiet.length).toBeGreaterThan(20);
    }
    expect(read.paragraph).toContain("Bangkok");
    expect(read.paragraph).toContain("Nothing has been read here yet");
  });

  it("puts real risk on Now and the plain read on Around you", () => {
    const read = readShelves({
      ...base,
      newestAt: iso(60_000),
      briefings: {
        hazards: {
          generated_at: iso(60_000),
          confidence: "high",
          signal: { title: "Flooding on the main road", risk_level: "high", why_it_matters: "Route is cut." },
        },
        payments: {
          generated_at: iso(60_000),
          confidence: "high",
          signal: { title: "Cash still rules", risk_level: "none", short_summary: "Small shops rarely take cards." },
        },
      },
    });
    const now = read.shelves.find((s) => s.key === "now")!;
    const around = read.shelves.find((s) => s.key === "around")!;
    expect(now.lines[0].text).toBe("Flooding on the main road");
    expect(around.lines.map((l) => l.text)).toEqual(["Cash still rules"]);
  });

  it("with no earlier read, says only that this one is current", () => {
    const read = readShelves({
      ...base,
      briefings: { transport: { generated_at: iso(3 * 60 * 60 * 1000), confidence: "high", signal: {} } },
    });
    const changed = read.shelves.find((s) => s.key === "changed")!;
    expect(changed.lines[0].text).toContain("read again 3h ago");
    expect(changed.lines[0].detail).toContain("nothing to compare it against");
  });

  it("with an earlier read on record, says what moved", () => {
    const read = readShelves({
      ...base,
      briefings: {
        hazards: { generated_at: iso(60 * 60 * 1000), confidence: "high", signal: { risk_level: "medium", title: "Road washed out" } },
      },
      previousBriefings: {
        hazards: { generated_at: iso(26 * 60 * 60 * 1000), confidence: "high", signal: { risk_level: "low", title: "Wet season starting" } },
      },
    });
    const changed = read.shelves.find((s) => s.key === "changed")!;
    expect(changed.lines[0].text).toContain("from low to worth a look");
  });

  it("says same as before when neither level nor headline moved", () => {
    const read = readShelves({
      ...base,
      briefings: { transport: { generated_at: iso(60 * 60 * 1000), confidence: "high", signal: { risk_level: "none", title: "Songthaews all day" } } },
      previousBriefings: { transport: { generated_at: iso(30 * 60 * 60 * 1000), confidence: "high", signal: { risk_level: "none", title: "Songthaews all day" } } },
    });
    const changed = read.shelves.find((s) => s.key === "changed")!;
    expect(changed.lines[0].text).toContain("same as before");
  });

  it("puts your own saved places at the top of Around you, measured not searched", () => {
    const read = readShelves({
      ...base,
      savedNearby: [
        { id: "far", label: "Airport", distanceM: 40_000 },
        { id: "near", label: "The gym", distanceM: 400 },
      ],
      nearbyTowns: [{ name: "Rawai", kind: "town", distanceM: 2_600 }],
    });
    const around = read.shelves.find((s) => s.key === "around")!;
    expect(around.lines[0].text).toContain("The gym is 400 m from here");
    // 40km is outside the near radius, so it is left out rather than padded in.
    expect(around.lines.map((l) => l.text).join(" ")).not.toContain("Airport");
    expect(around.lines.map((l) => l.text).join(" ")).toContain("Rawai");
  });

  it("names layers never read rather than showing them as empty", () => {
    const read = readShelves(base);
    expect(read.neverRead).toEqual([...LAYERS]);
    expect(neverReadLine(["hazards"])).toContain("Never read here: hazards");
    expect(neverReadLine([])).toBeNull();
  });
});

describe("place in the situation read", () => {
  const fresh: SituationPlace = { where: "Bangkok", scope: "city", at: new Date(NOW - 60_000).toISOString() };
  const empty = {
    now: NOW,
    overdue: [],
    dueSoon: [],
    waitingOnYou: [],
    arrived: [],
    noticed: [],
    meetings: [],
    projects: [],
  };

  it("stays silent unless the place is resolved, recent and beside something", () => {
    expect(placeSpeaks(fresh, 1, NOW)).toBe(true);
    expect(placeSpeaks(fresh, 0, NOW)).toBe(false);
    expect(placeSpeaks({ ...fresh, scope: "unknown" }, 1, NOW)).toBe(false);
    expect(placeSpeaks({ ...fresh, at: new Date(NOW - 48 * 60 * 60 * 1000).toISOString() }, 1, NOW)).toBe(false);
    expect(placeSpeaks(null, 1, NOW)).toBe(false);
  });

  it("says nothing about place on a clear day", () => {
    const read = readSituation({ ...empty, place: fresh });
    expect(read.lines).toHaveLength(0);
    expect(read.headline).toBe("You're clear.");
    expect(read.placeNote).toBeNull();
  });

  it("does not add a place clause beside an unrelated arrival", () => {
    const withLine = {
      ...empty,
      arrived: [{ id: "a1", label: "A photo", at: iso(60_000), via: "telegram" }],
    };
    const without = readSituation(withLine);
    const withPlace = readSituation({ ...withLine, place: fresh });
    expect(withPlace.placeNote).toBeNull();
    expect(without.placeNote).toBeNull();
    expect(withPlace.lines.map((l) => l.text)).toEqual(without.lines.map((l) => l.text));
    expect(withPlace.headline).toBe(without.headline);
  });

  it("adds place only when it changes a near-term meeting answer", () => {
    const withMeeting = readSituation({
      ...empty,
      place: fresh,
      meetings: [{ id: "m1", title: "Coffee", starts_at: iso(60 * 60 * 1000), location: "Bangkok" }],
    });
    expect(withMeeting.lines[0]?.kind).toBe("meeting_soon");
    expect(withMeeting.placeNote).toBe("Read from Bangkok.");
  });
});

describe("a scan that ran is a read", () => {
  const place = { label: "Spot", city: "Chantilly", region: "Virginia", country: "United States" };
  const base = { place, briefings: {}, layers: ["transport", "payments"] as const };

  it("named venues from the scan land on Around you", () => {
    const r = readShelves({
      ...base,
      nearbyVenues: [
        { name: "Wells Fargo ATM", detail: "ATM · Open 24 hours" },
        { name: "CVS", detail: "Pharmacy · closes 10pm" },
        { name: "Third place", detail: null },
      ],
      scanAt: new Date().toISOString(),
    });
    const around = r.shelves.find((s) => s.key === "around")!;
    expect(around.lines.length).toBe(2);
    expect(around.lines[0].text).toContain("Wells Fargo ATM");
  });

  it("the paragraph carries the scan read instead of claiming nothing was read", () => {
    const r = readShelves({ ...base, scanSummary: "Plenty open nearby.", scanAt: new Date().toISOString() });
    expect(r.paragraph).toContain("Plenty open nearby.");
    expect(r.paragraph).not.toContain("Nothing has been read here yet");
  });

  it("leaked field labels never reach a person", () => {
    expect(cleanScanSummary("short_summary:\nIt is clear.\n\nwhy_it_matters:\nCash.")).toBe("It is clear. Cash.");
    expect(cleanScanSummary(null)).toBeNull();
  });
});
