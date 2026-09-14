import { describe, it, expect } from "vitest";
import { eventLine, projectLine, whenLine } from "../../supabase/functions/_shared/sherlockGround.ts";

describe("sherlock ground lines", () => {
  it("speaks the real day and time in the person's timezone", () => {
    const line = whenLine("2026-09-14T20:00:00Z", "America/New_York");
    expect(line).toContain("Sep 14");
    expect(line).toContain("4:00");
  });

  it("says all day without inventing a clock time", () => {
    const line = whenLine("2026-09-14T00:00:00Z", "UTC", true);
    expect(line).toContain("(all day)");
    expect(line).not.toContain(":");
  });

  it("says nothing recorded when there is no time", () => {
    expect(whenLine(null, "UTC")).toBe("no time recorded");
  });

  it("carries place and project name onto the event line", () => {
    const line = eventLine(
      {
        id: "e1",
        uid: "u1",
        title: "ADHD appointment",
        location: "Old Town",
        description: null,
        starts_at: "2026-09-14T20:00:00Z",
        ends_at: null,
        all_day: false,
        origin: "feed",
        project_id: "p1",
      },
      "America/New_York",
      "Health",
    );
    expect(line).toContain("(event:e1) ADHD appointment");
    expect(line).toContain("at Old Town");
    expect(line).toContain("project: Health");
    expect(line).toContain("from calendar feed");
  });

  it("counts project items in plain English", () => {
    const one = projectLine({ id: "p1", title: "Health", summary: null, status: "active", updated_at: null }, 1);
    expect(one).toContain("1 item");
    const many = projectLine({ id: "p1", title: "Health", summary: null, status: "active", updated_at: null }, 3);
    expect(many).toContain("3 items");
  });
});
