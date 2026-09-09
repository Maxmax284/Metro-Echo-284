import { describe, expect, it } from "vitest";
import { readPlaceBoard } from "@/lib/placeBoard";

const NOW = new Date("2026-09-09T12:00:00Z").getTime();

describe("place board", () => {
  it("says nothing on file, and teaches how something lands, when nothing was ever read", () => {
    const b = readPlaceBoard({ now: NOW });
    expect(b.count).toBe(0);
    expect(b.groups).toHaveLength(0);
    expect(b.scanLine).toBe("Never scanned here");
    expect(b.needsScan).toBe(true);
    expect(b.quiet).toMatch(/Read this spot|read around here/i);
  });

  it("names nearby places closest first, with a measured distance only", () => {
    const b = readPlaceBoard({
      now: NOW,
      nearby: [
        { name: "Sully Station Market", distanceM: 1800 },
        { name: "Air and Space Museum", distanceM: 400, detail: "Museum · opens 10am" },
        { name: "Unmeasured Diner" },
      ],
      scanAt: new Date(NOW - 3 * 3_600_000).toISOString(),
    });
    const around = b.groups.find((g) => g.key === "around")!;
    expect(around.lines[0].text).toContain("Air and Space Museum");
    expect(around.lines[0].text).toMatch(/400 m|0\.4/);
    expect(around.lines[2].text).toBe("Unmeasured Diner");
    expect(b.scanLine).toBe("Scanned 3h ago");
    expect(b.needsScan).toBe(false);
  });

  it("carries local changes and the day, three lines each at most", () => {
    const b = readPlaceBoard({
      now: NOW,
      nearby: [{ name: "Somewhere", distanceM: 10 }],
      changes: [
        { key: "transport", text: "transport: Silver Line running late" },
        { key: "hazards", text: "hazards: storm watch" },
        { key: "payments", text: "payments: cash still common" },
        { key: "etiquette", text: "etiquette: nothing moved" },
      ],
      events: [
        { id: "a", title: "Site walk", starts_at: new Date(NOW + 3_600_000).toISOString(), location: "Dulles" },
        { id: "b", title: "Next week", starts_at: new Date(NOW + 8 * 86_400_000).toISOString() },
      ],
      scanAt: new Date(NOW - 60_000).toISOString(),
    });
    expect(b.groups.find((g) => g.key === "changed")!.lines).toHaveLength(3);
    const day = b.groups.find((g) => g.key === "day")!;
    expect(day.lines).toHaveLength(1);
    expect(day.lines[0].text).toContain("Site walk");
    expect(day.lines[0].detail).toContain("Dulles");
  });

  it("asks for a fresh read when the scan on file is over a week old", () => {
    const b = readPlaceBoard({
      now: NOW,
      nearby: [{ name: "Old Venue", distanceM: 100 }],
      scanAt: new Date(NOW - 9 * 86_400_000).toISOString(),
    });
    expect(b.needsScan).toBe(true);
    expect(b.scanLine).toBe("Scanned 9d ago");
  });
});
