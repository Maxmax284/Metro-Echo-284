import { describe, it, expect } from "vitest";
import {
  buildAttention,
  groupAttention,
  quietSummary,
  securityLine,
  stateOfDay,
  type DigestAction,
  type DigestCommitment,
  type DigestEvent,
} from "@/lib/todayDigest";
import { needsTypedRunConfirm } from "@/components/actions/ExecuteConfirmDialog";
import { applyScope, toScope } from "@/lib/scope";

const NOW = new Date("2026-08-13T06:00:00Z").getTime();

const commitment = (over: Partial<DigestCommitment> = {}): DigestCommitment => ({
  id: "c1",
  summary: "Send Nikki the waiver update",
  due_at: new Date(NOW - 3600_000).toISOString(),
  priority: "normal",
  ...over,
});

const action = (over: Partial<DigestAction> = {}): DigestAction => ({
  id: "a1",
  title: "Post the schedule change",
  risk: "standard",
  status: "staged",
  updated_at: new Date(NOW).toISOString(),
  ...over,
});

describe("Today attention model", () => {
  it("puts overdue promises and high-risk approvals first", () => {
    const items = buildAttention(
      [commitment(), commitment({ id: "c2", due_at: new Date(NOW + 7200_000).toISOString() })],
      [action(), action({ id: "a2", risk: "high" })],
      NOW,
    );
    expect(items.map((i) => i.id)).toEqual(["c1", "a2", "a1"]);
    expect(items[0].level).toBe("critical");
    expect(items[2].level).toBe("attention");
  });

  it("ignores commitments that are not yet due", () => {
    const items = buildAttention([commitment({ due_at: new Date(NOW + 60_000).toISOString() })], [], NOW);
    expect(items).toHaveLength(0);
  });

  it("routes each item to the surface that owns its approval path", () => {
    const items = buildAttention([commitment()], [action()], NOW);
    expect(items.find((i) => i.kind === "commitment")!.destination).toBe("commitments");
    expect(items.find((i) => i.kind === "action")!.destination).toBe("actions");
  });

  it("groups items by project with the biggest pile first and unassigned last", () => {
    const items = buildAttention(
      [commitment(), commitment({ id: "c2" })],
      [action(), action({ id: "a2" })],
      NOW,
    );
    const groups = groupAttention(items, { c1: "CampStay", c2: "CampStay", a1: "CampStay" });
    expect(groups[0].project).toBe("CampStay");
    expect(groups[0].count).toBe(3);
    expect(groups[groups.length - 1].project).toBeNull();
  });
});

describe("Today security line", () => {
  const ev = (event: string): DigestEvent => ({ id: event, event, entity_type: "x", created_at: new Date(NOW).toISOString() });

  it("stays quiet when there are no Fenrir events", () => {
    expect(securityLine([ev("note.created"), ev("action.executed")]).tone).toBe("good");
  });

  it("reports one unusual event without alarming", () => {
    const r = securityLine([ev("fenrir.access.event")]);
    expect(r.tone).toBe("attention");
    expect(r.line).toContain("No action required");
  });

  it("escalates only on real trouble", () => {
    const r = securityLine([ev("fenrir.security.denied")]);
    expect(r.tone).toBe("critical");
    expect(r.count).toBe(1);
  });
});

describe("Today quiet state", () => {
  it("states facts and never invents work", () => {
    const line = quietSummary({
      commitmentsToday: 2,
      nextLabel: "Prepare CampStay review",
      nextWhen: "today",
      securityTone: "good",
    });
    expect(line).toContain("You're clear right now.");
    expect(line).toContain("2 promises for today.");
    expect(line).toContain("Prepare CampStay review");
    expect(line).not.toMatch(/productivity|maybe|great day/i);
  });

  it("says nothing about security when security needs attention", () => {
    const line = quietSummary({ commitmentsToday: 0, nextLabel: null, nextWhen: null, securityTone: "critical" });
    expect(line).toContain("Nothing promised for today.");
    expect(line).not.toContain("Security looks good");
  });
});

describe("Execute confirmation gate", () => {
  it("lets low-risk reversible actions run with one tap", () => {
    expect(needsTypedRunConfirm("low_reversible")).toBe(false);
  });

  it("requires typed confirmation for standard and high risk", () => {
    expect(needsTypedRunConfirm("standard")).toBe(true);
    expect(needsTypedRunConfirm("high")).toBe(true);
  });
});

describe("Today reads stay scoped", () => {
  function fakeQuery() {
    const calls: string[] = [];
    const q: any = {
      calls,
      eq: (c: string, v: string) => { calls.push(`eq:${c}=${v}`); return q; },
      is: (c: string, v: unknown) => { calls.push(`is:${c}=${String(v)}`); return q; },
    };
    return q;
  }

  it("personal scope reads only rows with no organization", () => {
    const q = fakeQuery();
    applyScope(q, toScope({ kind: "personal" } as any));
    expect(q.calls).toContain("is:organization_id=null");
  });

  it("workspace scope reads only that workspace", () => {
    const q = fakeQuery();
    applyScope(q, toScope({ kind: "workspace", organization_id: "org-1" } as any));
    expect(q.calls).toContain("eq:organization_id=org-1");
  });
});

describe("stateOfDay", () => {
  it("leads with what is past due", () => {
    expect(stateOfDay({ overdue: 2, waitingOnYou: 1, dueToday: 0 })).toBe(
      "2 promises are past their date and one thing is waiting on your approval.",
    );
  });

  it("joins three clauses in plain English", () => {
    expect(stateOfDay({ overdue: 1, waitingOnYou: 2, dueToday: 3 })).toBe(
      "One promise is past its date, 2 things are waiting on your approval and 3 promises land today.",
    );
  });

  it("says nothing is pressing, and what did move", () => {
    expect(stateOfDay({ overdue: 0, waitingOnYou: 0, dueToday: 0, captures: 1 })).toBe(
      "Nothing is pressing and one new capture came in.",
    );
    expect(stateOfDay({ overdue: 0, waitingOnYou: 0, dueToday: 0 })).toBe("Nothing is pressing.");
  });

  it("appends the noticed clause without stacking sentences", () => {
    expect(stateOfDay({ overdue: 0, waitingOnYou: 0, dueToday: 0, noticed: true })).toBe(
      "Nothing is pressing. Vanta noticed something worth a look.",
    );
    expect(stateOfDay({ overdue: 1, waitingOnYou: 0, dueToday: 0, noticed: true })).toBe(
      "One promise is past its date. Vanta also noticed something worth a look.",
    );
  });
});
