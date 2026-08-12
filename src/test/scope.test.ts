// Scope contract tests — the P0 guarantee: Personal never sees workspace rows,
// a workspace never sees Personal rows, and new records are born in the room
// the user is standing in.
import { describe, expect, it, vi } from "vitest";
import {
  applyScope,
  matchesScope,
  scopeFields,
  scopeKey,
  stripScope,
  toScope,
  withScope,
} from "@/lib/scope";

const personal = toScope({ kind: "personal" });
const org = toScope({ kind: "workspace", organization_id: "org-1" });
const admin = toScope({ kind: "admin" });

function fakeQuery() {
  const calls: Array<[string, string, unknown]> = [];
  const q: any = {
    eq: vi.fn((c: string, v: unknown) => { calls.push(["eq", c, v]); return q; }),
    is: vi.fn((c: string, v: unknown) => { calls.push(["is", c, v]); return q; }),
    calls,
  };
  return q;
}

describe("scope reads", () => {
  it("personal filters organization_id IS NULL", () => {
    const q = fakeQuery();
    applyScope(q, personal);
    expect(q.calls).toEqual([["is", "organization_id", null]]);
  });

  it("workspace filters the active organization", () => {
    const q = fakeQuery();
    applyScope(q, org);
    expect(q.calls).toEqual([["eq", "organization_id", "org-1"]]);
  });

  it("admin applies no organization filter", () => {
    const q = fakeQuery();
    applyScope(q, admin);
    expect(q.calls).toEqual([]);
  });
});

describe("scope writes", () => {
  it("personal inserts carry a null organization", () => {
    expect(scopeFields(personal)).toEqual({ organization_id: null });
  });

  it("workspace inserts carry the active organization", () => {
    expect(withScope({ body: "hi" }, org)).toEqual({ body: "hi", organization_id: "org-1" });
  });

  it("updates cannot move a record between rooms", () => {
    expect(stripScope({ body: "hi", organization_id: "org-9", user_id: "u1" })).toEqual({ body: "hi" });
  });
});

describe("scope guards", () => {
  it("rejects workspace rows in personal scope", () => {
    expect(matchesScope({ organization_id: "org-1" }, personal)).toBe(false);
    expect(matchesScope({ organization_id: null }, personal)).toBe(true);
  });

  it("rejects other workspaces' rows", () => {
    expect(matchesScope({ organization_id: "org-2" }, org)).toBe(false);
    expect(matchesScope({ organization_id: "org-1" }, org)).toBe(true);
    expect(matchesScope({ organization_id: null }, org)).toBe(false);
  });

  it("admin sees everything", () => {
    expect(matchesScope({ organization_id: "org-3" }, admin)).toBe(true);
  });

  it("cache keys differ per room", () => {
    expect(scopeKey(personal)).not.toEqual(scopeKey(org));
    expect(scopeKey(org)).toBe("org:org-1");
  });
});
