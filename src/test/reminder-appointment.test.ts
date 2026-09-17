import { describe, expect, it } from "vitest";
import { looksLikeAppointment, parseReminderHint } from "../../supabase/functions/_shared/reminderParse";
import { reminderLocation, reminderOffsetsMinutes, resolveReminderReference, wantsRecentReminderOnCalendar, wantsReminderCancellation } from "../../supabase/functions/_shared/reminderActions";
import { hasCalendarCreationDetails, normalizeCalendarChanges } from "../../supabase/functions/_shared/calendarChangeNormalize";
import { asksCalendarActionStatus, calendarActionStatusLine } from "../../supabase/functions/_shared/calendarConversation";
import { explicitlyPromotesExistingReminder, parseNewTelegramCalendarRequest } from "../../supabase/functions/_shared/telegramCalendarRequest";
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

  it("never lets JavaScript invent a year for a date without a clock", () => {
    const changes = normalizeCalendarChanges([
      { field: "title", after: "Appointment at the Villas" },
      { field: "time", after: "September 22" },
    ], { timezone: "America/New_York", morning: "08:00", afternoon: "14:00", evening: "19:00" });
    expect(changes.find((change) => change.field === "time")?.after).toBeNull();
    expect(hasCalendarCreationDetails(changes)).toBe(false);
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

  it("does not promote an unrelated reminder from a complete new event request", () => {
    const text = "I need you to set a reminder on my calendar for this coming Tuesday at 1:00 p.m. that reminds me a day and an hour beforehand that I have an appointment at the villas two minutes down the street from me";
    expect(wantsRecentReminderOnCalendar(text)).toBe(false);
    expect(explicitlyPromotesExistingReminder(text)).toBe(false);
    expect(explicitlyPromotesExistingReminder("Put that reminder on my calendar")).toBe(true);
  });

  it("resolves one, many, and no private reminders without guessing", () => {
    expect(resolveReminderReference("Dani reminder", rows).status).toBe("one");
    expect(resolveReminderReference("that reminder", rows)).toMatchObject({ status: "one", reminder: { id: "dani" } });
    expect(resolveReminderReference("reminder", rows).status).toBe("many");
    expect(resolveReminderReference("dentist", rows).status).toBe("none");
  });

  it("lets the words you said beat a demonstrative", () => {
    // "that" must never override a name the person actually said.
    expect(resolveReminderReference("that trash reminder", rows)).toMatchObject({ status: "one", reminder: { id: "trash" } });
    expect(resolveReminderReference("that dentist reminder", rows).status).toBe("none");
  });

  it("asks instead of claiming a stale reminder for a bare reference", () => {
    const now = new Date("2026-09-17T11:00:00Z");
    expect(resolveReminderReference("that reminder", rows, now).status).toBe("many");
    const fresh = [{ id: "fresh", summary: "Call the villas", created_at: "2026-09-17T10:40:00Z" }, ...rows];
    expect(resolveReminderReference("that reminder", fresh, now)).toMatchObject({ status: "one", reminder: { id: "fresh" } });
  });

  it("asks when two reminders landed minutes apart", () => {
    const now = new Date("2026-09-17T11:00:00Z");
    const pair = [
      { id: "a", summary: "Call the villas", created_at: "2026-09-17T10:50:00Z" },
      { id: "b", summary: "Call the clinic", created_at: "2026-09-17T10:46:00Z" },
    ];
    expect(resolveReminderReference("that reminder", pair, now).status).toBe("many");
  });

  it("preserves multiple Google reminder offsets and a location", () => {
    expect(reminderOffsetsMinutes("a day and an hour beforehand")).toEqual([1440, 60]);
    expect(reminderLocation(rows[0].summary)).toBe("One Loudoun or Old Town");
  });
});

describe("Telegram date corrections", () => {
  const defaults = { timezone: "America/New_York", morning: "08:00", afternoon: "14:00", evening: "19:00" };

  it("understands a day-first named date with dotted PM", () => {
    const parsed = parseReminderHint("the 22nd of September at 1:00 p.m.", defaults);
    expect(parsed.status).toBe("ok");
    if (parsed.status === "ok") expect(parsed.due_at).toBe("2026-09-22T17:00:00.000Z");
  });

  it("combines a corrected day with the clock retained from the thread", () => {
    const parsed = parseReminderHint(
      "This coming Tuesday on the 22nd I need it at 1:00 p.m. for an appointment at the villas",
      defaults,
    );
    expect(parsed.status).toBe("ok");
    if (parsed.status === "ok") expect(parsed.due_at).toBe("2026-09-22T17:00:00.000Z");
  });

  it("deterministically stages the exact Villas request before model routing", () => {
    const request = parseNewTelegramCalendarRequest(
      "I need you to set a reminder on my calendar for this coming Tuesday at 1:00 p.m. that reminds me a day and an hour beforehand that I have an appointment at the villas two minutes down the street from me",
      defaults,
    );
    expect(request?.title).toBe("Appointment at the villas");
    expect(request?.due_at).toBe("2026-09-22T17:00:00.000Z");
    expect(request?.changes.find((change) => change.field === "location")?.after)
      .toBe("the villas two minutes down the street from me");
    expect(request?.changes.find((change) => change.field === "reminder")?.after).toBe("1440,60");
  });
});
