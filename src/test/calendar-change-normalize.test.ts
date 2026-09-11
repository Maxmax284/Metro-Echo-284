import { describe, expect, it } from "vitest";
import { normalizeCalendarChanges } from "../../supabase/functions/_shared/calendarChangeNormalize.ts";

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
});