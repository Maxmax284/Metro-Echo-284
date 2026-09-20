// tripStandDown — a finished trip folds, a live one never does.
import { describe, expect, it } from "vitest";
import { STAND_DOWN_AFTER_MS, deskStandsDown, landingMs } from "@/lib/tripStandDown";
import { isWrappedUp, toggleWrapped } from "@/lib/tripWrapUp";

const NOW = Date.parse("2026-09-21T12:00:00Z");
const LANDED_LONG_AGO = Date.parse("2026-09-20T10:00:00+07:00"); // ~29h before NOW
const LANDED_RECENTLY = NOW - 2 * 3_600_000;

describe("landingMs", () => {
  it("prefers the filed arrival over the traveller's tap", () => {
    expect(landingMs("2026-09-20T10:05:00+07:00", "2026-09-20T03:30:00Z")).toBe(
      Date.parse("2026-09-20T10:05:00+07:00"),
    );
  });

  it("falls back to the traveller's landed word when nothing is filed", () => {
    // The TG637 case: a ticket-stamp flight with no provider times still lands.
    expect(landingMs(null, "2026-09-20T03:30:00Z")).toBe(Date.parse("2026-09-20T03:30:00Z"));
  });

  it("stays unknown when neither exists — an unknown never folds anything", () => {
    expect(landingMs(null, null)).toBeNull();
    expect(landingMs("not-a-time", null)).toBeNull();
  });
});

describe("deskStandsDown", () => {
  const base = {
    landed: true,
    landedAtMs: LANDED_LONG_AGO,
    now: NOW,
    onwardConfirmed: false,
    onwardCandidate: false,
    upcomingElsewhere: false,
  };

  it("folds a trip that landed a night ago with nothing onward", () => {
    expect(deskStandsDown(base)).toBe(true);
    expect(LANDED_LONG_AGO).toBeLessThanOrEqual(NOW - STAND_DOWN_AFTER_MS);
  });

  it("keeps the desk standing through the first hours on the ground", () => {
    expect(deskStandsDown({ ...base, landedAtMs: LANDED_RECENTLY })).toBe(false);
  });

  it("never folds a leg still in the air", () => {
    expect(deskStandsDown({ ...base, landed: false })).toBe(false);
  });

  it("stays standing while a confirmed onward leg waits — the connection case", () => {
    expect(deskStandsDown({ ...base, onwardConfirmed: true })).toBe(false);
  });

  it("stays standing while a proposed flight could still chain on", () => {
    // TG637 proposed after BR3 landed: the desk had to stay up for it.
    expect(deskStandsDown({ ...base, onwardCandidate: true })).toBe(false);
  });

  it("stays standing while another flight on the books is still ahead", () => {
    // PG165 confirmed for later: the desk sleeps only when nothing flies.
    expect(deskStandsDown({ ...base, upcomingElsewhere: true })).toBe(false);
  });

  it("never folds on an unknown landing time", () => {
    expect(deskStandsDown({ ...base, landedAtMs: null })).toBe(false);
  });
});

describe("your word that the trip is over", () => {
  const base = {
    landed: true,
    landedAtMs: LANDED_RECENTLY,
    now: NOW,
    onwardConfirmed: false,
    onwardCandidate: false,
    upcomingElsewhere: false,
  };

  it("folds immediately when you say the trip is done", () => {
    expect(deskStandsDown({ ...base, wrappedUp: true })).toBe(true);
  });

  it("still folds when the landing time is unknown but you said so", () => {
    expect(deskStandsDown({ ...base, landedAtMs: null, wrappedUp: true })).toBe(true);
  });

  it("never folds a leg still in the air, whatever you said", () => {
    expect(deskStandsDown({ ...base, landed: false, wrappedUp: true })).toBe(false);
  });

  it("lifts the fold again when a flight is on the books", () => {
    expect(deskStandsDown({ ...base, wrappedUp: true, onwardCandidate: true })).toBe(false);
    expect(deskStandsDown({ ...base, wrappedUp: true, upcomingElsewhere: true })).toBe(false);
  });
});

describe("toggleWrapped", () => {
  it("adds and removes without duplicates", () => {
    expect(toggleWrapped(undefined, "j1", true)).toEqual(["j1"]);
    expect(toggleWrapped(["j1"], "j1", true)).toEqual(["j1"]);
    expect(toggleWrapped(["j1", "j2"], "j1", false)).toEqual(["j2"]);
    expect(isWrappedUp(["j1"], "j1")).toBe(true);
    expect(isWrappedUp(["j1"], null)).toBe(false);
  });
});
