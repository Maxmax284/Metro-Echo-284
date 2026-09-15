import { describe, it, expect } from "vitest";
import { searchMatches, landmarks, THREAD_NAV_MIN } from "@/components/ask/ThreadNav";

const msgs = [
  { role: "user", content: "what is happening with the visa call" },
  { role: "assistant", content: "It moved to Thursday." },
  { role: "user", content: "and the Wingate stay" },
  { role: "assistant", content: "Still confirmed for the 14th." },
];

describe("thread navigation", () => {
  it("only appears once a thread is long enough to need it", () => {
    expect(THREAD_NAV_MIN).toBeGreaterThan(4);
  });

  it("matches on every word, in any order, case-insensitively", () => {
    expect(searchMatches(msgs, "VISA call")).toEqual([0]);
    expect(searchMatches(msgs, "call visa")).toEqual([0]);
    expect(searchMatches(msgs, "confirmed")).toEqual([3]);
    expect(searchMatches(msgs, "visa wingate")).toEqual([]);
  });

  it("treats an empty query as no search rather than everything", () => {
    expect(searchMatches(msgs, "   ")).toEqual([]);
  });

  it("uses the person's own asks as landmarks, never Echo's answers", () => {
    const marks = landmarks(msgs);
    expect(marks.map((m) => m.index)).toEqual([0, 2]);
    expect(marks[0].label).toContain("visa call");
  });

  it("shortens a long ask instead of overflowing the list", () => {
    const long = "a".repeat(200);
    const [mark] = landmarks([{ role: "user", content: long }]);
    expect(mark.label.length).toBeLessThanOrEqual(48);
    expect(mark.label.endsWith("…")).toBe(true);
  });

  it("keeps the most recent landmarks when a thread runs long", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ role: "user", content: `ask ${i}` }));
    const marks = landmarks(many);
    expect(marks).toHaveLength(12);
    expect(marks.at(-1)!.label).toBe("ask 39");
  });

  it("skips a blank turn", () => {
    expect(landmarks([{ role: "user", content: "  " }])).toEqual([]);
  });
});
