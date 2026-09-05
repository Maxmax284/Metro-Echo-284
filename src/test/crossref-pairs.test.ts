import { describe, expect, it } from "vitest";
import { nameStem, proposeReading, type ReadableSource } from "@/lib/crossrefPairs";

const now = Date.parse("2026-09-05T04:00:00Z");
const f = (over: Partial<ReadableSource>): ReadableSource => ({
  id: Math.random().toString(36).slice(2),
  filename: "a.jpg",
  mime_type: "image/jpeg",
  source: "telegram",
  created_at: new Date(now - 60_000).toISOString(),
  readable: true,
  ...over,
});

describe("crossrefPairs", () => {
  it("never proposes from a single source", () => {
    expect(proposeReading([f({})], now)).toBeNull();
  });

  it("ignores sources nothing was read off", () => {
    expect(proposeReading([f({ readable: false }), f({ readable: false })], now)).toBeNull();
  });

  it("pairs sources named the same thing", () => {
    const p = proposeReading([f({ filename: "weigh-in sheet (1).jpg" }), f({ filename: "weigh-in sheet.jpg" })], now);
    expect(p?.signal).toBe("same_name");
    expect(p?.fileIds).toHaveLength(2);
  });

  it("pairs sources that arrived together from the same door", () => {
    const p = proposeReading([f({ filename: "one.jpg" }), f({ filename: "two.jpg" })], now);
    expect(p?.signal).toBe("same_arrival");
    expect(p?.reason).toContain("Telegram");
  });

  it("stays quiet when arrivals are far apart and unrelated", () => {
    const old = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      proposeReading([f({ filename: "one.jpg" }), f({ filename: "two.pdf", mime_type: "application/pdf", created_at: old })], now),
    ).toBeNull();
  });

  it("strips counters from names", () => {
    expect(nameStem("invoice-2 (1).pdf")).toBe("invoice");
  });
});
