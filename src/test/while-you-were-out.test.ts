import { describe, expect, it } from "vitest";
import {
  MIN_AWAY_MS,
  arrivalsLine,
  buildAwayRead,
  calendarChangeLine,
  countWord,
  gapWords,
  handledLine,
  shouldSpeak,
  type AwayChange,
} from "@/lib/whileYouWereOut";

const HOUR = 3_600_000;
const at = (iso: string) => iso;

const change = (key: string, kind: AwayChange["kind"], iso: string): AwayChange => ({
  key,
  kind,
  line: key,
  at: at(iso),
  surface: "work",
});

describe("whileYouWereOut", () => {
  it("stays quiet for a short break", () => {
    expect(shouldSpeak(2 * HOUR)).toBe(false);
    expect(shouldSpeak(MIN_AWAY_MS)).toBe(true);
    expect(shouldSpeak(30 * 24 * HOUR)).toBe(false);
  });

  it("says nothing when nothing changed", () => {
    expect(buildAwayRead({ awayMs: 8 * HOUR, returnedAt: Date.now(), changes: [] })).toBeNull();
  });

  it("reports consequence first and caps at three lines", () => {
    const read = buildAwayRead({
      awayMs: 8 * HOUR,
      returnedAt: new Date("2026-09-15T08:00:00Z").getTime(),
      changes: [
        change("a", "handled", "2026-09-15T07:00:00Z"),
        change("b", "arrived", "2026-09-15T06:00:00Z"),
        change("c", "needs_you", "2026-09-15T05:00:00Z"),
        change("d", "meeting_changed", "2026-09-15T04:00:00Z"),
      ],
    });
    expect(read).not.toBeNull();
    expect(read!.total).toBe(4);
    expect(read!.lines.map((l) => l.key)).toEqual(["d", "c", "b"]);
    expect(read!.more).toBe("1 more change is on the record.");
    expect(read!.headline).toContain("changed");
  });

  it("counts in words up to three", () => {
    expect(countWord(1)).toBe("One thing");
    expect(countWord(3)).toBe("Three things");
    expect(countWord(7)).toBe("7 things");
  });

  it("drops duplicates by key", () => {
    const read = buildAwayRead({
      awayMs: 8 * HOUR,
      returnedAt: Date.now(),
      changes: [change("a", "needs_you", "2026-09-15T07:00:00Z"), change("a", "needs_you", "2026-09-15T07:00:00Z")],
    });
    expect(read!.total).toBe(1);
  });

  it("words the gap by length and hour of return", () => {
    expect(gapWords(8 * HOUR, 7)).toBe("overnight");
    expect(gapWords(8 * HOUR, 15)).toBe("while you were out");
    expect(gapWords(22 * HOUR, 9)).toBe("since yesterday");
    expect(gapWords(60 * HOUR, 9)).toBe("over the last few days");
  });

  it("counts arrivals instead of listing them", () => {
    expect(arrivalsLine(4, "2026-09-15T07:00:00Z")!.line).toBe("4 things landed in your inbox.");
    expect(arrivalsLine(0, "2026-09-15T07:00:00Z")).toBeNull();
    expect(handledLine(1, "2026-09-15T07:00:00Z")!.line).toBe("One thing was handled already.");
  });

  it("translates a calendar change into a plain line", () => {
    const line = calendarChangeLine({
      id: "1",
      title: "ADHD appointment",
      change: "moved",
      detected_at: "2026-09-15T07:00:00Z",
    });
    expect(line.line).toBe("ADHD appointment moved.");
    expect(line.surface).toBe("schedule");
    expect(line.kind).toBe("meeting_changed");
  });
});
