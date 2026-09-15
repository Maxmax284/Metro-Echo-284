import { describe, it, expect } from "vitest";
import {
  findNotes, recentNotes, formatNoteHits, matteredLine, whatWasDecided,
} from "../../supabase/functions/_shared/noteReads";
import { newLayers, mergeLayers, extractSignals } from "@/lib/captureLayers";

/** Minimal query-builder stand-in: records the chain, returns the rows given. */
function fakeSb(rows: Record<string, unknown>[]) {
  const calls: string[] = [];
  const builder: any = {
    select: () => builder,
    eq: (c: string) => { calls.push(`eq:${c}`); return builder; },
    is: (c: string) => { calls.push(`is:${c}`); return builder; },
    or: (q: string) => { calls.push(`or:${q}`); return builder; },
    order: () => builder,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { sb: { from: (t: string) => { calls.push(`from:${t}`); return builder; } }, calls };
}

function noteRow(overrides: Record<string, unknown> = {}) {
  const layers = mergeLayers(
    newLayers({ text: "we decided to move the visa call. I will email Dani tomorrow.", mode: "conversation", captured_at: "2026-09-10T12:00:00.000Z" }),
    { mattered: extractSignals("we decided to move the visa call. I will email Dani tomorrow.") },
  );
  return {
    id: "n1",
    title: "Visa call",
    body: "we decided to move the visa call",
    metadata: { layers },
    created_at: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("noteReads", () => {
  it("scopes personal reads to a null organization", async () => {
    const { sb, calls } = fakeSb([]);
    await findNotes(sb, { userId: "u1", orgId: null }, "visa");
    expect(calls).toContain("eq:user_id");
    expect(calls).toContain("is:organization_id");
  });

  it("scopes workspace reads to the workspace", async () => {
    const { sb, calls } = fakeSb([]);
    await findNotes(sb, { userId: "u1", orgId: "org1" }, "visa");
    expect(calls).toContain("eq:organization_id");
    expect(calls.some((c) => c.startsWith("is:"))).toBe(false);
  });

  it("returns nothing for an empty query without touching the table", async () => {
    const { sb, calls } = fakeSb([noteRow()]);
    expect(await findNotes(sb, { userId: "u1", orgId: null }, "   ")).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("reads the clean layer, and reports what was recorded as mattering", async () => {
    const { sb } = fakeSb([noteRow()]);
    const hits = await findNotes(sb, { userId: "u1", orgId: null }, "visa");
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Visa call");
    expect(hits[0].mattered).not.toBeNull();
    expect(matteredLine(hits[0].mattered!)).toContain("decided");
  });

  it("says plainly when nothing matches", async () => {
    const { sb } = fakeSb([]);
    const hits = await recentNotes(sb, { userId: "u1", orgId: null });
    expect(formatNoteHits(hits, "visa")).toContain("No note mentions");
    expect(formatNoteHits(hits)).toContain("no captured notes");
  });

  it("pulls follow-ups only from recorded layers", async () => {
    const { sb } = fakeSb([noteRow()]);
    const text = await whatWasDecided(sb, { userId: "u1", orgId: null }, { want: "followUps" });
    expect(text.toLowerCase()).toContain("dani");
  });

  it("never invents an interpretation for a note that has none", async () => {
    const { sb } = fakeSb([noteRow({ metadata: {} })]);
    const text = await whatWasDecided(sb, { userId: "u1", orgId: null });
    expect(text).toContain("no recorded decisions");
  });
});
