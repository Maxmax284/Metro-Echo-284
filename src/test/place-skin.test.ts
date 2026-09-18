import { describe, expect, it } from "vitest";
import { placeSkin } from "@/lib/placeSkin";

describe("placeSkin", () => {
  it("paints Taipei from the city and from the country", () => {
    expect(placeSkin({ city: "Taipei" })).toBe("taipei");
    expect(placeSkin({ country: "TW" })).toBe("taipei");
    expect(placeSkin({ country: "Taiwan" })).toBe("taipei");
  });

  it("paints Bangkok and Tokyo, city over country", () => {
    expect(placeSkin({ city: "Bangkok", country: "Thailand" })).toBe("bangkok");
    expect(placeSkin({ city: "Osaka", country: "Japan" })).toBe("tokyo");
  });

  it("keeps the room's own wall when the place is not on record", () => {
    expect(placeSkin({ city: "Washington", country: "United States" })).toBeNull();
    expect(placeSkin({})).toBeNull();
  });

  it("never repaints on a stale fix", () => {
    expect(placeSkin({ city: "Taipei", stale: true })).toBeNull();
  });
});
