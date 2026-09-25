import { describe, it, expect } from "vitest";
import {
  FEEL_PRESETS,
  ROOM_SWAP_DEFAULTS,
  applyFeelPreset,
  detectFeel,
  normalizeRoomSwapPrefs,
} from "@/lib/motionPrefs";

describe("room swap prefs", () => {
  it("falls back to defaults for junk", () => {
    expect(normalizeRoomSwapPrefs(null)).toEqual(ROOM_SWAP_DEFAULTS);
    expect(normalizeRoomSwapPrefs({ durationMs: "fast" })).toEqual(ROOM_SWAP_DEFAULTS);
  });

  it("clamps to the allowed range", () => {
    expect(normalizeRoomSwapPrefs({ durationMs: 5000, driftPx: 99 })).toMatchObject({
      durationMs: 900,
      driftPx: 20,
    });
    expect(normalizeRoomSwapPrefs({ durationMs: 0, driftPx: -4 })).toMatchObject({
      durationMs: 120,
      driftPx: 0,
    });
  });

  it("keeps valid values and the enabled flag", () => {
    expect(normalizeRoomSwapPrefs({ enabled: false, durationMs: 260, driftPx: 6 })).toMatchObject({
      enabled: false,
      durationMs: 260,
      driftPx: 6,
    });
  });
});

describe("feel presets", () => {
  it("resolves a preset into concrete numbers", () => {
    const p = applyFeelPreset(ROOM_SWAP_DEFAULTS, "minimal");
    expect(p).toEqual({ ...FEEL_PRESETS.minimal, feel: "minimal" });
    expect(applyFeelPreset(ROOM_SWAP_DEFAULTS, "expressive").blockStaggerMs).toBe(150);
  });

  it("reports hand-tuned values as custom", () => {
    expect(detectFeel({ ...FEEL_PRESETS.standard, driftPx: 3 })).toBe("custom");
    expect(detectFeel(FEEL_PRESETS.standard)).toBe("standard");
  });

  it("clamps the answer-landing stagger", () => {
    expect(normalizeRoomSwapPrefs({ blockStaggerMs: 9999 }).blockStaggerMs).toBe(260);
    expect(normalizeRoomSwapPrefs({ blockStaggerMs: -5 }).blockStaggerMs).toBe(0);
  });
});
