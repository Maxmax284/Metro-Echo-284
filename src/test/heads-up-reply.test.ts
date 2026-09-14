// Replying to a heads-up must be the same conversation Echo already keeps —
// one thread bound to the heads-up, readable later, nothing executing on its own.
import { describe, it, expect } from "vitest";
import { suggestionsForContext, contextKindLabel, contextHref } from "@/lib/askCapabilities";
import { RECEIPT_META } from "@/lib/askReceipts";

describe("heads-up replies live in the one Ask engine", () => {
  it("a heads-up is a real thread context with its own suggestions", () => {
    expect(contextKindLabel("nudge")).toBe("Heads-up");
    expect(suggestionsForContext("nudge").length).toBeGreaterThan(0);
  });

  it("a heads-up thread points back at Today, never a new room", () => {
    expect(contextHref("nudge", "n1")).toBe("/?surface=today");
  });

  it("every receipt kind Echo can hand back has words a person can read", () => {
    for (const [kind, meta] of Object.entries(RECEIPT_META)) {
      expect(meta.label, kind).toBeTruthy();
      expect(meta.label.toLowerCase()).not.toContain("intent");
    }
  });
});
