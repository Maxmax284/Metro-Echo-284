import { describe, expect, it } from "vitest";
import { buildCadence } from "@/lib/baseline";
import { quietLine, readSituation, unknownLine, type SituationInput } from "@/lib/situation";

const day = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();

const empty: SituationInput = {
  overdue: [],
  dueSoon: [],
  waitingOnYou: [],
  arrived: [],
  noticed: [],
  meetings: [],
  projects: [],
};

describe("situation: one read, not five reports", () => {
  it("says nothing needs you rather than counting zeros", () => {
    const read = readSituation(empty);
    expect(read.lines).toHaveLength(0);
    expect(read.headline).toBe("Nothing needs you right now.");
    expect(quietLine(read.quietSources)).toMatch(/Nothing waiting in/);
  });

  it("ranks a late promise above a fresh capture", () => {
    const read = readSituation({
      ...empty,
      overdue: [{ id: "c1", summary: "Send Nikki the roster", due_at: at(2) }],
      arrived: [{ id: "f1", label: "roster.pdf", at: at(0), via: "Telegram" }],
    });
    expect(read.lines[0].kind).toBe("overdue");
    expect(read.headline).toBe("Something you promised is late.");
  });

  it("never shows more than three lines", () => {
    const read = readSituation({
      ...empty,
      overdue: [{ id: "c1", summary: "A", due_at: at(1) }],
      waitingOnYou: [{ id: "a1", title: "B", updated_at: at(0) }],
      dueSoon: [{ id: "c2", summary: "C", due_at: at(-1) }],
      noticed: [{ id: "n1", title: "D", reason: "because", at: at(0) }],
      arrived: [{ id: "f1", label: "E", at: at(0) }],
      meetings: [{ id: "m1", title: "Standup", starts_at: new Date(Date.now() + 30 * 60_000).toISOString() }],
    });
    expect(read.lines.length).toBe(3);
  });

  it("stays quiet about a project with no learned baseline", () => {
    const read = readSituation({
      ...empty,
      projects: [{ id: "p1", title: "Fight card", lastEventAt: at(40), cadence: null }],
    });
    expect(read.lines.some((l) => l.kind === "went_unusually_quiet")).toBe(false);
  });

  it("flags an unusually quiet project and carries its evidence", () => {
    const cadence = buildCadence([at(12), at(9), at(6), at(3)])!;
    const read = readSituation({
      ...empty,
      projects: [{ id: "p1", title: "Fight card", lastEventAt: at(40), cadence }],
    });
    const line = read.lines.find((l) => l.kind === "went_unusually_quiet");
    expect(line).toBeTruthy();
    expect(line!.baseline?.verdict).toBe("unusual");
    expect(line!.reason.length).toBeGreaterThan(0);
    expect(line!.entity).toEqual({ type: "project", id: "p1" });
  });

  it("reports an unreadable source as missing, not as quiet", () => {
    const read = readSituation({ ...empty, unknownSources: ["calendar"] });
    expect(read.quietSources).not.toContain("calendar");
    expect(unknownLine(read.unknownSources)).toMatch(/No reading from Calendar/);
  });

  it("gives every line a source, a reason and a freshness stamp", () => {
    const read = readSituation({
      ...empty,
      waitingOnYou: [{ id: "a1", title: "Draft reply to Nikki", updated_at: at(0) }],
    });
    for (const line of read.lines) {
      expect(line.source).toBeTruthy();
      expect(line.reason).toBeTruthy();
      expect(line.at).toBeTruthy();
    }
  });
});
