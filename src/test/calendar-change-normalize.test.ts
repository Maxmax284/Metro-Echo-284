import { describe, expect, it } from "vitest";
import { calendarCreationMissing, normalizeCalendarChanges } from "../../supabase/functions/_shared/calendarChangeNormalize.ts";
import { parseReminderHint } from "../../supabase/functions/_shared/reminderParse.ts";

const defaults = {
  timezone: "America/New_York",
  morning: "09:00",
  afternoon: "14:00",
  evening: "18:00",
};

describe("calendar change normalization", () => {
  it("turns a Telegram wall-clock phrase into a provider-safe timestamp", () => {
    const [change] = normalizeCalendarChanges([
      { field: "time", before: null, after: "Tuesday 6:00 PM America/New_York" },
    ], defaults);
    expect(change.after).toMatch(/^\d{4}-\d{2}-\d{2}T22:00:00\.000Z$/);
  });

  it("treats reminder wording placed in before as a requested addition", () => {
    const changes = normalizeCalendarChanges([
      { field: "reminder", before: "a day before" },
      { field: "reminder", before: "an hour before" },
    ], defaults);
    expect(changes).toEqual([
      { field: "reminder", label: "Reminder", before: null, after: "1440,60" },
    ]);
  });

  it("does not offer approval for an unnamed or unwritable new event", () => {
    expect(calendarCreationMissing(normalizeCalendarChanges([
      { field: "existence", after: "create" },
      { field: "time", after: "Tuesday 6 PM" },
    ], defaults))).toBe("title");
    expect(calendarCreationMissing(normalizeCalendarChanges([
      { field: "existence", after: "Meet Dani" },
      { field: "time", after: "Tuesday 6 PM" },
    ], defaults))).toBeNull();
  });

  it("carries an existence name into the provider title", () => {
    const changes = normalizeCalendarChanges([
      { field: "existence", after: "Evening Meetup with Dani" },
      { field: "time", after: "Tuesday 6 PM" },
    ], defaults);
    expect(changes.find((change) => change.field === "title")?.after).toBe("Evening Meetup with Dani");
  });

  it("understands an ordinal date this month instead of reading it as an hour", () => {
    const parsed = parseReminderHint("the 15th of this month at 6 p.m.", defaults);
    expect(parsed.status).toBe("ok");
    if (parsed.status === "ok") {
      expect(parsed.due_at).toMatch(/^\d{4}-\d{2}-15T22:00:00\.000Z$/);
    }
  });
});