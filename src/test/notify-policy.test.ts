import { describe, it, expect } from "vitest";
import {
  applyFloor,
  applyQuietHours,
  categoryForSituation,
  DEFAULT_NOTIFY_FLOORS,
  levelForUrgency,
  NOTIFY_CATEGORIES,
  pushUrgencyHeader,
  readFloors,
  readQuietHours,
} from "@/lib/notifyPolicy";

describe("the level ladder", () => {
  it("maps the awareness ladder onto notification levels", () => {
    expect(levelForUrgency("critical")).toBe("urgent");
    expect(levelForUrgency("time_sensitive")).toBe("important");
    expect(levelForUrgency("attention")).toBe("informational");
    expect(levelForUrgency("background")).toBe("digest");
  });

  it("tolerates the legacy words senders already use", () => {
    expect(levelForUrgency("urgent")).toBe("urgent");
    expect(levelForUrgency("high")).toBe("important");
    expect(levelForUrgency("normal")).toBe("informational");
    expect(levelForUrgency("low")).toBe("digest");
  });

  it("treats the unknown as informational, never as an emergency", () => {
    expect(levelForUrgency(undefined)).toBe("informational");
    expect(levelForUrgency("whatever")).toBe("informational");
  });
});

describe("categories", () => {
  it("reads situation kinds into the six homes", () => {
    expect(categoryForSituation("nudge.flight_before_you_leave")).toBe("flights");
    expect(categoryForSituation("journey_moved")).toBe("flights");
    expect(categoryForSituation("web_page_changed")).toBe("watches");
    expect(categoryForSituation("commitment")).toBe("schedule");
    expect(categoryForSituation("meeting_starting_soon")).toBe("schedule");
    expect(categoryForSituation("document")).toBe("documents");
    expect(categoryForSituation("sherlock_finding")).toBe("sherlock");
    expect(categoryForSituation("hazards")).toBe("safety");
  });

  it("returns null for the unknown — unknown keeps its old behavior", () => {
    expect(categoryForSituation("body_moved")).toBeNull();
    expect(categoryForSituation(null)).toBeNull();
  });
});

describe("floors", () => {
  it("defaults preserve what senders already do", () => {
    expect(DEFAULT_NOTIFY_FLOORS.flights).toBe("buzz");
    expect(DEFAULT_NOTIFY_FLOORS.schedule).toBe("buzz");
    expect(DEFAULT_NOTIFY_FLOORS.watches).toBe("buzz");
    expect(DEFAULT_NOTIFY_FLOORS.sherlock).toBe("digest");
  });

  it("reads stored floors defensively, ignoring garbage", () => {
    const floors = readFloors({ notify_floors: { watches: "today", bogus: "buzz", flights: 7 } });
    expect(floors.watches).toBe("today");
    expect(floors.flights).toBe("buzz");
    expect(Object.keys(floors).sort()).toEqual([...NOTIFY_CATEGORIES].sort());
  });

  it("tolerates a missing or malformed blob", () => {
    expect(readFloors(null).schedule).toBe("buzz");
    expect(readFloors({ notify_floors: "nope" }).sherlock).toBe("digest");
  });
});

describe("the gate", () => {
  const floors = readFloors({ notify_floors: { watches: "today", sherlock: "digest" } });

  it("lets critical punch through every floor, even the digest", () => {
    const d = applyFloor({ urgency: "critical", category: "sherlock", floors });
    expect(d.channel).toBe("push");
    expect(d.held).toBe(false);
    expect(d.because).toContain("punches through");
  });

  it("buzzes an important item when the floor allows it", () => {
    const d = applyFloor({ urgency: "time_sensitive", category: "flights", floors });
    expect(d.channel).toBe("push");
    expect(d.held).toBe(false);
  });

  it("holds an important item in Today when the floor says so", () => {
    const d = applyFloor({ urgency: "time_sensitive", category: "watches", floors });
    expect(d.channel).toBe("today");
    expect(d.held).toBe(true);
    expect(d.because).toContain("Today");
  });

  it("gathers an important item into the digest when the floor says so", () => {
    const d = applyFloor({ urgency: "time_sensitive", category: "sherlock", floors });
    expect(d.channel).toBe("digest");
    expect(d.held).toBe(true);
  });

  it("never buzzes the merely informational, no matter the floor", () => {
    const d = applyFloor({ urgency: "attention", category: "flights", floors });
    expect(d.channel).toBe("today");
    expect(d.held).toBe(false);
  });

  it("keeps unknown kinds on the behavior they already had", () => {
    const d = applyFloor({ urgency: "time_sensitive", category: null, floors });
    expect(d.channel).toBe("push");
    expect(d.held).toBe(false);
  });
});

describe("the wire priority", () => {
  it("maps levels onto the Web Push Urgency header", () => {
    expect(pushUrgencyHeader("urgent")).toBe("high");
    expect(pushUrgencyHeader("important")).toBe("high");
    expect(pushUrgencyHeader("informational")).toBe("normal");
    expect(pushUrgencyHeader("digest")).toBe("low");
  });
});

describe("the quiet window", () => {
  it("defaults to the hours the Settings form shows", () => {
    expect(readQuietHours(null)).toEqual({ start: "22:00", end: "07:00" });
    expect(readQuietHours({})).toEqual({ start: "22:00", end: "07:00" });
  });

  it("reads the person's own hours and ignores garbage", () => {
    expect(readQuietHours({ quiet_hours_start: "23:30", quiet_hours_end: "06:15" }))
      .toEqual({ start: "23:30", end: "06:15" });
    expect(readQuietHours({ quiet_hours_start: "bedtime", quiet_hours_end: 7 }))
      .toEqual({ start: "22:00", end: "07:00" });
    expect(readQuietHours({ quiet_hours_start: "25:00" }))
      .toEqual({ start: "22:00", end: "07:00" });
  });

  it("holds an important buzz until morning, with a plain-English because", () => {
    const floors = readFloors(null);
    const push = applyFloor({ urgency: "time_sensitive", category: "flights", floors });
    expect(push.channel).toBe("push");
    const held = applyQuietHours({ decision: push, inQuietHours: true });
    expect(held.channel).toBe("today");
    expect(held.held).toBe(true);
    expect(held.because).toContain("quiet hours");
  });

  it("lets the urgent punch through the window", () => {
    const floors = readFloors(null);
    const push = applyFloor({ urgency: "critical", category: "safety", floors });
    const d = applyQuietHours({ decision: push, inQuietHours: true });
    expect(d.channel).toBe("push");
    expect(d.held).toBe(false);
  });

  it("changes nothing outside the window or below the buzz line", () => {
    const floors = readFloors(null);
    const push = applyFloor({ urgency: "time_sensitive", category: "flights", floors });
    expect(applyQuietHours({ decision: push, inQuietHours: false }).channel).toBe("push");
    const quiet = applyFloor({ urgency: "attention", category: "flights", floors });
    expect(applyQuietHours({ decision: quiet, inQuietHours: true }).channel).toBe("today");
  });
});
