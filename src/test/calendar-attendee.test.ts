import { describe, expect, it } from "vitest";
import {
  attendeeAdds,
  buildCalendarProposal,
  calendarFieldLabel,
  calendarProposalRisk,
  consequenceLine,
  normalizeCalendarChangeField,
  type CalendarFieldChange,
} from "@/lib/calendarProposal";
import {
  extractEmails,
  normalizeCalendarChanges,
} from "../../supabase/functions/_shared/calendarChangeNormalize";
import { buildCalendarRequestBody } from "../../supabase/functions/_shared/calendarExecute";

const defaults = { timezone: "America/New_York", morning: "09:00", afternoon: "14:00", evening: "18:00" };

const event = {
  feed_id: "f1",
  uid: "abc123@google.com",
  starts_at: "2026-09-15T22:00:00.000Z",
  ends_at: "2026-09-15T23:00:00.000Z",
  title: "Evening Meetup with Dani",
};

describe("guest email extraction", () => {
  it("keeps only real addresses, deduped and lowercased", () => {
    expect(extractEmails("invite Dani@Example.com and dani@example.com, not dani"))
      .toEqual(["dani@example.com"]);
    expect(extractEmails(["a@x.com", "b@y.org"])).toEqual(["a@x.com", "b@y.org"]);
    expect(extractEmails("no emails here")).toEqual([]);
    expect(extractEmails(null)).toEqual([]);
  });

  it("maps the model's guest wording onto the one attendee field", () => {
    expect(normalizeCalendarChangeField("guest")).toBe("attendee");
    expect(normalizeCalendarChangeField("guests")).toBe("attendee");
    expect(normalizeCalendarChangeField("invite")).toBe("attendee");
    expect(calendarFieldLabel("attendee")).toBe("Guest");
  });

  it("normalizes a guest change to clean joined emails and drops empty ones", () => {
    const changes = normalizeCalendarChanges(
      [{ field: "guest", after: "Dani at Dani@Example.com please" }, { field: "attendee", after: "nobody" }],
      defaults,
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ field: "attendee", label: "Guest", after: "dani@example.com" });
  });
});

describe("guest risk and consequence", () => {
  const guestChange: CalendarFieldChange = {
    field: "attendee", label: "Guest", before: null, after: "dani@example.com",
  };

  it("adding a guest is always high risk — Google emails a real person", () => {
    const p = buildCalendarProposal({ event, changes: [guestChange] });
    expect(attendeeAdds(p)).toEqual(["dani@example.com"]);
    expect(calendarProposalRisk(p)).toBe("high");
    expect(consequenceLine(p)).toMatch(/Google emails an invite to dani@example\.com/);
  });

  it("a proposal without guests keeps its ordinary risk", () => {
    const p = buildCalendarProposal({ event, changes: [{ field: "location", label: "Location", before: null, after: "Old Town" }] });
    expect(calendarProposalRisk(p)).toBe("low_reversible");
    expect(consequenceLine(p)).toBeNull();
  });
});

describe("google request body for guests", () => {
  it("sends attendees on the invite and asks Google to email them", () => {
    const p = buildCalendarProposal({
      event,
      changes: [{ field: "attendee", label: "Guest", before: null, after: "dani@example.com" }],
    });
    const { method, path, body, operation } = buildCalendarRequestBody(p as any, "America/New_York");
    expect(operation).toBe("update");
    expect(method).toBe("PATCH");
    expect(path).toContain("sendUpdates=all");
    expect(body?.attendees).toEqual([{ email: "dani@example.com" }]);
  });

  it("creates carry guests and notify too", () => {
    const p = buildCalendarProposal({
      event: null,
      changes: [
        { field: "existence", label: "Event", before: null, after: "create" },
        { field: "title", label: "Title", before: null, after: "Dinner" },
        { field: "time", label: "Time", before: null, after: "2026-09-15T22:00:00.000Z" },
        { field: "attendee", label: "Guest", before: null, after: "dani@example.com" },
      ],
    });
    const { method, path, body } = buildCalendarRequestBody(p as any, "America/New_York");
    expect(method).toBe("POST");
    expect(path).toContain("sendUpdates=all");
    expect(body?.attendees).toEqual([{ email: "dani@example.com" }]);
  });

  it("cancelling an event with guests still notifies them", () => {
    const p = buildCalendarProposal({
      event,
      attendee_count: 2,
      changes: [{ field: "existence", label: "Event", before: "Dinner", after: null }],
    });
    const { method, path } = buildCalendarRequestBody(p as any, "America/New_York");
    expect(method).toBe("DELETE");
    expect(path).toContain("sendUpdates=all");
  });
});
