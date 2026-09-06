import { describe, expect, it } from "vitest";
import { bulletText, inlineSpans, stripInlineMarkdown, unescapeMarkdown } from "@/lib/markdownText";

describe("markdown cleanup for exports", () => {
  it("drops bold marks and keeps the words", () => {
    expect(stripInlineMarkdown("**Client:** Southbound Transit Authority"))
      .toBe("Client: Southbound Transit Authority");
  });

  it("unescapes signature underscores", () => {
    expect(unescapeMarkdown("Signature: \\_\\_\\_\\_")).toBe("Signature: ____");
  });

  it("keeps a lone asterisk in prose alone", () => {
    expect(stripInlineMarkdown("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("marks bold spans for Word runs", () => {
    expect(inlineSpans("**Provider:** Wolfe Field Operations")).toEqual([
      { text: "Provider:", bold: true },
      { text: " Wolfe Field Operations", bold: false },
    ]);
  });

  it("reads bullets written with dash, star or dot", () => {
    expect(bulletText("- one")).toBe("one");
    expect(bulletText("* two")).toBe("two");
    expect(bulletText("  • three")).toBe("three");
    expect(bulletText("not a bullet")).toBeNull();
  });
});
