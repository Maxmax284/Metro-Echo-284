// The Ask room must own a bounded height, or nothing inside it scrolls: the
// page scrolls as one long document, "Jump to latest" can never appear, and
// Start / Newest quietly do nothing. These are source invariants because the
// bug was structural, not behavioural.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const room = readFileSync("src/components/ask/AskRoom.tsx", "utf8");
const index = readFileSync("src/pages/Index.tsx", "utf8");

describe("Ask room bounds", () => {
  it("claims the viewport below its own top edge", () => {
    expect(room).toMatch(/100dvh/);
  });

  it("stops growing once measured, so flex cannot stretch it back out", () => {
    expect(room).toMatch(/flex-none/);
  });

  it("clips its own overflow so the inner transcript is the scroller", () => {
    expect(room).toMatch(/overflow-hidden/);
  });

  it("wraps the Ask surface in the shell", () => {
    expect(index).toMatch(/<AskRoom>/);
    expect(index).toMatch(/from "@\/components\/ask\/AskRoom"/);
  });
});
