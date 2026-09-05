import { describe, expect, it } from "vitest";
import { defaultOffersFor, kindForObject, objectIntentFor } from "@/lib/objectIntent";

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
