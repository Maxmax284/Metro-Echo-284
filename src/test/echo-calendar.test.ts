// Echo's own calendar entries: shape rules, the Google body, and what counts as
// "changed in Google". Pure functions only — no network, no database.
import { describe, expect, it } from "vitest";
import {
  googleBodyFor,
  normalizeEchoEvent,
  remoteChanges,
  type EchoEventRow,
} from "../../supabase/functions/_shared/echoCalendarShape";

const row = (over: Partial<EchoEventRow> = {}): EchoEventRow => ({
  id: "e1",
  title: "ADHD appointment",
  starts_at: "2026-09-20T20:00:00.000Z",
  ends_at: "2026-09-20T21:00:00.000Z",
  all_day: false,
  location: "Clinic",
  description: null,
  google_event_id: null,
  google_calendar_id: null,
  ...over,
});

describe("normalizeEchoEvent", () => {
  it("refuses an entry with no name", () => {
    const r = normalizeEchoEvent({ title: "  ", starts_at: "2026-09-20T20:00:00Z" });
    expect(r.ok).toBe(false);
  });

  it("refuses a start that is not a real time", () => {
    const r = normalizeEchoEvent({ title: "Thing", starts_at: "not a time" });
    expect(r.ok).toBe(false);
  });

  it("refuses an end before the start", () => {
    const r = normalizeEchoEvent({
      title: "Thing",
      starts_at: "2026-09-20T20:00:00Z",
      ends_at: "2026-09-20T19:00:00Z",
    });
    expect(r.ok).toBe(false);
  });

  it("gives a timed entry an hour when no end is offered", () => {
    const r = normalizeEchoEvent({ title: "Thing", starts_at: "2026-09-20T20:00:00Z" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ends_at).toBe("2026-09-20T21:00:00.000Z");
  });

  it("gives an all-day entry the whole day", () => {
    const r = normalizeEchoEvent({ title: "Trip", starts_at: "2026-09-20T00:00:00Z", all_day: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.ends_at).toBe("2026-09-21T00:00:00.000Z");
  });
});

describe("googleBodyFor", () => {
  it("sends a timed entry with the person's zone", () => {
    const body = googleBodyFor(row(), "America/New_York") as Record<string, any>;
    expect(body.summary).toBe("ADHD appointment");
    expect(body.start.timeZone).toBe("America/New_York");
    expect(body.start.dateTime).toBe("2026-09-20T20:00:00.000Z");
  });

  it("sends an all-day entry as calendar dates", () => {
    const body = googleBodyFor(row({ all_day: true }), "UTC") as Record<string, any>;
    expect(body.start.date).toBe("2026-09-20");
    expect(body.start.dateTime).toBeUndefined();
  });
});

describe("remoteChanges", () => {
  const remote = {
    deleted: false,
    title: "ADHD appointment",
    location: "Clinic",
    starts_at: "2026-09-20T20:00:00.000Z",
    ends_at: "2026-09-20T21:00:00.000Z",
    all_day: false,
  };

  it("says nothing when the copies agree", () => {
    expect(remoteChanges(row(), remote)).toEqual({});
  });

  it("does not care how the same instant is written", () => {
    expect(remoteChanges(row(), { ...remote, starts_at: "2026-09-20T20:00:00Z" })).toEqual({});
  });

  it("reports a moved time", () => {
    const diff = remoteChanges(row(), { ...remote, starts_at: "2026-09-20T22:00:00.000Z" });
    expect(diff.starts_at).toBe("2026-09-20T22:00:00.000Z");
  });

  it("reports a renamed entry", () => {
    expect(remoteChanges(row(), { ...remote, title: "Doctor" }).title).toBe("Doctor");
  });

  it("stays silent about a deleted entry — deletion is handled on its own", () => {
    expect(remoteChanges(row(), { ...remote, deleted: true })).toEqual({});
  });
});
