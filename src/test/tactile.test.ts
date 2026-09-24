import { describe, it, expect } from "vitest";
import { isFreshReceipt, stickerFor, stickerTilt } from "@/lib/tactile";

const NOW = Date.parse("2026-09-24T00:00:00Z");
describe("project stickers", () => {
  it("maps real fields to one state", () => {
    expect(stickerFor({ status: "archived" }, NOW)).toBe("DONE");
    expect(stickerFor({ status: "active", needsYou: true }, NOW)).toBe("NEEDS YOU");
    expect(stickerFor({ status: "active", updated_at: "2026-08-01T00:00:00Z" }, NOW)).toBe("QUIET");
    expect(stickerFor({ status: "active", updated_at: "2026-09-23T00:00:00Z" }, NOW)).toBe("ACTIVE");
  });
  it("tilts the same way every time, within ±4°", () => {
    expect(stickerTilt("abc")).toBe(stickerTilt("abc"));
    expect(Math.abs(stickerTilt("xyz-123"))).toBeLessThanOrEqual(4);
  });
});
describe("receipt stamps", () => {
  it("stamps only what landed after the last look", () => {
    expect(isFreshReceipt("2026-09-24T01:00:00Z", NOW)).toBe(true);
    expect(isFreshReceipt("2026-09-23T01:00:00Z", NOW)).toBe(false);
    expect(isFreshReceipt("2026-09-24T01:00:00Z", null)).toBe(false);
    expect(isFreshReceipt(null, NOW)).toBe(false);
  });
});
