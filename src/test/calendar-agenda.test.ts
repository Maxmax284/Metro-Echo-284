import { describe, expect, it } from "vitest";
import {
  agendaSpanFromWords,
  buildAgenda,
} from "../../supabase/functions/_shared/calendarAgenda";
import type { CalReadEvent } from "../../supabase/functions/_shared/calendarRead";

const NOW = "2026-09-10T12:00:00.000Z";
const TZ = "UTC";

function ev(p: Partial<CalReadEvent> & { starts_at: string; title: string }): CalReadEvent {
  return {
    feed_id: "f1",
    uid: p.uid ?? null,
    starts_at: p.starts_at,
    ends_at: p.ends_at ?? null,
    title: p.title,
    location: p.location ?? null,
    all_day: p.all_day ?? null,
  };
}

describe("calendar agenda board", () => {
  it("groups the day's real events in order with times", () => {
    const agenda = buildAgenda({
      events: [
        ev({ starts_at: "2026-09-10T14:00:00.000Z", title: "Call with Nikki" }),
        ev({ starts_at: "2026-09-10T09:00:00.000Z", title: "ADHD appointment", location: "Clinic" }),
      ],
      now: NOW,
      tz: TZ,
      days: 1,
    });
    expect(agenda.days).toHaveLength(1);
    expect(agenda.days[0].lines.map((l) => l.text)).toEqual([
      "9:00 AM — ADHD appointment · Clinic",
      "2:00 PM — Call with Nikki",
    ]);
    expect(agenda.days[0].lines[0]).toMatchObject({ starts_at: "2026-09-10T09:00:00.000Z" });
    expect(agenda.text).toContain("Today, Sep 10");
  });

  it("says an ongoing multi-day stay is running now", () => {
    const agenda = buildAgenda({
      events: [
        ev({
          starts_at: "2026-09-09T06:00:00.000Z",
          ends_at: "2026-09-20T04:00:00.000Z",
          title: "Wingate stay",
        }),
      ],
      now: NOW,
      tz: TZ,
      days: 1,
    });
    expect(agenda.days[0].ongoing[0]).toContain("Wingate stay");
    expect(agenda.text).toContain("On now:");
  });

  it("shows an all-day entry without inventing a time", () => {
    const agenda = buildAgenda({
      events: [ev({ starts_at: "2026-09-10T00:00:00.000Z", title: "Labor Day", all_day: true })],
      now: NOW,
      tz: TZ,
      days: 1,
    });
    expect(agenda.days[0].lines[0].text).toBe("all day — Labor Day");
  });

  it("labels a staged change as Echo's read, attached to its event", () => {
    const agenda = buildAgenda({
      events: [ev({ uid: "u1", starts_at: "2026-09-10T09:00:00.000Z", title: "ADHD appointment" })],
      pending: [{ title: "Change time on ADHD appointment", event_uid: "u1" }],
      now: NOW,
      tz: TZ,
      days: 1,
    });
    const overlays = agenda.days[0].lines[0].overlays;
    expect(overlays[0].kind).toBe("pending_change");
    expect(agenda.text).toContain("Echo's read: waiting on your yes");
  });

  it("puts a promise due that day on the board as a read, not a calendar fact", () => {
    const agenda = buildAgenda({
      events: [ev({ starts_at: "2026-09-10T09:00:00.000Z", title: "ADHD appointment" })],
      commitments: [{ summary: "send the invoice", due_at: "2026-09-10T15:00:00.000Z" }],
      now: NOW,
      tz: TZ,
      days: 1,
    });
    expect(agenda.days[0].dayOverlays.some((o) => o.kind === "promise")).toBe(true);
    expect(agenda.text).toContain("you owe: send the invoice");
  });

  it("is honest when the day is empty", () => {
    const agenda = buildAgenda({ events: [], now: NOW, tz: TZ, days: 1 });
    expect(agenda.text).toBe("Today, Sep 10\nNothing on the calendar.");
  });

  it("skips empty days on a week view and offers the app when it runs deep", () => {
    const agenda = buildAgenda({
      events: [ev({ starts_at: "2026-09-12T09:00:00.000Z", title: "Flight" })],
      now: NOW,
      tz: TZ,
      days: 7,
    });
    expect(agenda.text).toContain("Flight");
    expect(agenda.text).not.toContain("Tomorrow");
    expect(agenda.deep).toBe(true);
  });

  it("reads day/week/tomorrow out of the person's own words", () => {
    expect(agendaSpanFromWords("what does my week look like")).toEqual({ days: 7, startOffset: 0 });
    expect(agendaSpanFromWords("show me tomorrow")).toEqual({ days: 1, startOffset: 1 });
    expect(agendaSpanFromWords("what's my day")).toEqual({ days: 1, startOffset: 0 });
  });
});
