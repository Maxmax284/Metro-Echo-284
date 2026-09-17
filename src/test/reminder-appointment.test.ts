import { describe, expect, it } from "vitest";
import { looksLikeAppointment } from "../../supabase/functions/_shared/reminderParse";
import { reminderLocation, reminderOffsetsMinutes, resolveReminderReference, wantsRecentReminderOnCalendar, wantsReminderCancellation } from "../../supabase/functions/_shared/reminderActions";
import { hasCalendarCreationDetails } from "../../supabase/functions/_shared/calendarChangeNormalize";
import { asksCalendarActionStatus, calendarActionStatusLine } from "../../supabase/functions/_shared/calendarConversation";
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

describe("calendar conversation truth", () => {
  const payload = {
    kind: "calendar_change" as const,
    version: 1,
    event: null,
    changes: [
      { field: "title" as const, label: "Title", before: null, after: "Appointment at the Villas" },
      { field: "time" as const, label: "Time", before: null, after: "2026-09-22T17:00:00.000Z" },
    ],
    attendee_count: 0,
    source: null,
    conflicts: [],
    write_state: "connected" as const,
  };

  it("rescues a fully described creation even when no old event matches", () => {
    expect(hasCalendarCreationDetails(payload.changes)).toBe(true);
  });

  it("recognizes a direct challenge and answers a staged action honestly", () => {
    expect(asksCalendarActionStatus("Did you actually already do it?")).toBe(true);
    expect(asksCalendarActionStatus("So it's for the 22nd correct?")).toBe(true);
    expect(calendarActionStatusLine({ status: "staged", payload }, "America/New_York"))
      .toContain("waiting on your Yes");
  });

  it("only claims a Google write when the provider receipt exists", () => {
    expect(calendarActionStatusLine({ status: "audited", payload, result: null }, "America/New_York"))
      .toContain("will not call it written");
    expect(calendarActionStatusLine({
      status: "audited",
      payload,
      result: { provider: "google_calendar", event_id: "evt-1", start: "2026-09-22T17:00:00.000Z" },
    }, "America/New_York")).toContain("Google confirmed");
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
    expect(resolveReminderReference("that reminder", rows)).toMatchObject({ status: "one", reminder: { id: "dani" } });
    expect(resolveReminderReference("reminder", rows).status).toBe("many");
    expect(resolveReminderReference("dentist", rows).status).toBe("none");
  });

  it("preserves multiple Google reminder offsets and a location", () => {
    expect(reminderOffsetsMinutes("a day and an hour beforehand")).toEqual([1440, 60]);
    expect(reminderLocation(rows[0].summary)).toBe("One Loudoun or Old Town");
  });
});
