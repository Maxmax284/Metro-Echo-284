import { describe, expect, it } from "vitest";
import { isStampedPlaceLabel, placeDisplayLabel } from "@/lib/placeLabels";

describe("saved place labels", () => {
  it("leaves a name you chose alone", () => {
    expect(placeDisplayLabel("Wingate Chantilly")).toBe("Wingate Chantilly");
    expect(isStampedPlaceLabel("Wingate Chantilly")).toBe(false);
  });

  it("shortens a machine-stamped pin so it fits a phone", () => {
    const out = placeDisplayLabel("Spot 8/29/2026, 4:47:45 AM");
    expect(isStampedPlaceLabel("Spot 8/29/2026, 4:47:45 AM")).toBe(true);
    expect(out.startsWith("Spot · ")).toBe(true);
    expect(out).not.toContain(":45");
    expect(out.length).toBeLessThan(24);
  });

  it("does not treat a word-plus-text name as a stamp", () => {
    expect(placeDisplayLabel("Spot behind the gym")).toBe("Spot behind the gym");
  });

  it("handles empty and padded input", () => {
    expect(placeDisplayLabel("  ")).toBe("");
    expect(placeDisplayLabel("  Home  ")).toBe("Home");
  });
});
