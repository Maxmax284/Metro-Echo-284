import { describe, expect, it } from "vitest";
import {
  bucketByDay,
  dayKeyLocal,
  daySummary,
  endOfWeek,
  projectNamesForDay,
  shiftWeeks,
  startOfWeek,
  weekDates,
  weekHeading,
} from "@/lib/weekPlan";

describe("weekPlan", () => {
  it("starts a week on Monday, whatever day you stand on", () => {
    // Sunday Sep 20 2026 belongs to the week beginning Mon Sep 14.
    const start = startOfWeek(new Date(2026, 8, 20, 13, 30));
    expect(start.getDay()).toBe(1);
    expect(dayKeyLocal(start)).toBe("2026-09-14");
  });

  it("ends the week on Sunday night", () => {
    const end = endOfWeek(startOfWeek(new Date(2026, 8, 14)));
    expect(dayKeyLocal(end)).toBe("2026-09-20");
    expect(end.getHours()).toBe(23);
  });

  it("walks whole weeks, never landing mid-week", () => {
    const start = startOfWeek(new Date(2026, 8, 14));
    expect(dayKeyLocal(shiftWeeks(start, 1))).toBe("2026-09-21");
    expect(dayKeyLocal(shiftWeeks(start, -2))).toBe("2026-08-31");
  });

  it("lays out seven days in order", () => {
    const days = weekDates(startOfWeek(new Date(2026, 8, 14)));
    expect(days).toHaveLength(7);
    expect(dayKeyLocal(days[6])).toBe("2026-09-20");
  });

  it("names the week holding today as this week", () => {
    const start = startOfWeek(new Date(2026, 8, 14));
    expect(weekHeading(start, new Date(2026, 8, 16))).toContain("This week");
    expect(weekHeading(start, new Date(2026, 9, 16))).not.toContain("This week");
  });

  it("says what a day holds in plain words", () => {
    expect(daySummary({ appointments: 0, promises: 0, notes: 0 })).toBe("Nothing on this day.");
    expect(daySummary({ appointments: 1, promises: 0, notes: 0 })).toBe("1 appointment.");
    expect(daySummary({ appointments: 2, promises: 1, notes: 3 })).toBe("2 appointments, 1 promise and 3 notes.");
  });

  it("buckets rows onto local days and drops undated ones", () => {
    const rows = [
      { id: "a", at: new Date(2026, 8, 14, 9).toISOString() },
      { id: "b", at: new Date(2026, 8, 14, 17).toISOString() },
      { id: "c", at: null as string | null },
    ];
    const out = bucketByDay(rows, (r) => r.at);
    expect(out["2026-09-14"].map((r) => r.id)).toEqual(["a", "b"]);
    expect(Object.keys(out)).toHaveLength(1);
  });

  it("lists each project once and ignores blanks", () => {
    expect(projectNamesForDay(["Health", null, "Health", " ", "Thailand"])).toEqual(["Health", "Thailand"]);
  });
});

describe("dropEchoedPromises", () => {
  it("drops a promise that only repeats an appointment on the same day", async () => {
    const { dropEchoedPromises } = await import("@/lib/weekPlan");
    const rows = [{ s: "Get the keys to my storage unit" }, { s: "Call the landlord" }];
    const out = dropEchoedPromises(rows, ["Get the keys to my storage unit to get books"], (r) => r.s);
    expect(out.map((r) => r.s)).toEqual(["Call the landlord"]);
  });

  it("keeps every promise when the day has no appointments", async () => {
    const { dropEchoedPromises } = await import("@/lib/weekPlan");
    const rows = [{ s: "Call the landlord" }];
    expect(dropEchoedPromises(rows, [], (r) => r.s)).toHaveLength(1);
  });
});
