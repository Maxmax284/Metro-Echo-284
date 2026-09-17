import { describe, expect, it } from "vitest";
import {
  activeCalendarDraft,
  calendarDraftContext,
  calendarEventButtons,
  mergeCalendarDraft,
} from "../../supabase/functions/_shared/telegramCalendarPanel";

describe("Telegram calendar panel", () => {
  it("builds bounded edit buttons from owned rows", () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: `row-${i}`,
      feed_id: "feed",
      uid: `uid-${i}`,
      starts_at: `2026-09-${15 + i}T22:00:00.000Z`,
      ends_at: null,
      title: `Event ${i}`,
      location: null,
      all_day: false,
    }));
    const buttons = calendarEventButtons(rows);
    expect(buttons).toHaveLength(6);
    expect(buttons[0].callback_data).toBe("calevt:row-0");
  });

  it("does not show duplicate Google and iCal copies as two buttons", () => {
    const rows = ["google", "ical"].map((id) => ({
      id,
      feed_id: id,
      uid: "same@google.com",
      starts_at: "2026-09-15T22:00:00.000Z",
      ends_at: null,
      title: "Evening Meetup with Dani",
      location: null,
      all_day: false,
    }));
    expect(calendarEventButtons(rows)).toHaveLength(1);
  });

  it("retains fields across turns and expires the draft", () => {
    const now = new Date("2026-09-11T09:00:00.000Z");
    const first = mergeCalendarDraft(null, [
      { field: "location", label: "Location", before: null, after: "One Loudoun or Old Town" },
    ], now);
    const next = mergeCalendarDraft(first, [
      { field: "title", label: "Title", before: null, after: "Evening Meetup with Dani" },
    ], now);
    expect(next.changes.map((change) => change.field)).toEqual(["location", "title"]);
    expect(activeCalendarDraft(next, new Date("2026-09-11T09:20:00.000Z"))).not.toBeNull();
    expect(activeCalendarDraft(next, new Date("2026-09-11T09:31:00.000Z"))).toBeNull();
    expect(calendarDraftContext(next)).toContain("same draft");
  });

  it("replaces only the corrected field without losing the booking", () => {
    const first = mergeCalendarDraft(null, [
      { field: "existence", label: "Event", before: null, after: "Appointment at the Villas" },
      { field: "title", label: "Title", before: null, after: "Appointment at the Villas" },
      { field: "location", label: "Location", before: null, after: "the Villas" },
      { field: "reminder", label: "Reminder", before: null, after: "1440,60" },
    ]);
    const corrected = mergeCalendarDraft(first, [
      { field: "time", label: "Time", before: null, after: "2026-09-22T17:00:00.000Z" },
    ]);
    expect(corrected.changes.map((change) => change.field)).toEqual([
      "existence", "title", "location", "reminder", "time",
    ]);
  });
});