import { describe, expect, it } from "vitest";
import { meetingIsElsewhere, readSituation } from "@/lib/situation";
import { readShelves } from "@/lib/awarenessShelves";

const here = { where: "Lamai", scope: "exact" as const, at: new Date().toISOString(), savedPlace: "Lamai" };
const base = {
  overdue: [], dueSoon: [], waitingOnYou: [], arrived: [], noticed: [], projects: [],
};

describe("place-aware meetings", () => {
  it("can't tell is not elsewhere", () => {
    expect(meetingIsElsewhere(null, here)).toBe(false);
    expect(meetingIsElsewhere("Lamai gym", null)).toBe(false);
    expect(meetingIsElsewhere("https://meet.google.com/x", here)).toBe(false);
  });

  it("a named place that isn't yours reads as elsewhere", () => {
    expect(meetingIsElsewhere("Chaweng office", here)).toBe(true);
    expect(meetingIsElsewhere("Lamai Muay Thai", here)).toBe(false);
  });

  it("keeps a meeting elsewhere out of the main read", () => {
    const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const read = readSituation({
      ...base,
      meetings: [{ id: "m1", title: "Site visit", starts_at: soon, location: "Chaweng office" }],
      place: here,
    });
    expect(read.lines.some((l) => l.kind === "meeting_soon")).toBe(false);
    expect(read.elsewhereMeetings.map((m) => m.id)).toEqual(["m1"]);
  });

  it("keeps a meeting where you are in the main read", () => {
    const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const read = readSituation({
      ...base,
      meetings: [{ id: "m2", title: "Pads", starts_at: soon, location: "Lamai" }],
      place: here,
    });
    expect(read.lines.some((l) => l.kind === "meeting_soon")).toBe(true);
    expect(read.elsewhereMeetings).toHaveLength(0);
  });

  it("Around you carries the elsewhere meeting and never claims distance", () => {
    const shelves = readShelves({
      place: { label: "Lamai" },
      briefings: {},
      layers: [],
      elsewhereMeetings: [{ id: "m1", title: "Site visit", starts_at: new Date().toISOString(), location: "Chaweng office" }],
    });
    const around = shelves.shelves.find((s) => s.key === "around")!;
    expect(around.lines[0].text).toContain("not where you are");
    expect(around.lines[0].text).not.toMatch(/\bkm\b|\bminutes away\b/);
  });
});
