import { describe, it, expect } from "vitest";
import {
  freshnessOf,
  isAmbiguous,
  lastTouchedLabel,
  mergeSnapshot,
  rankWorkCandidates,
  readSnapshot,
  resumePrompt,
  snapshotDeltas,
  toSnapshot,
  workingContextKey,
  type WorkSignal,
} from "@/lib/workingContext";

const NOW = new Date("2026-08-13T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function signal(over: Partial<WorkSignal> = {}): WorkSignal {
  return {
    projectId: "p1",
    projectTitle: "Lamai gym",
    kind: "action",
    at: ago(2 * HOUR),
    label: "Send the waiver update",
    ...over,
  };
}

describe("freshness decay", () => {
  it("classifies by age", () => {
    expect(freshnessOf(ago(HOUR), NOW)).toBe("current");
    expect(freshnessOf(ago(5 * DAY), NOW)).toBe("recent");
    expect(freshnessOf(ago(30 * DAY), NOW)).toBe("stale");
  });

  it("hides recent work with nothing open", () => {
    const out = rankWorkCandidates([signal({ at: ago(5 * DAY), unresolved: false })], { now: NOW });
    expect(out).toHaveLength(0);
  });

  it("keeps recent work when something is still open", () => {
    const out = rankWorkCandidates([signal({ at: ago(5 * DAY), unresolved: true })], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].unresolved).toEqual(["Send the waiver update"]);
  });

  it("hides stale work unless pinned", () => {
    const s = signal({ at: ago(40 * DAY), unresolved: true });
    expect(rankWorkCandidates([s], { now: NOW })).toHaveLength(0);
    expect(rankWorkCandidates([s], { now: NOW, pinned: new Set(["p1"]) })).toHaveLength(1);
  });
});

describe("ranking", () => {
  it("puts unresolved work above stale-but-busy work", () => {
    const out = rankWorkCandidates(
      [
        signal({ projectId: "p1", projectTitle: "A", unresolved: true, hasDueDate: true, at: ago(3 * HOUR) }),
        signal({ projectId: "p2", projectTitle: "B", at: ago(HOUR), kind: "receipt", label: "note created" }),
        signal({ projectId: "p2", projectTitle: "B", at: ago(2 * HOUR), kind: "receipt", label: "note created" }),
      ],
      { now: NOW },
    );
    expect(out[0].projectTitle).toBe("A");
  });

  it("keeps loose work separate from project work", () => {
    const out = rankWorkCandidates(
      [signal({ projectId: null, projectTitle: null, unresolved: true }), signal({ unresolved: true })],
      { now: NOW },
    );
    expect(out.map((c) => c.key).sort()).toEqual(["loose", "p1"]);
  });

  it("respects dismissal windows and resolved marks", () => {
    const s = signal({ unresolved: true });
    expect(rankWorkCandidates([s], { now: NOW, dismissedUntil: { p1: ago(-DAY) } })).toHaveLength(0);
    // an expired dismissal comes back
    expect(rankWorkCandidates([s], { now: NOW, dismissedUntil: { p1: ago(DAY) } })).toHaveLength(1);
    expect(rankWorkCandidates([s], { now: NOW, resolved: new Set(["p1"]) })).toHaveLength(0);
  });

  it("returns an honest empty when there is no signal", () => {
    expect(rankWorkCandidates([], { now: NOW })).toEqual([]);
    expect(resumePrompt([])).toBeNull();
  });
});

describe("ambiguity", () => {
  it("asks which one when two candidates are near-equal", () => {
    const out = rankWorkCandidates(
      [
        signal({ projectId: "p1", projectTitle: "A", unresolved: true, at: ago(2 * HOUR) }),
        signal({ projectId: "p2", projectTitle: "B", unresolved: true, at: ago(2 * HOUR) }),
      ],
      { now: NOW },
    );
    expect(isAmbiguous(out)).toBe(true);
    expect(resumePrompt(out)).toMatch(/Which one\?$/);
  });

  it("commits when one candidate clearly leads", () => {
    const out = rankWorkCandidates(
      [
        signal({ projectId: "p1", projectTitle: "A", unresolved: true, hasDueDate: true }),
        signal({ projectId: "p1", projectTitle: "A", unresolved: true, label: "Second open thing" }),
        signal({ projectId: "p2", projectTitle: "B", at: ago(6 * DAY), unresolved: true, label: "Cold thing" }),
      ],
      { now: NOW },
    );
    expect(isAmbiguous(out)).toBe(false);
    expect(out[0].projectTitle).toBe("A");
  });
});

describe("snapshots", () => {
  it("round-trips through project metadata", () => {
    const [cand] = rankWorkCandidates([signal({ unresolved: true })], { now: NOW });
    const metadata = mergeSnapshot({ other: 1 }, toSnapshot(cand, NOW));
    expect(metadata.other).toBe(1);
    expect(readSnapshot(metadata)?.unresolved).toEqual(["Send the waiver update"]);
    expect(readSnapshot(null)).toBeNull();
    expect(readSnapshot({})).toBeNull();
  });

  it("reports only meaningful deltas", () => {
    const [cand] = rankWorkCandidates(
      [signal({ unresolved: true, label: "New open item" }), signal({ unresolved: false, decision: true, label: "approved run" })],
      { now: NOW },
    );
    const prev = { ...toSnapshot(cand, NOW), unresolved: ["Old open item"], last_decision: null };
    const deltas = snapshotDeltas(prev, cand);
    expect(deltas).toContain("new: New open item");
    expect(deltas).toContain("closed: Old open item");
    expect(deltas.some((d) => d.startsWith("decision:"))).toBe(true);
    expect(snapshotDeltas(null, cand)).toEqual([]);
  });
});

describe("scope isolation", () => {
  it("cache keys always carry scope", () => {
    expect(workingContextKey("personal", "p1")).toBe("personal:working:p1");
    expect(workingContextKey("org:abc", "p1")).not.toBe(workingContextKey("org:def", "p1"));
    expect(workingContextKey("personal", null)).toBe("personal:working:loose");
  });
});

describe("labels", () => {
  it("speaks plainly about when work was touched", () => {
    expect(lastTouchedLabel(ago(10 * 60_000), NOW)).toBe("just now");
    expect(lastTouchedLabel(ago(5 * HOUR), NOW)).toBe("5h ago");
    expect(lastTouchedLabel(ago(DAY), NOW)).toBe("yesterday");
    expect(lastTouchedLabel(ago(4 * DAY), NOW)).toBe("4d ago");
  });
});
