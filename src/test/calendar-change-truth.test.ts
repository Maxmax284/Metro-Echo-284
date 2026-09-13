import { describe, expect, it } from "vitest";
import { diffWindow } from "../../supabase/functions/calendar-sync/index.ts";

const NOW = Date.parse("2026-09-13T23:00:00Z");

describe("calendar change truth", () => {
  it("says nothing when the same instant is written two different ways", () => {
    const prior = [{ uid: "u1", title: "ADHD appointment", starts_at: "2026-09-14 20:00:00+00", project_id: null }];
    const events = [{ uid: "u1", title: "ADHD appointment", startsAt: "2026-09-14T20:00:00.000Z" }];
    expect(diffWindow(prior as any, events as any, NOW)).toEqual([]);
  });

  it("still reports a real move", () => {
    const prior = [{ uid: "u1", title: "ADHD appointment", starts_at: "2026-09-14 20:00:00+00", project_id: null }];
    const events = [{ uid: "u1", title: "ADHD appointment", startsAt: "2026-09-14T22:00:00.000Z" }];
    const out = diffWindow(prior as any, events as any, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].change).toBe("moved");
  });

  it("reports a cancellation once, not a move", () => {
    const prior = [{ uid: "u1", title: "Gone", starts_at: "2026-09-14 20:00:00+00", project_id: null }];
    const out = diffWindow(prior as any, [] as any, NOW);
    expect(out.map((c) => c.change)).toEqual(["cancelled"]);
  });
});
