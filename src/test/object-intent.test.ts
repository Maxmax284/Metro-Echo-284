import { describe, expect, it } from "vitest";
import { defaultOffersFor, kindForObject, nextStepsLine, objectIntentFor, readSummaryLine } from "@/lib/objectIntent";

describe("object intent", () => {
  it("trusts the detected type first", () => {
    expect(kindForObject({ filename: "photo.jpg", detectedDocType: "receipt" })).toBe("receipt");
    expect(kindForObject({ filename: "x.pdf", detectedDocType: "rental_agreement" })).toBe("contract");
  });

  it("falls back to the filename, then mime, then plain file", () => {
    expect(kindForObject({ filename: "grab-receipt-march.png" })).toBe("receipt");
    expect(kindForObject({ filename: "Screenshot 2026-09-01.png" })).toBe("screenshot");
    expect(kindForObject({ filename: "IMG_2041.jpg", mime: "image/jpeg" })).toBe("photo");
    expect(kindForObject({ filename: "notes.bin" })).toBe("file");
  });

  it("says when it is not sure", () => {
    const low = objectIntentFor({ filename: "a.pdf", detectedDocType: "receipt", confidence: "low" });
    expect(low.line).toBe("Looks like a receipt, but I'm not sure.");
    const sure = objectIntentFor({ filename: "a.pdf", detectedDocType: "receipt", confidence: "high" });
    expect(sure.line).toBe("Looks like a receipt.");
  });

  it("never claims certainty — always looks like, never is", () => {
    for (const kind of ["receipt", "invoice", "contract", "document", "photo", "file"] as const) {
      expect(objectIntentFor({ detectedDocType: kind }).line).toMatch(/^Looks like/);
    }
  });

  it("offers stay plain and never include sending", () => {
    const offers = defaultOffersFor("receipt").join(" ").toLowerCase();
    expect(offers).toContain("total");
    expect(offers).not.toContain("send");
    expect(defaultOffersFor("contract")).toContain("Summarize it");
  });
});

describe("object intent — next steps and read summary", () => {
  it("says what can happen next in one plain sentence, with no promises", () => {
    const line = nextStepsLine("receipt");
    expect(line.startsWith("What can I do next?")).toBe(true);
    expect(line).toContain("read the total");
    expect(line).toContain("nothing runs on its own");
    expect(line.toLowerCase()).not.toContain("send");
  });

  it("quotes a short read, trims a long one, and admits an empty one", () => {
    expect(readSummaryLine("  Total  49.50 THB ")).toBe("Total 49.50 THB");
    expect(readSummaryLine(null)).toBe("Nothing readable came off it, so I didn't guess.");
    expect(readSummaryLine("x".repeat(50), 10).endsWith("…")).toBe(true);
    expect(readSummaryLine("x".repeat(50), 10).length).toBe(10);
  });
});
