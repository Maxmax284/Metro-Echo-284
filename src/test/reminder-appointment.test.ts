import { describe, expect, it } from "vitest";
import { looksLikeAppointment } from "../../supabase/functions/_shared/reminderParse";
import { reminderLocation, reminderOffsetsMinutes, resolveReminderReference, wantsRecentReminderOnCalendar, wantsReminderCancellation } from "../../supabase/functions/_shared/reminderActions";
describe("appointment shape", () => {
  it("spots people and places", () => {
    expect(looksLikeAppointment("Meet up with Dani at One Loudoun")).toBe(true);
    expect(looksLikeAppointment("ADHD appointment")).toBe(true);
  });
  it("leaves plain nudges alone", () => {
    expect(looksLikeAppointment("take out the trash")).toBe(false);
    expect(looksLikeAppointment("stretch at 6pm")).toBe(false);
  });
});

describe("reminder follow-ups", () => {
  const rows = [
    { id: "dani", summary: "Meet up with Dani at One Loudoun or Old Town", created_at: "2026-09-11T09:00:00Z" },
    { id: "trash", summary: "Take out the trash", created_at: "2026-09-10T09:00:00Z" },
  ];

  it("recognizes calendar promotion and cancellation", () => {
    expect(wantsRecentReminderOnCalendar("I want this on my calendar too please")).toBe(true);
    expect(wantsReminderCancellation("Remove that reminder and start all over again")).toBe(true);
  });

  it("resolves one, many, and no private reminders without guessing", () => {
    expect(resolveReminderReference("Dani reminder", rows).status).toBe("one");
    expect(resolveReminderReference("that reminder", rows).status).toBe("many");
    expect(resolveReminderReference("dentist", rows).status).toBe("none");
  });

  it("preserves multiple Google reminder offsets and a location", () => {
    expect(reminderOffsetsMinutes("a day and an hour beforehand")).toEqual([1440, 60]);
    expect(reminderLocation(rows[0].summary)).toBe("One Loudoun or Old Town");
  });
});
