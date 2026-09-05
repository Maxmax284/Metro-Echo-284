import { describe, it, expect } from "vitest";
import { readShelves, neverReadLine } from "@/lib/awarenessShelves";
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

  it("never claims a layer changed, only that it was read again", () => {
    const read = readShelves({
      ...base,
      briefings: { transport: { generated_at: iso(3 * 60 * 60 * 1000), confidence: "high", signal: {} } },
    });
    const changed = read.shelves.find((s) => s.key === "changed")!;
    expect(changed.lines[0].text).toContain("read again 3h ago");
    expect(changed.lines[0].detail).toContain("can't tell you what moved");
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

  it("adds one clause and changes nothing else", () => {
    const withLine = {
      ...empty,
      arrived: [{ id: "a1", label: "A photo", at: iso(60_000), via: "telegram" }],
    };
    const without = readSituation(withLine);
    const withPlace = readSituation({ ...withLine, place: fresh });
    expect(withPlace.placeNote).toBe("Read from Bangkok.");
    expect(without.placeNote).toBeNull();
    expect(withPlace.lines.map((l) => l.text)).toEqual(without.lines.map((l) => l.text));
    expect(withPlace.headline).toBe(without.headline);
  });
});
