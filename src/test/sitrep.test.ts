// The sitrep brain: pure helpers pinned, and the synthesis itself proven to
// fail soft — a gateway outage must never block or fail a watch check.
import { afterEach, describe, expect, it, vi } from "vitest";
import { firstLine, sitrepFrom, sitrepSourceLines, stripCitations } from "../../supabase/functions/_shared/sitrep";

const HITS = [
  { title: "RID holds Chao Phraya at Bang Sai", url: "https://www.bangkokpost.com/news/1", snippet: "Flow steady." },
  { title: "Pumps running in eastern districts", url: "https://www.thaipbs.or.th/news/2", snippet: "Drainage active." },
  { title: "Bad url row", url: "not-a-url", snippet: "No host." },
];

afterEach(() => vi.unstubAllGlobals());

describe("sitrepSourceLines", () => {
  it("numbers sources and strips www from hosts", () => {
    const out = sitrepSourceLines(HITS);
    expect(out).toContain("Source 1 — RID holds Chao Phraya at Bang Sai (bangkokpost.com)");
    expect(out).toContain("Source 2 — Pumps running in eastern districts (thaipbs.or.th)");
  });

  it("caps at four sources and tolerates a broken url", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      title: `t${i}`, url: `https://h${i}.example.com/x`, snippet: "s",
    }));
    const out = sitrepSourceLines(many);
    expect(out).toContain("Source 4 —");
    expect(out).not.toContain("Source 5 —");
    expect(sitrepSourceLines(HITS)).toContain("Source 3 — Bad url row\nNo host.");
  });
});

describe("firstLine", () => {
  it("takes the first sentence as the headline", () => {
    expect(firstLine("River holds at the gauge. Pumps running. Rain easing Thursday."))
      .toBe("River holds at the gauge.");
  });

  it("flattens newlines and truncates runaway text", () => {
    expect(firstLine("one\ntwo\nthree")).toBe("one two three");
    const long = ` ${"x".repeat(200)}`;
    expect(firstLine(long).length).toBeLessThanOrEqual(140);
  });
});

describe("stripCitations", () => {
  it("drops bracketed source numbers, keeps the words", () => {
    expect(stripCitations("Heavy rain floods Bangkok [1, 2, 3]. Pumps run [4]."))
      .toBe("Heavy rain floods Bangkok. Pumps run.");
  });

  it("leaves uncited text and real brackets alone", () => {
    expect(stripCitations("No movement on that.")).toBe("No movement on that.");
  });
});

describe("sitrepFrom", () => {
  it("returns empty without a key or without hits — never throws", async () => {
    await expect(sitrepFrom("q", [], "key", "voice")).resolves.toBe("");
    await expect(sitrepFrom("q", HITS, "", "voice")).resolves.toBe("");
  });

  it("speaks the model's text when the gateway answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "  River holds. Pumps running. " } }] }),
    })));
    await expect(sitrepFrom("Bangkok flooding?", HITS, "key", "voice"))
      .resolves.toBe("River holds. Pumps running.");
  });

  it("fails soft on a gateway error and on a network throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    await expect(sitrepFrom("q", HITS, "key", "voice")).resolves.toBe("");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(sitrepFrom("q", HITS, "key", "voice")).resolves.toBe("");
  });
});
