import { describe, it, expect } from "vitest";
import { normalizeRoomSwapPrefs, ROOM_SWAP_DEFAULTS } from "@/lib/motionPrefs";

describe("room swap prefs", () => {
  it("falls back to defaults for junk", () => {
    expect(normalizeRoomSwapPrefs(null)).toEqual(ROOM_SWAP_DEFAULTS);
    expect(normalizeRoomSwapPrefs({ durationMs: "fast" })).toEqual(ROOM_SWAP_DEFAULTS);
  });

  it("clamps to the allowed range", () => {
    expect(normalizeRoomSwapPrefs({ durationMs: 5000, driftPx: 99 })).toMatchObject({
      durationMs: 420,
      driftPx: 12,
    });
    expect(normalizeRoomSwapPrefs({ durationMs: 0, driftPx: -4 })).toMatchObject({
      durationMs: 80,
      driftPx: 0,
    });
  });

  it("keeps valid values and the enabled flag", () => {
    expect(normalizeRoomSwapPrefs({ enabled: false, durationMs: 260, driftPx: 6 })).toEqual({
      enabled: false,
      durationMs: 260,
      driftPx: 6,
    });
  });
});
