import { describe, expect, it } from "vitest";
import { parseVantaBlocks, isStructured, toneOf } from "@/lib/vantaBlocks";

describe("parseVantaBlocks", () => {
  it("keeps a one-liner unstructured", () => {
    const b = parseVantaBlocks("Nothing overdue right now.");
    expect(b).toEqual([{ type: "summary", text: "Nothing overdue right now." }]);
    expect(isStructured(b)).toBe(false);
  });

  it("extracts a lead summary, section, bullets and status rows", () => {
    const b = parseVantaBlocks(`Two things need you today.

Needs attention
- Gym waiver still unsigned
- Overdue: 2 commitments

Next
1. Sign the waiver
2. Call Nikki`);
    expect(b[0]).toEqual({ type: "summary", text: "Two things need you today." });
    const section = b.find((x) => x.type === "section") as any;
    expect(section.title).toBe("Needs attention");
    expect(section.blocks.some((x: any) => x.type === "bullets")).toBe(true);
    expect(section.blocks.some((x: any) => x.type === "status")).toBe(true);
    const next = b.find((x) => x.type === "next") as any;
    expect(next.items).toEqual(["Sign the waiver", "Call Nikki"]);
    expect(isStructured(b)).toBe(true);
  });

  it("detects approval blocks", () => {
    const b = parseVantaBlocks("Staged it.\n\nNeeds approval: send the invoice to Nikki");
    const ap = b.find((x) => x.type === "approval") as any;
    expect(ap.detail).toBe("send the invoice to Nikki");
  });

  it("does not turn prose into a status row", () => {
    const b = parseVantaBlocks("Note: I saved that. It's in Memory now.");
    expect(b.every((x) => x.type !== "status")).toBe(true);
  });

  it("tones by keyword", () => {
    expect(toneOf("2 overdue commitments")).toBe("risk");
    expect(toneOf("waiting on review")).toBe("warn");
    expect(toneOf("all clear")).toBe("good");
    expect(toneOf("three notes")).toBe("neutral");
  });

  it("never throws on empty or partial text", () => {
    expect(parseVantaBlocks("")).toEqual([]);
    expect(() => parseVantaBlocks("## Needs at")).not.toThrow();
  });
});
