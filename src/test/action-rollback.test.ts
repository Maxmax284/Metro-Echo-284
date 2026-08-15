// Rollback honesty: an action may only be reported as undone when the external
// side effect was actually reversed.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  attemptUndo,
  isReversibleKind,
} from "../../supabase/functions/_shared/actionRollback";

const g = globalThis as unknown as { Deno?: unknown; fetch: typeof fetch };
const originalFetch = g.fetch;

// The shared module reads connector keys from Deno.env.
g.Deno = { env: { get: (k: string) => (k === "LOVABLE_API_KEY" ? "key" : "conn") } };

afterEach(() => {
  g.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("isReversibleKind", () => {
  it("knows which executors can be reversed", () => {
    expect(isReversibleKind("telegram")).toBe(true);
    expect(isReversibleKind("google_calendar")).toBe(true);
    expect(isReversibleKind("webhook")).toBe(false);
    expect(isReversibleKind("email")).toBe(false);
    expect(isReversibleKind(null)).toBe(false);
  });
});

describe("attemptUndo", () => {
  it("reports nothing to reverse when no executor ran", async () => {
    const out = await attemptUndo({ executorKind: null, result: {} });
    expect(out.undone).toBe(false);
    expect(out.mode).toBe("none");
  });

  it("is honest that webhooks and email have no undo path", async () => {
    for (const kind of ["webhook", "email"]) {
      const out = await attemptUndo({ executorKind: kind, result: { status: 200 } });
      expect(out.undone).toBe(false);
      expect(out.mode).toBe("unsupported");
    }
  });

  it("deletes the Telegram message and calls it reversed", async () => {
    g.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as never;
    const out = await attemptUndo({
      executorKind: "telegram",
      executorConfig: { chat_id: 42 },
      result: { message_id: 7 },
    });
    expect(out.undone).toBe(true);
    expect(out.mode).toBe("reversed");
  });

  it("fails loudly when Telegram refuses the delete", async () => {
    g.fetch = vi.fn(async () => new Response(JSON.stringify({ description: "too old" }), { status: 400 })) as never;
    const out = await attemptUndo({
      executorKind: "telegram",
      executorConfig: { chat_id: 42 },
      result: { message_id: 7 },
    });
    expect(out.undone).toBe(false);
    expect(out.mode).toBe("failed");
  });

  it("treats an already-deleted calendar event as undone", async () => {
    g.fetch = vi.fn(async () => new Response("", { status: 410 })) as never;
    const out = await attemptUndo({
      executorKind: "google_calendar",
      result: { event_id: "abc", calendar_id: "primary" },
    });
    expect(out.undone).toBe(true);
  });

  it("never throws when the network explodes", async () => {
    g.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as never;
    const out = await attemptUndo({ executorKind: "telegram", executorConfig: { chat_id: 1 }, result: { message_id: 2 } });
    expect(out.mode).toBe("failed");
    expect(out.detail).toContain("network");
  });
});
