import { describe, expect, it } from "vitest";
import { spokenLabel } from "../../supabase/functions/_shared/awareness/reminders";

describe("a heads-up says the first clause, never the paragraph", () => {
  it("leaves a short title alone", () => {
    expect(spokenLabel("ADHD appointment")).toBe("ADHD appointment");
  });

  it("stops at the first sentence break", () => {
    expect(
      spokenLabel("Last minute jitters: make sure that you have everything put together, go online."),
    ).toBe("Last minute jitters");
  });

  it("cuts a long run-on at a word, with an ellipsis", () => {
    const out = spokenLabel(
      "Get the keys to my storage unit to get books and some wires and things that I need for my tech related job in Thailand",
    );
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(out).toBe("Get the keys to my storage unit to get books and some wires…");
  });

  it("never invents words", () => {
    const raw = "Dentist — Old Town";
    expect(raw.startsWith(spokenLabel(raw).replace("…", ""))).toBe(true);
  });

  it("has something to say about an empty title", () => {
    expect(spokenLabel("   ")).toBe("An untitled calendar entry");
  });
});
