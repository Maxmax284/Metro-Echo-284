import { describe, expect, it } from "vitest";
import {
  answerCalendarQuestion,
  dedupeEvents,
  type CalReadEvent,
} from "../../supabase/functions/_shared/calendarRead";
import { buildAgenda } from "../../supabase/functions/_shared/calendarAgenda";

const NOW = "2026-09-15T21:00:00Z";
const TZ = "America/New_York";

const dani: CalReadEvent = {
  feed_id: "google",
  uid: "dani-evening@google.com",
  starts_at: "2026-09-15T22:00:00Z",
  ends_at: "2026-09-15T23:00:00Z",
  title: "Evening Meetup with Dani",
  location: "One Loudoun or Old Town",
};
// The same appointment as carried by the subscribed link feed.
const daniMirror: CalReadEvent = { ...dani, feed_id: "ical" };
// A stay that has been running for days, carried twice.
const stay: CalReadEvent = {
  feed_id: "google",
  uid: null,
  starts_at: "2026-09-04T18:00:00Z",
  ends_at: "2026-09-19T15:00:00Z",
  title: "Stay at Wingate by Wyndham Chantilly",
  location: null,
};

describe("one appointment, one line", () => {
  it("collapses the same event carried by two feeds", () => {
    expect(dedupeEvents([dani, daniMirror])).toHaveLength(1);
    expect(dedupeEvents([stay, { ...stay, feed_id: "ical" }])).toHaveLength(1);
  });

  it("keeps two genuinely different events", () => {
    const other = { ...dani, uid: "other@google.com", title: "Dinner" };
    expect(dedupeEvents([dani, other])).toHaveLength(2);
  });

  it("keeps two instances of a repeating event at different times", () => {
    const nextWeek = { ...dani, starts_at: "2026-09-22T22:00:00Z", ends_at: "2026-09-22T23:00:00Z" };
    expect(dedupeEvents([dani, nextWeek])).toHaveLength(2);
  });

  it("says the day's answer once, not twice", () => {
    const { text } = answerCalendarQuestion(
      { kind: "day", dayOffset: 0, reference: null },
      [dani, daniMirror],
      { now: NOW, tz: TZ },
    );
    expect(text.match(/Evening Meetup with Dani/g)).toHaveLength(1);
  });

  it("says a running stay once on the board", () => {
    const agenda = buildAgenda({
      events: [stay, { ...stay, feed_id: "ical" }],
      now: NOW,
      tz: TZ,
      days: 1,
    });
    expect(agenda.text.match(/Wingate/g)).toHaveLength(1);
  });

  it("names a running event once in the model's context block", () => {
    const { text } = answerCalendarQuestion(
      { kind: "now", dayOffset: 0, reference: null },
      [stay, { ...stay, feed_id: "ical" }],
      { now: NOW, tz: TZ },
    );
    expect(text.match(/Wingate/g)).toHaveLength(1);
  });
});
