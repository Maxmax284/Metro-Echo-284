// offlineOutbox rules, pinned:
//   1. A write made with no signal is parked on the device with its minted id.
//   2. Replay inserts with that same id — a duplicate-key answer means the
//      record already landed and must not be written again.
//   3. A network failure mid-flush keeps the rest of the queue for the next
//      reconnect.
import { beforeEach, describe, expect, it, vi } from "vitest";

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
let nextError: { code?: string; message?: string } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        const error = nextError;
        nextError = null;
        const result = Promise.resolve({ data: error ? null : row, error });
        return Object.assign(result, {
          select: () => ({ single: () => Promise.resolve({ data: { id: "audit-1" }, error: null }) }),
        });
      },
    }),
  },
}));

vi.mock("@/lib/vantaVoice", () => ({
  vantaToast: { message: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

const { insertWithOutbox, flushOutbox, readOutbox, outboxCount } = await import("@/lib/offlineOutbox");

const row = { user_id: "u1", title: "Test", body: "Body" };

describe("offlineOutbox", () => {
  beforeEach(() => {
    localStorage.clear();
    inserts.length = 0;
    nextError = null;
  });

  it("parks a write made with no signal, with the id minted on the device", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const outcome = await insertWithOutbox("notes", row, { label: "Parked note" });
    expect(outcome).toMatchObject({ queued: true });
    const held = readOutbox();
    expect(held).toHaveLength(1);
    expect(held[0].row.id).toBe(outcome.id);
    expect(inserts).toHaveLength(0);
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("replays with the same id — a duplicate key is recognised, never re-written", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const outcome = await insertWithOutbox("notes", row, { label: "Parked note" });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    nextError = { code: "23505", message: "duplicate key value violates unique constraint" };
    const synced = await flushOutbox();
    expect(synced).toBe(1);
    expect(inserts[0].row.id).toBe(outcome.id);
    expect(outboxCount()).toBe(0);
  });

  it("keeps the rest of the queue when the network drops mid-flush", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await insertWithOutbox("notes", { ...row, title: "One" }, { label: "One" });
    await insertWithOutbox("notes", { ...row, title: "Two" }, { label: "Two" });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    nextError = { message: "Failed to fetch" };
    const synced = await flushOutbox();
    expect(synced).toBe(0);
    expect(outboxCount()).toBe(2);
  });

  it("a clean flush lands every held record exactly once", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await insertWithOutbox("notes", { ...row, title: "One" }, { label: "One" });
    await insertWithOutbox("commitments", { user_id: "u1", summary: "Two" }, { label: "Two" });
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });

    const synced = await flushOutbox();
    expect(synced).toBe(2);
    expect(inserts.map((i) => i.table)).toEqual(["notes", "commitments"]);
    expect(outboxCount()).toBe(0);
  });
});
