import { describe, it, expect } from "vitest";
import {
  catchUpSummary,
  changedSince,
  clarificationPrompt,
  continuityKey,
  continuityStateOf,
  decisionHistory,
  groundedRelations,
  isContinuityAmbiguous,
  lastActiveLabel,
  mergeContinuitySnapshot,
  rankContinuity,
  readContinuitySnapshot,
  shouldRefreshSnapshot,
  toContinuitySnapshot,
  unresolvedThreads,
  type ContinuitySignal,
} from "@/lib/continuity";

const NOW = new Date("2026-08-13T12:00:00Z").getTime();
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function sig(over: Partial<ContinuitySignal> = {}): ContinuitySignal {
  return {
    projectId: "p1",
    projectTitle: "Lamai gym",
    kind: "action",
    at: ago(2 * DAY),
    label: "Send the waiver update",
    sourceId: "a1",
    ...over,
  };
}

describe("state classification", () => {
  it("uses a longer model than working memory", () => {
    expect(continuityStateOf(ago(DAY), {}, NOW)).toBe("active");
    expect(continuityStateOf(ago(6 * DAY), {}, NOW)).toBe("recent");
    expect(continuityStateOf(ago(30 * DAY), {}, NOW)).toBe("dormant");
    expect(continuityStateOf(ago(120 * DAY), {}, NOW)).toBe("stale");
  });

  it("never calls still-open work stale", () => {
    expect(continuityStateOf(ago(200 * DAY), { unresolved: true }, NOW)).toBe("unresolved-long-term");
  });
});

describe("surfacing rules", () => {
  it("keeps long-dormant unresolved work reachable", () => {
    const out = rankContinuity([sig({ at: ago(45 * DAY), unresolved: true })], { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe("open-items");
  });

  it("stays quiet about dormant work with nothing open", () => {
    expect(rankContinuity([sig({ at: ago(45 * DAY) })], { now: NOW })).toHaveLength(0);
  });

  it("lets a due date, approval or risk break the silence", () => {
    const base = { at: ago(70 * DAY), unresolved: true };
    expect(rankContinuity([sig({ ...base, dueAt: ago(-2 * DAY), hasDueDate: true })], { now: NOW })[0].reason).toBe("due-date");
    expect(rankContinuity([sig({ ...base, pendingApproval: true, at: ago(70 * DAY) })], { now: NOW })[0].reason).toBe(
      "pending-approval",
    );
  });

  it("answers when asked, even about cold work", () => {
    const cold = sig({ at: ago(120 * DAY) });
    expect(rankContinuity([cold], { now: NOW })).toHaveLength(0);
    expect(rankContinuity([cold], { now: NOW, asked: true })).toHaveLength(1);
  });

  it("respects dismissal and finished marks", () => {
    const s = sig({ unresolved: true });
    expect(rankContinuity([s], { now: NOW, dismissedUntil: { p1: ago(-DAY) } })).toHaveLength(0);
    expect(rankContinuity([s], { now: NOW, resolved: new Set(["p1"]) })).toHaveLength(0);
  });
});

describe("ranking by importance, not recency", () => {
  it("puts an overdue obligation above busy fresh chatter", () => {
    const out = rankContinuity(
      [
        sig({ projectId: "p1", projectTitle: "A", unresolved: true, hasDueDate: true, dueAt: ago(3 * DAY), at: ago(20 * DAY) }),
        sig({ projectId: "p2", projectTitle: "B", kind: "note", at: ago(1 * DAY), label: "thought" }),
        sig({ projectId: "p2", projectTitle: "B", kind: "note", at: ago(2 * DAY), label: "another thought" }),
      ],
      { now: NOW },
    );
    expect(out[0].projectTitle).toBe("A");
  });

  it("asks which one when two threads are equally warm", () => {
    const out = rankContinuity(
      [
        sig({ projectId: "p1", projectTitle: "A", unresolved: true }),
        sig({ projectId: "p2", projectTitle: "B", unresolved: true }),
      ],
      { now: NOW },
    );
    expect(isContinuityAmbiguous(out)).toBe(true);
    expect(clarificationPrompt(out)).toMatch(/Which one\?$/);
  });
});

describe("threads, decisions and catch-up", () => {
  const ranked = rankContinuity(
    [
      sig({ unresolved: true, at: ago(30 * DAY), label: "Waiver still unsigned" }),
      sig({ decision: true, at: ago(32 * DAY), label: "approved the price change", rationale: "Nikki signed off" }),
    ],
    { now: NOW },
  );

  it("finds threads that quietly fell off", () => {
    expect(unresolvedThreads(ranked, NOW).map((t) => t.label)).toEqual(["Waiver still unsigned"]);
  });

  it("keeps decisions with their rationale", () => {
    expect(decisionHistory(ranked)[0].rationale).toBe("Nikki signed off");
  });

  it("answers bring-me-up-to-speed in order, honestly", () => {
    const out = catchUpSummary(ranked[0], ["closed: old thing"]);
    expect(out.headline).toMatch(/based on your recorded activity/);
    expect(out.lines[0]).toMatch(/Where it stands/);
    expect(out.lines[1]).toMatch(/What changed/);
    expect(out.lines.some((l) => l.startsWith("Still open:"))).toBe(true);
  });

  it("admits when no decision was captured", () => {
    const bare = rankContinuity([sig({ unresolved: true })], { now: NOW })[0];
    expect(catchUpSummary(bare).lines.join(" ")).toMatch(/none captured/);
  });
});

describe("snapshots", () => {
  const cand = rankContinuity([sig({ unresolved: true })], { now: NOW })[0];

  it("round-trips inside project metadata, scoped", () => {
    const meta = mergeContinuitySnapshot({ other: 1 }, toContinuitySnapshot(cand, "personal", NOW), "personal");
    expect(meta.other).toBe(1);
    expect(readContinuitySnapshot(meta, "personal")?.unresolved).toEqual(["Send the waiver update"]);
    // a snapshot from another scope is invisible here
    expect(readContinuitySnapshot(meta, "org:abc")).toBeNull();
    expect(readContinuitySnapshot(null)).toBeNull();
  });

  it("only refreshes on meaningful movement", () => {
    const snap = toContinuitySnapshot(cand, "personal", NOW);
    expect(shouldRefreshSnapshot(null, cand)).toBe(true);
    expect(shouldRefreshSnapshot({ ...snap, refreshed_at: new Date(NOW).toISOString() }, cand)).toBe(false);
    expect(shouldRefreshSnapshot({ ...snap, unresolved: ["something else"] }, cand)).toBe(true);
  });

  it("reports only meaningful changes", () => {
    const prev = { ...toContinuitySnapshot(cand, "personal", NOW), unresolved: ["Old item"], last_decision: null };
    const deltas = changedSince(prev, cand);
    expect(deltas).toContain("new: Send the waiver update");
    expect(deltas).toContain("closed: Old item");
    expect(changedSince(null, cand)).toEqual([]);
  });
});

describe("cross-project relations", () => {
  it("only links projects that genuinely share a record, and only when it moved", () => {
    const links = [{ projectId: "p1", otherProjectId: "p2", otherTitle: "B", via: "note", at: ago(DAY) }];
    expect(groundedRelations(links, new Set(["p2"])).p1).toHaveLength(1);
    expect(groundedRelations(links, new Set()).p1).toBeUndefined();
  });
});

describe("scope isolation and labels", () => {
  it("always keys the cache by scope", () => {
    expect(continuityKey("personal", "p1")).toBe("personal:continuity:p1");
    expect(continuityKey("org:a", "p1")).not.toBe(continuityKey("org:b", "p1"));
    expect(continuityKey("personal", null)).toBe("personal:continuity:loose");
  });

  it("speaks plainly across long gaps", () => {
    expect(lastActiveLabel(ago(5 * 3_600_000), NOW)).toBe("5h ago");
    expect(lastActiveLabel(ago(DAY), NOW)).toBe("yesterday");
    expect(lastActiveLabel(ago(9 * DAY), NOW)).toBe("9 days ago");
    expect(lastActiveLabel(ago(70 * DAY), NOW)).toBe("about 2 months ago");
  });
});
