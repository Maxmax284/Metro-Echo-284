// Drift detectors: they must fire on the exact shape that warrants a mention
// and stay silent otherwise. Silence is the default state of this feature.
import { describe, expect, it } from "vitest";
import {
  detectDriftingCommitment,
  detectSilentProject,
  detectUnreadRisk,
  driftScopeTargets,
  isInQuietHours,
  rankDrift,
  scopedDedupeKey,
  type DriftCommitment,
  type DriftProject,
  type DriftRisk,
} from "@/lib/drift";

const NOW = new Date("2026-08-15T12:00:00Z").getTime();
const daysBefore = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const hoursAfter = (n: number) => new Date(NOW + n * 60 * 60 * 1000).toISOString();

describe("detectSilentProject", () => {
  const base: DriftProject = { id: "p1", title: "CampStay", status: "active", updated_at: daysBefore(20), open_items: 3 };

  it("fires when an active project with open work has gone quiet", () => {
    const s = detectSilentProject([base], NOW);
    expect(s?.kind).toBe("project_went_silent");
    expect(s?.related_entity_id).toBe("p1");
    expect(s?.reason).toContain("20 days");
    expect(s?.next_step).toBeTruthy();
  });

  it("stays silent when nothing is open", () => {
    expect(detectSilentProject([{ ...base, open_items: 0 }], NOW)).toBeNull();
  });

  it("stays silent when the project is not active", () => {
    expect(detectSilentProject([{ ...base, status: "archived" }], NOW)).toBeNull();
  });

  it("stays silent inside the quiet window", () => {
    expect(detectSilentProject([{ ...base, updated_at: daysBefore(4) }], NOW)).toBeNull();
  });

  it("picks the quietest project when several qualify", () => {
    const s = detectSilentProject(
      [base, { ...base, id: "p2", title: "Lamai", updated_at: daysBefore(40) }],
      NOW,
    );
    expect(s?.related_entity_id).toBe("p2");
  });
});

describe("detectDriftingCommitment", () => {
  const open: DriftCommitment = {
    id: "c1",
    summary: "Send Nikki the waiver",
    due_at: hoursAfter(200),
    status: "open",
    reschedules: 0,
    last_activity_at: daysBefore(1),
  };

  it("fires on repeated reschedules", () => {
    const s = detectDriftingCommitment([{ ...open, reschedules: 3 }], NOW);
    expect(s?.kind).toBe("commitment_drifting");
    expect(s?.reason).toContain("3 times");
  });

  it("fires when due within 48h with no recent activity", () => {
    const s = detectDriftingCommitment([{ ...open, due_at: hoursAfter(12), last_activity_at: daysBefore(5) }], NOW);
    expect(s?.title).toBe("Due soon, nothing moving");
  });

  it("stays silent when due soon but actively worked", () => {
    expect(
      detectDriftingCommitment([{ ...open, due_at: hoursAfter(12), last_activity_at: daysBefore(0) }], NOW),
    ).toBeNull();
  });

  it("ignores closed commitments", () => {
    expect(detectDriftingCommitment([{ ...open, status: "done", reschedules: 5 }], NOW)).toBeNull();
  });
});

describe("detectUnreadRisk", () => {
  const risk: DriftRisk = { id: "a1", title: "Delete member records", source: "action", created_at: daysBefore(4), seen: false };

  it("fires on the oldest unseen risk", () => {
    const s = detectUnreadRisk([risk, { ...risk, id: "a2", created_at: daysBefore(9) }], NOW);
    expect(s?.related_entity_id).toBe("a2");
    expect(s?.next_step).toContain("nothing runs");
  });

  it("stays silent once acknowledged", () => {
    expect(detectUnreadRisk([{ ...risk, seen: true }], NOW)).toBeNull();
  });

  it("stays silent while still fresh", () => {
    expect(detectUnreadRisk([{ ...risk, created_at: daysBefore(0) }], NOW)).toBeNull();
  });
});

describe("rankDrift", () => {
  it("returns exactly one signal, the highest priority", () => {
    const s = rankDrift([
      detectSilentProject([{ id: "p", title: "P", status: "active", updated_at: daysBefore(30), open_items: 2 }], NOW),
      detectUnreadRisk([{ id: "a", title: "A", source: "action", created_at: daysBefore(5), seen: false }], NOW),
    ]);
    expect(s?.kind).toBe("risk_unread");
  });

  it("returns null when nothing drifted", () => {
    expect(rankDrift([null, null])).toBeNull();
  });
});

describe("quiet hours", () => {
  it("blocks inside a window that crosses midnight", () => {
    expect(isInQuietHours("UTC", "22:00", "07:00", new Date("2026-08-15T23:30:00Z"))).toBe(true);
    expect(isInQuietHours("UTC", "22:00", "07:00", new Date("2026-08-15T03:00:00Z"))).toBe(true);
  });

  it("allows outside the window", () => {
    expect(isInQuietHours("UTC", "22:00", "07:00", new Date("2026-08-15T12:00:00Z"))).toBe(false);
  });

  it("respects the user's timezone, not the server's", () => {
    // 02:00 Bangkok is 19:00 UTC — quiet for the user, awake for the server.
    expect(isInQuietHours("Asia/Bangkok", "22:00", "07:00", new Date("2026-08-15T19:00:00Z"))).toBe(true);
    expect(isInQuietHours("UTC", "22:00", "07:00", new Date("2026-08-15T19:00:00Z"))).toBe(false);
  });

  it("treats an empty window as never quiet", () => {
    expect(isInQuietHours("UTC", "07:00", "07:00", new Date("2026-08-15T07:00:00Z"))).toBe(false);
  });
});

describe("scope isolation of dedupe keys", () => {
  it("keeps the same drift distinct per room and per day", () => {
    expect(scopedDedupeKey("drift_silent:p1", null, "2026-08-15")).toBe("drift_silent:p1:personal:2026-08-15");
    expect(scopedDedupeKey("drift_silent:p1", "org-9", "2026-08-15")).toBe("drift_silent:p1:org-9:2026-08-15");
    expect(scopedDedupeKey("drift_silent:p1", null, "2026-08-16")).not.toBe(
      scopedDedupeKey("drift_silent:p1", null, "2026-08-15"),
    );
  });
});

describe("driftScopeTargets", () => {
  it("always sweeps Personal, even with no workspaces", () => {
    expect(driftScopeTargets([])).toEqual([{ organizationId: null }]);
  });

  it("adds each active workspace once, Personal first", () => {
    expect(driftScopeTargets(["org-a", "org-b", "org-a", null, undefined])).toEqual([
      { organizationId: null },
      { organizationId: "org-a" },
      { organizationId: "org-b" },
    ]);
  });
});

describe("re-proposal gate", () => {
  const now = Date.parse("2026-08-25T00:00:00Z");
  const at = (days: number) => new Date(now - days * 86400000).toISOString();

  it("asks once when nothing was ever said", () => {
    expect(mayRepropose(null, now)).toBe(true);
  });

  it("stays quiet while the same situation is already pending", () => {
    expect(mayRepropose({ status: "pending", created_at: at(30) }, now)).toBe(false);
  });

  it("never re-asks something already acted on", () => {
    expect(mayRepropose({ status: "acted", created_at: at(60) }, now)).toBe(false);
  });

  it("respects a dismissal cooldown before asking again", () => {
    expect(mayRepropose({ status: "dismissed", created_at: at(3) }, now)).toBe(false);
    expect(mayRepropose({ status: "dismissed", created_at: at(8) }, now)).toBe(true);
  });

  it("keys a situation by scope but not by day", () => {
    expect(situationDedupeKey("note_stale:n1", null)).toBe("note_stale:n1:personal");
    expect(situationDedupeKey("note_stale:n1", "org1")).toBe("note_stale:n1:org1");
    expect(situationDedupeKey("note_stale:n1", null)).not.toContain("2026");
  });
});
