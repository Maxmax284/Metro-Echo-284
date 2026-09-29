import { describe, expect, it } from "vitest";
import {
  WATCH_STATES,
  calendarFingerprint,
  exhausted,
  isDue,
  nextCadenceMinutes,
  settleFromAction,
  settleFromCalendar,
} from "../../supabase/functions/_shared/watch";
import { WATCH_LABEL, checkNowLine, sweepSummaryLine, type WatchState } from "@/lib/watch";

const base = {
  state: "watching" as WatchState,
  next_check_at: new Date("2026-01-01T00:00:00Z").toISOString(),
};

describe("watch vocabulary", () => {
  it("shows one label per state and nothing extra", () => {
    expect(Object.keys(WATCH_LABEL).sort()).toEqual([...WATCH_STATES].sort());
  });
});

describe("due and give-up", () => {
  it("is due only when open and the time has passed", () => {
    expect(isDue(base, new Date("2026-01-01T00:01:00Z"))).toBe(true);
    expect(isDue(base, new Date("2025-12-31T23:00:00Z"))).toBe(false);
    expect(isDue({ ...base, state: "done" }, new Date("2026-06-01T00:00:00Z"))).toBe(false);
  });

  it("always has a way to stop", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    expect(exhausted({ attempts: 96, max_attempts: 96, stop_at: null }, now)).toBe(true);
    expect(exhausted({ attempts: 1, max_attempts: 96, stop_at: "2026-01-01T00:00:00Z" }, now)).toBe(true);
    expect(exhausted({ attempts: 1, max_attempts: 96, stop_at: "2026-02-01T00:00:00Z" }, now)).toBe(false);
  });

  it("backs off but never past six hours", () => {
    expect(nextCadenceMinutes(30, 0)).toBe(30);
    expect(nextCadenceMinutes(30, 8)).toBe(60);
    expect(nextCadenceMinutes(30, 80)).toBe(360);
  });
});

describe("checkers", () => {
  it("settles an action watch on the action's own state", () => {
    expect(settleFromAction("executed").state).toBe("done");
    expect(settleFromAction("staged").state).toBe("needs_you");
    expect(settleFromAction("approved").state).toBe("watching");
    expect(settleFromAction("cancelled").state).toBe("couldnt_finish");
    expect(settleFromAction(null).state).toBe("couldnt_finish");
  });

  it("says nothing when a calendar entry has not changed", () => {
    const ev = { title: "Wingate", starts_at: "2026-01-01T10:00:00Z", ends_at: null };
    const fp = calendarFingerprint(ev);
    const quiet = settleFromCalendar(fp, ev);
    expect(quiet.state).toBe("watching");
    expect(quiet.outcome).toBeNull();
  });

  it("reports a real change and a removal", () => {
    const fp = calendarFingerprint({ title: "Wingate", starts_at: "2026-01-01T10:00:00Z" });
    expect(settleFromCalendar(fp, { title: "Wingate", starts_at: "2026-01-01T14:00:00Z" }).state).toBe("done");
    expect(settleFromCalendar(fp, null).outcome).toContain("gone");
  });
});

describe("check-now lines", () => {
  it("speaks the outcome first when a check found something", () => {
    expect(checkNowLine({ state: "needs_you", outcome: "New pages are showing." })).toBe("New pages are showing.");
  });

  it("never leaves a needs_you without words", () => {
    expect(checkNowLine({ state: "needs_you", outcome: null })).toBe("Something moved — have a look.");
  });

  it("treats silence as a valid answer, said plainly", () => {
    expect(checkNowLine({ state: "watching", outcome: null })).toBe("Checked just now — nothing has moved.");
  });

  it("summarizes a forced sweep honestly", () => {
    expect(sweepSummaryLine(0, 0)).toBe("Nothing open to check right now.");
    expect(sweepSummaryLine(3, 0)).toBe("Checked 3 watches — nothing has moved.");
    expect(sweepSummaryLine(1, 1)).toBe("Checked 1 watch — 1 has news.");
    expect(sweepSummaryLine(5, 2)).toBe("Checked 5 watches — 2 have news.");
  });
});
