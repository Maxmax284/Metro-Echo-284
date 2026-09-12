import { describe, expect, it } from "vitest";
import {
  LEASE_MINUTES,
  calendarFingerprint,
  exhausted,
  isDue,
  leaseUntil,
  nextCheckAt,
  settleFromCalendar,
} from "../../supabase/functions/_shared/watch";
import {
  inferWatchKind,
  isStopWatchRequest,
  isWatchRequest,
  matchOpenWatch,
  watchCadenceMinutes,
  watchGoal,
  watchStatusReply,
} from "../../supabase/functions/_shared/watchIntent";

const NOW = new Date("2026-09-12T12:00:00Z");

describe("the clock", () => {
  it("checks a due watch and leaves a not-due one alone", () => {
    expect(isDue({ state: "watching", next_check_at: "2026-09-12T11:59:00Z" }, NOW)).toBe(true);
    expect(isDue({ state: "watching", next_check_at: "2026-09-12T12:30:00Z" }, NOW)).toBe(false);
  });

  it("holds a claimed watch far enough ahead that an overlapping run skips it", () => {
    const hold = leaseUntil(NOW);
    expect(new Date(hold).getTime()).toBe(NOW.getTime() + LEASE_MINUTES * 60_000);
    expect(isDue({ state: "watching", next_check_at: hold }, NOW)).toBe(false);
  });

  it("still moves the real next check forward after a finished check", () => {
    expect(new Date(nextCheckAt(30, 1, NOW)).getTime()).toBe(NOW.getTime() + 30 * 60_000);
  });

  it("gives up when the road runs out", () => {
    expect(exhausted({ attempts: 96, max_attempts: 96, stop_at: null }, NOW)).toBe(true);
  });
});

describe("quiet unless it matters", () => {
  const ev = { title: "Flight to Bangkok", starts_at: "2026-09-14T09:00:00Z", ends_at: "2026-09-14T12:00:00Z" };

  it("says nothing when only seconds or casing churn", () => {
    const fp = calendarFingerprint(ev);
    const noisy = { title: "flight to bangkok  ", starts_at: "2026-09-14T09:00:41Z", ends_at: ev.ends_at };
    const res = settleFromCalendar(fp, noisy);
    expect(res.state).toBe("watching");
    expect(res.outcome).toBeNull();
  });

  it("speaks up on a real move and on a removal", () => {
    const fp = calendarFingerprint(ev);
    expect(settleFromCalendar(fp, { ...ev, starts_at: "2026-09-14T13:00:00Z" }).state).toBe("done");
    expect(settleFromCalendar(fp, null).outcome).toContain("gone");
  });
});

describe("saying it out loud", () => {
  it("hears a watch request and a stop", () => {
    expect(isWatchRequest("keep an eye on my flight")).toBe(true);
    expect(isWatchRequest("keep checking until the deposit lands")).toBe(true);
    expect(isWatchRequest("what's on my calendar")).toBe(false);
    expect(isStopWatchRequest("stop watching that")).toBe(true);
  });

  it("reads which kind of thing is meant", () => {
    expect(inferWatchKind("my flight Friday")).toBe("calendar_event");
    expect(inferWatchKind("the deposit")).toBe("action");
    expect(inferWatchKind("this")).toBe("unknown");
  });

  it("uses the person's own urgency for cadence", () => {
    expect(watchCadenceMinutes("watch it closely")).toBe(10);
    expect(watchCadenceMinutes("check daily")).toBe(720);
    expect(watchCadenceMinutes("keep an eye on it")).toBe(30);
  });

  it("names the goal in plain words", () => {
    expect(watchGoal("my flight", "calendar_event")).toBe("Tell me if my flight moves or disappears.");
    expect(watchGoal("the deposit", "action_settled")).toContain("Keep checking the deposit");
  });
});

describe("stopping the right one", () => {
  const rows = [
    { id: "a", goal: "Tell me if my flight moves or disappears.", state: "watching" as const },
    { id: "b", goal: "Keep checking the deposit until it settles.", state: "watching" as const },
  ];

  it("matches by words", () => {
    const m = matchOpenWatch(rows, "the deposit");
    expect(m.status === "one" && m.watch.id).toBe("b");
  });

  it("asks which one when the reference is vague and there are several", () => {
    expect(matchOpenWatch(rows, "that").status).toBe("many");
  });

  it("takes the only one when there is only one", () => {
    expect(matchOpenWatch([rows[0]], "that").status).toBe("one");
  });

  it("says nothing is open when nothing is", () => {
    expect(matchOpenWatch([{ ...rows[0], state: "done" }], "flight").status).toBe("none");
    expect(watchStatusReply([{ ...rows[0], state: "done" }])).toContain("Nothing on watch");
  });
});
