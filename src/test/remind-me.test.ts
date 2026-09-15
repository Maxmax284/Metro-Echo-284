import { describe, expect, it } from "vitest";
import { remindGoal, remindStopAt, watchSubjectFor } from "@/lib/remindMe";

describe("remind me", () => {
  it("watches the appointment's own identity, not the feed row", () => {
    expect(watchSubjectFor({ id: "row-1", uid: "google-uid-9" })).toBe("google-uid-9");
    expect(watchSubjectFor({ id: "row-1", uid: "  " })).toBe("row-1");
    expect(watchSubjectFor({ id: "row-1", uid: null })).toBe("row-1");
  });

  it("says what it is in plain words", () => {
    expect(remindGoal("ADHD appointment")).toBe("Remind me about ADHD appointment");
    expect(remindGoal("  ")).toBe("Remind me about this entry");
    expect(remindGoal("x".repeat(400)).length).toBeLessThanOrEqual(160);
  });

  it("stops a day after the thing happens, never open-ended", () => {
    const start = "2026-09-20T14:00:00.000Z";
    expect(remindStopAt(start)).toBe("2026-09-21T14:00:00.000Z");
  });

  it("still bounds a watch when the date is unreadable", () => {
    expect(new Date(remindStopAt("not a date")).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("watch identity", () => {
  it("keeps a feed uid out of subject_id and only stores rows Echo owns", () => {
    expect(remindSubjectRow("abc123@google.com")).toBeNull();
    expect(remindSubjectRow("3f6c1b2a-9d4e-4f1a-8b2c-77d9e1a4c501")).toBe(
      "3f6c1b2a-9d4e-4f1a-8b2c-77d9e1a4c501",
    );
  });
});
