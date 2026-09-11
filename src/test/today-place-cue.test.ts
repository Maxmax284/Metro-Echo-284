import { describe, expect, it } from "vitest";
import { distanceClause, meetingContextClause, readPlaceCue, weatherClauseFor } from "@/lib/todayContext";

const NOW = new Date("2026-09-09T14:00:00Z").getTime();
const base = { name: "Chantilly", age: "10 minutes ago", stale: false, lineCount: 2 };

describe("readPlaceCue", () => {
  it("stays silent on a quiet day", () => {
    expect(readPlaceCue({ ...base, lineCount: 0 }).show).toBe(false);
  });

  it("stays silent when there is no name it is allowed to say", () => {
    expect(readPlaceCue({ ...base, name: null }).show).toBe(false);
    expect(readPlaceCue({ ...base, name: "   " }).show).toBe(false);
  });

  it("grounds the read only when place changed the answer", () => {
    expect(readPlaceCue(base).show).toBe(false);
    const cue = readPlaceCue({ ...base, explainsRead: true });
    expect(cue.show).toBe(true);
    expect(cue.reason).toBe("grounds");
    expect(cue.where).toBe("Chantilly");
    expect(cue.freshness).toBeNull();
  });

  it("says how old an aging fix is instead of fading it", () => {
    const cue = readPlaceCue({ ...base, stale: true, age: "3 hours ago", explainsRead: true });
    expect(cue.show).toBe(true);
    expect(cue.freshness).toBe("last confirmed 3 hours ago");
    expect(cue.stale).toBe(true);
  });

  it("will not lean on a stale fix that explains nothing", () => {
    expect(readPlaceCue({ ...base, stale: true }).show).toBe(false);
  });

  it("does not announce location just because nearby content exists", () => {
    expect(readPlaceCue({ ...base, lineCount: 0, boardLines: 8 }).show).toBe(false);
    expect(readPlaceCue({ ...base, lineCount: 2, boardLines: 8 }).show).toBe(false);
  });

  it("flips once on a recorded move, and only a real one", () => {
    const moved = readPlaceCue({ ...base, movedFrom: "Ko Samui" });
    expect(moved.reason).toBe("moved");
    expect(moved.transition).toEqual({ from: "Ko Samui", to: "Chantilly" });
    expect(readPlaceCue({ ...base, movedFrom: "Chantilly" }).transition).toBeNull();
  });

  it("speaks for a running trip or a drifted clock even on a quiet board", () => {
    expect(readPlaceCue({ ...base, lineCount: 0, tripActive: true }).reason).toBe("trip");
    expect(readPlaceCue({ ...base, lineCount: 0, timezoneDrift: true }).reason).toBe("clock");
  });

  it("simplifies under pressure rather than adding to the screen", () => {
    const cue = readPlaceCue({ ...base, stale: true, age: "3 hours ago", explainsRead: true, movedFrom: "Ko Samui", pressure: true });
    expect(cue.simplified).toBe(true);
    expect(cue.transition).toBeNull();
    expect(cue.freshness).toBeNull();
    expect(cue.where).toBe("Chantilly");
  });
});

describe("bundled meeting context", () => {
  it("measures distance, and never invents travel time", () => {
    expect(distanceClause(120)).toBe("you're already there");
    expect(distanceClause(6400)).toBe("about 6.4 km from where you are");
    expect(distanceClause(null)).toBeNull();
    expect(distanceClause(undefined)).toBeNull();
    expect(distanceClause(4200)).not.toMatch(/min/);
  });

  it("only mentions weather when a recorded hour is actually wet", () => {
    const starts = new Date(NOW + 60 * 60 * 1000).toISOString();
    expect(weatherClauseFor(starts, [{ at: new Date(NOW).toISOString(), condition: "clear" }])).toBeNull();
    const wet = weatherClauseFor(starts, [{ at: new Date(NOW + 30 * 60 * 1000).toISOString(), condition: "rain" }], NOW);
    expect(wet).toContain("rain around");
  });

  it("folds four facts into one clause, or none", () => {
    const starts = new Date(NOW + 60 * 60 * 1000).toISOString();
    const clause = meetingContextClause({
      startsAt: starts,
      distanceM: 5000,
      forecast: [{ at: new Date(NOW + 30 * 60 * 1000).toISOString(), condition: "showers" }],
      now: NOW,
    });
    expect(clause).toBe("about 5 km from where you are, showers around 14:30");
    expect(meetingContextClause({ startsAt: starts, now: NOW })).toBeNull();
  });
});
