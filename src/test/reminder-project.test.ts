import { describe, expect, it } from "vitest";
import {
  appointmentReminderSignals,
  reminderToSignal,
} from "../../supabase/functions/_shared/awareness/reminders";

const scope = { userId: "u1", organizationId: null } as any;
const tz = "America/New_York";
// 4:00 PM ET on the 14th.
const start = "2026-09-14T20:00:00.000Z";
const event = {
  id: "e1",
  uid: "uid-1",
  title: "ADHD appointment",
  location: "Clinic on Main St",
  starts_at: start,
  ends_at: "2026-09-14T21:00:00.000Z",
  all_day: false,
  feed_id: "f1",
  project_id: "p1",
} as any;

describe("a filed appointment says where it is filed", () => {
  it("names the project on the heads-up", () => {
    const s = reminderToSignal(event, "same_day", scope, Date.parse(start) - 3 * 3600_000, tz, {
      project: "Health",
    });
    expect(s.why).toContain("Filed under Health.");
    expect((s.metadata as any).project).toBe("Health");
  });

  it("says nothing extra when it is not filed", () => {
    const s = reminderToSignal(event, "same_day", scope, Date.parse(start) - 3 * 3600_000, tz, {});
    expect(s.why).not.toContain("Filed under");
    expect((s.metadata as any).project).toBeNull();
  });

  it("carries the project through the sweep builder", () => {
    const out = appointmentReminderSignals([event], scope, Date.parse(start) - 3 * 3600_000, tz, {
      projectFor: (e: any) => (e.project_id === "p1" ? "Health" : null),
    });
    expect(out).toHaveLength(1);
    expect(out[0].why).toContain("Filed under Health.");
  });
});
