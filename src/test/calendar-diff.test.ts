import { describe, expect, it } from "vitest";
import {
  changeDiff, groupChangesByCheck, runHeadline, type CalendarChangeRow,
} from "@/lib/calendarSync";

const row = (over: Partial<CalendarChangeRow>): CalendarChangeRow => ({
  id: Math.random().toString(36).slice(2),
  feed_id: "f1",
  title: "Standup",
  change: "added",
  old_starts_at: null,
  new_starts_at: "2026-09-01T09:00:00.000Z",
  was_filed: false,
  detected_at: "2026-08-29T03:00:00.000Z",
  ...over,
});

describe("groupChangesByCheck", () => {
  it("buckets rows written by the same check together", () => {
    const runs = groupChangesByCheck([
      row({ detected_at: "2026-08-29T03:00:10.000Z" }),
      row({ detected_at: "2026-08-29T03:00:00.000Z", change: "moved" }),
      row({ detected_at: "2026-08-28T03:00:00.000Z", change: "cancelled" }),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs[0].rows).toHaveLength(2);
    expect(runs[0].at).toBe("2026-08-29T03:00:10.000Z");
    expect(runs[0].added).toBe(1);
    expect(runs[0].moved).toBe(1);
    expect(runs[1].cancelled).toBe(1);
  });

  it("returns nothing for an empty record", () => {
    expect(groupChangesByCheck([])).toEqual([]);
  });
});

describe("runHeadline", () => {
  it("counts what was found, never says synchronized", () => {
    expect(runHeadline({ added: 2, moved: 1, cancelled: 0 })).toBe("2 added · 1 moved");
    expect(runHeadline({ added: 0, moved: 0, cancelled: 3 })).toBe("3 came off");
    expect(runHeadline({ added: 0, moved: 0, cancelled: 0 })).toBe("nothing changed");
  });
});

describe("changeDiff", () => {
  const fmt = (iso: string) => iso.slice(11, 16);

  it("shows a move as before then after", () => {
    expect(
      changeDiff(
        { change: "moved", old_starts_at: "2026-09-01T09:00:00Z", new_starts_at: "2026-09-01T14:00:00Z" },
        fmt,
      ),
    ).toEqual({ verb: "Moved", before: "09:00", after: "14:00" });
  });

  it("shows an addition with no before side", () => {
    expect(changeDiff({ change: "added", old_starts_at: null, new_starts_at: "2026-09-01T09:00:00Z" }, fmt))
      .toEqual({ verb: "Added", before: null, after: "09:00" });
  });

  it("shows a cancellation with no after side", () => {
    expect(changeDiff({ change: "cancelled", old_starts_at: "2026-09-01T09:00:00Z", new_starts_at: null }, fmt))
      .toEqual({ verb: "Came off", before: "09:00", after: null });
  });
});
