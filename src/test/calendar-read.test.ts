import { describe, expect, it } from "vitest";
import {
  answerAfterEvent,
  answerCalendarQuestion,
  calendarContextBlock,
  eventsOnDay,
  isCalendarReadQuestion,
  overlapsOnDay,
  parseCalendarQuestion,
  type CalReadEvent,
} from "../../supabase/functions/_shared/calendarRead";

const now = "2026-09-11T04:00:00.000Z"; // 11:00 in Bangkok
const tz = "Asia/Bangkok";

const events: CalReadEvent[] = [
  { feed_id: "f", uid: "stay", starts_at: "2026-09-09T05:00:00.000Z", ends_at: "2026-09-20T05:00:00.000Z", title: "Wingate stay", location: "Bangkok" },
  { feed_id: "f", uid: "adhd", starts_at: "2026-09-11T07:00:00.000Z", ends_at: "2026-09-11T08:00:00.000Z", title: "ADHD appointment" },
  { feed_id: "f", uid: "call", starts_at: "2026-09-11T07:30:00.000Z", ends_at: "2026-09-11T08:30:00.000Z", title: "Nikki call" },
  { feed_id: "f", uid: "flight", starts_at: "2026-09-12T02:00:00.000Z", ends_at: null, title: "Flight to Tokyo" },
];

describe("reading the calendar", () => {
  it("knows a calendar question from a capture", () => {
    expect(isCalendarReadQuestion("what's on my calendar tomorrow?")).toBe(true);
    expect(isCalendarReadQuestion("pick up laundry")).toBe(false);
  });

  it("routes the question to the right read", () => {
    expect(parseCalendarQuestion("anything conflicting tomorrow").kind).toBe("conflicts");
    expect(parseCalendarQuestion("what do I have tomorrow").dayOffset).toBe(1);
    expect(parseCalendarQuestion("what's on right now").kind).toBe("now");
  });

  it("hears a week as a week, never as today", () => {
    expect(parseCalendarQuestion("what does my week look like").kind).toBe("week");
    expect(parseCalendarQuestion("this week").kind).toBe("week");
    const nextWeek = parseCalendarQuestion("anything next week");
    expect(nextWeek.kind).toBe("week");
    expect(nextWeek.weekOffset).toBe(1);
  });

  it("reads the week day by day, names the clear days, lists a stay once", () => {
    const answer = answerCalendarQuestion(parseCalendarQuestion("what does my week look like"), events, { now, tz });
    expect(answer.text).toContain("ADHD appointment");
    expect(answer.text).toContain("Flight to Tokyo");
    expect(answer.text.match(/Wingate stay/g)).toHaveLength(1);
    expect(answer.text).toContain("of the 7 days are clear");
  });

  it("counts a multi-day stay on every day it spans", () => {
    const titles = eventsOnDay(events, 0, now, tz).map((e) => e.title);
    expect(titles).toContain("Wingate stay");
    expect(titles).toContain("ADHD appointment");
  });

  it("says what is running and what is next", () => {
    const answer = answerCalendarQuestion(parseCalendarQuestion("right now"), events, { now, tz });
    expect(answer.text).toContain("On now: Wingate stay");
    expect(answer.text).toContain("Next: ADHD appointment");
  });

  it("reports only real clashes", () => {
    expect(overlapsOnDay(events, 0, now, tz).join(" ")).toContain("ADHD appointment");
    expect(overlapsOnDay(events, 1, now, tz)).toHaveLength(0);
  });

  it("stays quiet when a day is empty", () => {
    expect(answerCalendarQuestion({ kind: "day", dayOffset: 20, reference: null }, events, { now, tz }).text)
      .toMatch(/Nothing on your calendar/);
  });

  it("names the gap after an event", () => {
    const out = answerAfterEvent(events[1], events, { tz });
    expect(out.text).toContain("After ADHD appointment");
  });

  it("gives the model rows and forbids inventing others", () => {
    const block = calendarContextBlock(events, { now, tz });
    expect(block).toContain("ON NOW: Wingate stay");
    expect(block).toContain("say you do not see it");
    expect(calendarContextBlock([], { now, tz })).toBe("");
  });
});
