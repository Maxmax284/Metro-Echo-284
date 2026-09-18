import { describe, expect, it } from "vitest";
import { normalizeCalendarUrl, parseIcs, parseIcsDate, unfoldIcs } from "../../supabase/functions/_shared/ics";
import {
  calendarEventToSignal,
  calendarSignals,
  commitmentCollisionToSignal,
  type CalendarEventRow,
} from "../../supabase/functions/_shared/awareness/adapters-calendar";
import { scoreRelevance } from "../lib/awareness";

const scope = { userId: "u1", organizationId: null };
const NOW = Date.UTC(2026, 7, 23, 9, 0, 0);
const iso = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 23, h, m, 0)).toISOString();

const feed = (body: string) => `BEGIN:VCALENDAR\nVERSION:2.0\n${body}\nEND:VCALENDAR`;
const win = { fromMs: NOW - 86_400_000, toMs: NOW + 30 * 86_400_000 };

describe("ics reader", () => {
  it("unfolds continuation lines", () => {
    expect(unfoldIcs("SUMMARY:Long\n  tail")).toEqual(["SUMMARY:Long tail"]);
  });

  it("reads dates, all-day and UTC stamps", () => {
    expect(parseIcsDate("20260823", { VALUE: "DATE" })?.allDay).toBe(true);
    expect(parseIcsDate("20260823T093000Z")?.ms).toBe(Date.UTC(2026, 7, 23, 9, 30, 0));
    expect(parseIcsDate("nonsense")).toBeNull();
  });

  it("parses a single event with title and location", () => {
    const events = parseIcs(
      feed("BEGIN:VEVENT\nUID:a1\nDTSTART:20260823T093000Z\nDTEND:20260823T100000Z\nSUMMARY:Coach call\nLOCATION:Gym\nEND:VEVENT"),
      win,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ uid: "a1", title: "Coach call", location: "Gym", allDay: false });
  });

  it("drops cancelled events and events outside the window", () => {
    const events = parseIcs(
      feed(
        "BEGIN:VEVENT\nUID:c1\nDTSTART:20260823T093000Z\nSTATUS:CANCELLED\nEND:VEVENT\n" +
          "BEGIN:VEVENT\nUID:c2\nDTSTART:20270823T093000Z\nEND:VEVENT",
      ),
      win,
    );
    expect(events).toHaveLength(0);
  });

  it("expands simple weekly recurrence inside the window only", () => {
    const events = parseIcs(
      feed("BEGIN:VEVENT\nUID:r1\nDTSTART:20260823T093000Z\nRRULE:FREQ=WEEKLY;COUNT=10\nSUMMARY:Standup\nEND:VEVENT"),
      win,
    );
    expect(events.length).toBe(5);
  });

  it("skips recurrence it cannot honestly expand", () => {
    const events = parseIcs(
      feed("BEGIN:VEVENT\nUID:r2\nDTSTART:20260823T093000Z\nRRULE:FREQ=MONTHLY;BYDAY=2TU\nEND:VEVENT"),
      win,
    );
    expect(events).toHaveLength(1); // the first occurrence only
  });

  it("normalizes webcal and rejects insecure links", () => {
    expect(normalizeCalendarUrl("webcal://x.test/a.ics")).toBe("https://x.test/a.ics");
    expect(normalizeCalendarUrl("http://x.test/a.ics")).toBeNull();
    expect(normalizeCalendarUrl("  ")).toBeNull();
  });
});

describe("calendar sense", () => {
  const soon: CalendarEventRow = {
    id: "e1", title: "Coach call", location: "Gym", starts_at: iso(9, 20), ends_at: iso(10), all_day: false,
  };

  it("surfaces something starting soon", () => {
    const s = calendarEventToSignal(soon, scope, NOW);
    expect(s?.type).toBe("meeting_starting_soon");
    expect(s?.why).toContain("Coach call");
    expect(s?.sourceRefs?.[0]).toMatchObject({ kind: "calendar_event", id: "e1" });
  });

  it("stays quiet on all-day entries and on things far away", () => {
    expect(calendarEventToSignal({ ...soon, all_day: true }, scope, NOW)).toBeNull();
    expect(calendarEventToSignal({ ...soon, starts_at: iso(15) }, scope, NOW)).toBeNull();
    expect(calendarEventToSignal({ ...soon, starts_at: iso(8) }, scope, NOW)).toBeNull();
  });

  it("reads as time sensitive through the central scorer", () => {
    const s = calendarEventToSignal(soon, scope, NOW)!;
    const r = scoreRelevance(s, { hoursUntilDue: 0.3 });
    expect(r.factors.timeSensitivity).toBeGreaterThanOrEqual(0.9);
    expect(r.score).toBeGreaterThan(0.4);
  });

  it("flags a promise that lands inside a booked block", () => {
    const s = commitmentCollisionToSignal(
      { id: "c1", summary: "Send Nikki the roster", due_at: iso(9, 40), status: "open" },
      [soon],
      scope,
      NOW,
    );
    expect(s?.type).toBe("commitment_collides_with_meeting");
    expect(s?.entityId).toBe("c1");
    expect(s?.sourceRefs).toHaveLength(2);
  });

  it("does not invent collisions", () => {
    const c = { id: "c2", summary: "Later thing", due_at: iso(12), status: "open" };
    expect(commitmentCollisionToSignal(c, [soon], scope, NOW)).toBeNull();
    expect(commitmentCollisionToSignal({ ...c, status: "done" }, [soon], scope, NOW)).toBeNull();
    expect(commitmentCollisionToSignal({ ...c, due_at: null }, [soon], scope, NOW)).toBeNull();
  });

  it("never reports a promise as clashing with its own calendar entry", () => {
    const c = { id: "c3", summary: "Storage unit payment", due_at: iso(9, 40), status: "open" };
    const filed = { ...soon, id: "e9", title: "Reminder: Storage unit payment" };
    expect(commitmentCollisionToSignal(c, [filed], scope, NOW)).toBeNull();
    expect(commitmentCollisionToSignal(c, [{ ...soon, id: "e10", title: "Storage unit payment" }], scope, NOW)).toBeNull();
  });


  it("bundles both senses in one call and keeps scope on every signal", () => {
    const out = calendarSignals(
      [soon],
      [{ id: "c1", summary: "Send roster", due_at: iso(9, 40), status: "open" }],
      scope,
      NOW,
    );
    expect(out.map((s) => s.type)).toEqual(["meeting_starting_soon", "commitment_collides_with_meeting"]);
    expect(out.every((s) => s.scope.organizationId === null)).toBe(true);
  });
});

describe("a stay that is already underway", () => {
  it("stays in the window it overlaps, not only the one it starts in", () => {
    const feed = [
      "BEGIN:VEVENT",
      "UID:stay@example",
      "DTSTART;VALUE=DATE:20260909",
      "DTEND;VALUE=DATE:20260920",
      "SUMMARY:Stay at Wingate by Wyndham",
      "LOCATION:Chantilly\\, VA",
      "END:VEVENT",
    ].join("\r\n");
    const from = Date.UTC(2026, 8, 14);
    const events = parseIcs(feed, { fromMs: from, toMs: from + 30 * 86_400_000 });
    expect(events).toHaveLength(1);
    expect(events[0].allDay).toBe(true);
    expect(events[0].endsAt).toBe(new Date(Date.UTC(2026, 8, 20)).toISOString());
  });

  it("says nothing about an entry that already ended", () => {
    const feed = [
      "BEGIN:VEVENT",
      "UID:past@example",
      "DTSTART;VALUE=DATE:20260901",
      "DTEND;VALUE=DATE:20260903",
      "SUMMARY:Old stay",
      "END:VEVENT",
    ].join("\r\n");
    const from = Date.UTC(2026, 8, 14);
    expect(parseIcs(feed, { fromMs: from, toMs: from + 86_400_000 })).toHaveLength(0);
  });
});
