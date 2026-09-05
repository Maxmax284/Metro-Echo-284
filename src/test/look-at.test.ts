import { describe, expect, it } from "vitest";
import { LOOK_INTENTS, LOOK_STATES, askAboutLook, isLookableFile, lookIntent } from "@/lib/lookAt";

describe("deliberate camera seam", () => {
  it("offers a small, deliberate set of questions", () => {
    expect(LOOK_INTENTS.length).toBeLessThanOrEqual(5);
    expect(LOOK_INTENTS.map((i) => i.id)).toContain("identify");
  });

  it("falls back to identifying when the intent is unknown", () => {
    expect(lookIntent("nonsense").id).toBe("identify");
    expect(lookIntent(null).id).toBe("identify");
  });

  it("says the camera is off until it is opened", () => {
    expect(LOOK_STATES.idle.toLowerCase()).toContain("off");
    expect(LOOK_STATES.looking).toBe("Vanta is looking");
  });

  it("only looks at pictures", () => {
    expect(isLookableFile({ name: "bike.jpg", type: "image/jpeg" })).toBe(true);
    expect(isLookableFile({ name: "shot.HEIC", type: "" })).toBe(true);
    expect(isLookableFile({ name: "lease.pdf", type: "application/pdf" })).toBe(false);
  });

  it("hands the look on as a question, never as an action", () => {
    const q = askAboutLook("amount", "receipt.jpg");
    expect(q).toContain("receipt.jpg");
    expect(q.endsWith("?")).toBe(true);
  });
});
