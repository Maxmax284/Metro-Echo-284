// Rest and effort as a practical constraint — never a health verdict.
import { describe, expect, it } from "vitest";
import { bodyLoadBlock, readBodyLoad } from "@/lib/bodyLoad";

const NOW = new Date("2026-09-17T18:00:00Z");
const nightsAgo = (n: number, minutes: number) => ({
  kind: "sleep",
  value: minutes,
  measured_at: new Date(NOW.getTime() - n * 86_400_000).toISOString(),
});

describe("readBodyLoad", () => {
  it("says nothing it was not told", () => {
    const load = readBodyLoad([], NOW);
    expect(load.sleepMinutes).toBeNull();
    expect(load.sleepUsualMinutes).toBeNull();
    expect(load.trainedTodayMinutes).toBeNull();
    expect(load.shortNight).toBe(false);
    expect(load.unknown).toContain("no sleep recorded");
    expect(bodyLoadBlock(load)).toBe("");
  });

  it("needs enough nights before it claims a usual", () => {
    const load = readBodyLoad([nightsAgo(0, 300), nightsAgo(1, 420)], NOW);
    expect(load.sleepMinutes).toBe(300);
    expect(load.sleepUsualMinutes).toBeNull();
    expect(load.shortNight).toBe(false);
  });

  it("calls a short night short only against their own usual", () => {
    const load = readBodyLoad(
      [nightsAgo(0, 260), nightsAgo(1, 450), nightsAgo(2, 440), nightsAgo(3, 460)],
      NOW,
    );
    expect(load.sleepUsualMinutes).toBeGreaterThan(400);
    expect(load.shortNight).toBe(true);
    const block = bodyLoadBlock(load);
    expect(block).toContain("their usual");
    expect(block).toMatch(/do not diagnose, do not advise/i);
  });

  it("an ordinary night is not news", () => {
    const load = readBodyLoad(
      [nightsAgo(0, 430), nightsAgo(1, 450), nightsAgo(2, 440), nightsAgo(3, 460)],
      NOW,
    );
    expect(load.shortNight).toBe(false);
  });

  it("adds up today's session only", () => {
    const load = readBodyLoad(
      [
        { kind: "workout", value: 45, measured_at: NOW.toISOString() },
        { kind: "active_minutes", value: 20, measured_at: NOW.toISOString() },
        { kind: "workout", value: 90, measured_at: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() },
      ],
      NOW,
    );
    expect(load.trainedTodayMinutes).toBe(65);
    expect(bodyLoadBlock(load)).toContain("65 minutes");
  });

  it("ignores readings older than the window", () => {
    const load = readBodyLoad([nightsAgo(40, 400)], NOW);
    expect(load.sleepMinutes).toBeNull();
  });
});
