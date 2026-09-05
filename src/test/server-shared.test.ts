// Characterization tests for the shared edge-function backend spine.
// These helpers now carry the responsibility that used to be copy-pasted into
// ~34 functions, so they get the tightest coverage.

import { describe, expect, it, vi } from "vitest";
import { CORS_HEADERS, jsonResponse, okResponse, preflight } from "../../supabase/functions/_shared/http";
import {
  failure,
  messageFor,
  providerFailureKind,
  statusFor,
  unauthorized,
} from "../../supabase/functions/_shared/errors";
import { buildAuditEnvelope, writeAuditEvent } from "../../supabase/functions/_shared/auditEvent";
import {
  applyServerScope,
  assertScopeAccess,
  bearerToken,
  resolveScopeContext,
  resolveUser,
  serverScopeFields,
  toServerScope,
} from "../../supabase/functions/_shared/authContext";
import { parseJsonBlock } from "../../supabase/functions/_shared/aiGateway";
import { persistBriefDraft, receiptAppendix, signalsHash } from "../../supabase/functions/_shared/briefCore";

const req = (init: RequestInit = {}) => new Request("https://x.test/fn", init);

describe("http layer", () => {
  it("answers preflight with CORS only", async () => {
    const res = preflight(req({ method: "OPTIONS" }));
    expect(res?.status).toBe(200);
    expect(res?.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("passes non-preflight requests through", () => {
    expect(preflight(req({ method: "POST" }))).toBeNull();
  });

  it("stamps json + cors on every response", async () => {
    const res = jsonResponse({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe(CORS_HEADERS["Access-Control-Allow-Headers"]);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("okResponse always carries ok:true", async () => {
    expect(await okResponse({ count: 2 }).json()).toEqual({ ok: true, count: 2 });
  });
});

describe("error vocabulary", () => {
  it("maps every kind to a stable status", () => {
    expect(statusFor("unauthorized")).toBe(401);
    expect(statusFor("forbidden")).toBe(403);
    expect(statusFor("invalid_input")).toBe(400);
    expect(statusFor("not_found")).toBe(404);
    expect(statusFor("provider_disabled")).toBe(503);
    expect(statusFor("budget_exceeded")).toBe(402);
    expect(statusFor("rate_limited")).toBe(429);
    expect(statusFor("provider_failed")).toBe(502);
    expect(statusFor("internal")).toBe(500);
  });

  it("keeps client copy in Metro Echo voice", () => {
    for (const kind of ["unauthorized", "rate_limited", "internal", "budget_exceeded"] as const) {
      const msg = messageFor(kind);
      expect(msg).not.toMatch(/!/);
      expect(msg.length).toBeGreaterThan(8);
    }
  });

  it("normalizes provider statuses", () => {
    expect(providerFailureKind(429)).toBe("rate_limited");
    expect(providerFailureKind(402)).toBe("budget_exceeded");
    expect(providerFailureKind(401)).toBe("provider_disabled");
    expect(providerFailureKind(500)).toBe("provider_failed");
  });

  it("never leaks provider detail into failure bodies", async () => {
    const body = await failure("provider_failed").json();
    expect(body).toEqual({ error: "provider_failed", message: messageFor("provider_failed") });
    expect(unauthorized().status).toBe(401);
  });

  it("returns validation details only when given", async () => {
    const body = await failure("invalid_input", { title: ["required"] }).json();
    expect(body.details).toEqual({ title: ["required"] });
  });
});

describe("audit envelope", () => {
  it("builds the canonical row with scope and transition", () => {
    const row = buildAuditEnvelope({
      actor: "u1",
      organizationId: "org1",
      entityType: "action",
      entityId: "a1",
      event: "action.executed",
      source: "actions-execute",
      previousState: "approved",
      nextState: "executed",
      success: true,
      metadata: { risk: "standard" },
    });
    expect(row).toEqual({
      user_id: "u1",
      organization_id: "org1",
      entity_type: "action",
      entity_id: "a1",
      event: "action.executed",
      payload: { risk: "standard", source: "actions-execute", from: "approved", to: "executed", success: true },
    });
  });

  it("defaults scope to personal and omits absent transitions", () => {
    const row = buildAuditEnvelope({ actor: "u1", entityType: "brief", event: "brief.generated" });
    expect(row.organization_id).toBeNull();
    expect(row.entity_id).toBeNull();
    expect(row.payload).toEqual({});
  });

  it("writes failure receipts too, and never throws", async () => {
    const insert = vi.fn().mockResolvedValue({});
    const db = { from: vi.fn(() => ({ insert })) };
    await writeAuditEvent(db as never, {
      actor: "u1",
      entityType: "action",
      event: "action.failed",
      success: false,
    });
    expect(db.from).toHaveBeenCalledWith("audit_log");
    expect(insert.mock.calls[0][0].payload.success).toBe(false);

    const boom = { from: () => ({ insert: () => Promise.reject(new Error("down")) }) };
    await expect(
      writeAuditEvent(boom as never, { actor: "u1", entityType: "x", event: "y" }),
    ).resolves.toBeUndefined();
  });
});

describe("server scope context", () => {
  const authedClient = (userId: string | null, member = true) => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
    from: vi.fn(() => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: member ? { id: "m1" } : null }),
      };
      return chain;
    }),
  });

  it("reads the bearer token", () => {
    expect(bearerToken(req({ headers: { Authorization: "Bearer abc" } }))).toBe("abc");
    expect(bearerToken(req())).toBe("");
  });

  it("resolves the caller or null", async () => {
    expect(await resolveUser(req(), authedClient("u1") as never)).toEqual({ id: "u1" });
    expect(await resolveUser(req(), authedClient(null) as never)).toBeNull();
  });

  it("normalizes scope shape", () => {
    expect(toServerScope(null)).toEqual({ type: "personal", organizationId: null });
    expect(toServerScope("org1")).toEqual({ type: "organization", organizationId: "org1" });
  });

  it("passes personal scope and checks workspace membership", async () => {
    expect(await assertScopeAccess(authedClient("u1") as never, "u1", toServerScope(null))).toBe(true);
    expect(await assertScopeAccess(authedClient("u1") as never, "u1", toServerScope("org1"))).toBe(true);
    expect(await assertScopeAccess(authedClient("u1", false) as never, "u1", toServerScope("org1"))).toBe(false);
  });

  it("falls back to personal instead of leaking a foreign workspace", async () => {
    const ctx = await resolveScopeContext(req(), authedClient("u1", false) as never, "org-not-mine");
    expect(ctx).toEqual({ userId: "u1", scope: { type: "personal", organizationId: null } });
  });

  it("returns null with no session", async () => {
    expect(await resolveScopeContext(req(), authedClient(null) as never, null)).toBeNull();
  });

  it("filters reads and stamps writes per room", () => {
    const calls: string[] = [];
    const q: any = {
      eq: (c: string, v: unknown) => { calls.push(`eq:${c}:${v}`); return q; },
      is: (c: string, v: unknown) => { calls.push(`is:${c}:${v}`); return q; },
    };
    applyServerScope(q, toServerScope("org1"));
    applyServerScope(q, toServerScope(null));
    expect(calls).toEqual(["eq:organization_id:org1", "is:organization_id:null"]);
    expect(serverScopeFields(toServerScope("org1"))).toEqual({ organization_id: "org1" });
    expect(serverScopeFields(toServerScope(null))).toEqual({ organization_id: null });
  });
});

describe("ai gateway helpers", () => {
  it("parses fenced and bare json, and fails soft", () => {
    expect(parseJsonBlock('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonBlock('{"a":2}')).toEqual({ a: 2 });
    expect(parseJsonBlock('noise {"a":3} trailing')).toEqual({ a: 3 });
    expect(parseJsonBlock("not json at all")).toBeNull();
  });
});

describe("brief core", () => {
  it("hashes signals stably and shortly", async () => {
    const a = await signalsHash({ x: 1 });
    const b = await signalsHash({ x: 1 });
    const c = await signalsHash({ x: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(24);
  });

  it("builds the receipt appendix in the legacy shape", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ id: `a${i}`, event: "e", created_at: "2026-01-01" }));
    const appendix = receiptAppendix(rows);
    expect(appendix).toHaveLength(12);
    expect(appendix[0]).toEqual({ kind: "audit", id: "a0", label: "e · 2026-01-01" });
  });

  it("persists a draft with scope and returns the id", async () => {
    let inserted: any = null;
    const db = {
      from: () => ({
        insert: (row: any) => {
          inserted = row;
          return { select: () => ({ maybeSingle: async () => ({ data: { id: "be1" }, error: null }) }) };
        },
      }),
    };
    const id = await persistBriefDraft(db as never, {
      userId: "u1",
      organizationId: "org1",
      format: "weekly_review",
      scopeKind: "recap_weekly",
      title: "Weekly recap",
      brief: { sections: [] },
    });
    expect(id).toBe("be1");
    expect(inserted).toMatchObject({
      user_id: "u1",
      organization_id: "org1",
      status: "draft",
      scope_kind: "recap_weekly",
      format: "weekly_review",
      subtitle: null,
    });
  });
});
