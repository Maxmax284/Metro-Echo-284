import { describe, expect, it } from "vitest";
import {
  ago, proofLine, telegramCard, emailCard, calendarCard, wearableCard,
  platformCard, sourceLabel, DEVICE_FAMILIES,
} from "@/lib/connections";

const NOW = new Date("2026-09-02T10:00:00Z").getTime();
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("proof lines", () => {
  it("reads the age of a recorded moment", () => {
    expect(ago(minsAgo(2), NOW)).toBe("2m ago");
    expect(ago(minsAgo(180), NOW)).toBe("3h ago");
    expect(ago(null, NOW)).toBeNull();
  });

  it("never fakes a proof when nothing was recorded", () => {
    expect(proofLine("Last received", null, "Never linked", NOW)).toBe("Never linked");
    expect(proofLine("Last received", minsAgo(1), "Never linked", NOW)).toBe("Last received · 1m ago");
  });
});

describe("telegram", () => {
  const base = { linked: true, lastInAt: minsAgo(2), captureOn: true, remindersOn: true, botConfigured: true };

  it("is connected with real evidence and never claims execution", () => {
    const c = telegramCard(base, NOW);
    expect(c.state).toBe("connected");
    expect(c.proof).toBe("Last received · 2m ago");
    expect(c.facts).toContain("Execution · never");
  });

  it("separates a missing key from an unlinked chat from a silent chat", () => {
    expect(telegramCard({ ...base, botConfigured: false }, NOW).fix).toMatch(/key is missing/i);
    expect(telegramCard({ ...base, linked: false }, NOW).fix).toMatch(/not linked/i);
    const silent = telegramCard({ ...base, lastInAt: null }, NOW);
    expect(silent.state).toBe("no_data");
    expect(silent.proof).toBe("Never received a message");
  });

  it("calls capture-off partial rather than connected", () => {
    expect(telegramCard({ ...base, captureOn: false }, NOW).state).toBe("partial");
  });
});

describe("email and calendar", () => {
  it("waits for one real message before claiming a working path", () => {
    expect(emailCard({ addressActive: true, lastReceivedAt: null }, NOW).state).toBe("no_data");
    expect(emailCard({ addressActive: true, lastReceivedAt: minsAgo(30) }, NOW).state).toBe("connected");
    expect(emailCard({ addressActive: false, lastReceivedAt: null }, NOW).state).toBe("needs_setup");
  });

  it("distinguishes broken, off, never-checked and live calendars", () => {
    const f = { feeds: 2, activeFeeds: 2, lastSyncedAt: minsAgo(18), brokenFeeds: 0 };
    expect(calendarCard(f, NOW).state).toBe("connected");
    expect(calendarCard(f, NOW).proof).toBe("Last sync · 18m ago");
    expect(calendarCard({ ...f, brokenFeeds: 1 }, NOW).state).toBe("attention");
    expect(calendarCard({ ...f, activeFeeds: 0 }, NOW).state).toBe("off");
    expect(calendarCard({ ...f, lastSyncedAt: null }, NOW).state).toBe("no_data");
    expect(calendarCard({ feeds: 0, activeFeeds: 0, lastSyncedAt: null, brokenFeeds: 0 }, NOW).state).toBe("needs_setup");
  });
});

describe("wearables", () => {
  it("off means off, not zero", () => {
    const c = wearableCard({ heartConsent: false, activityConsent: false, lastReadingAt: null, lastSource: null }, NOW);
    expect(c.state).toBe("off");
    expect(c.proof).toBe("No readings yet");
    expect(c.fix).toMatch(/nothing is read/i);
  });

  it("reports one-sided consent as partial and names the source", () => {
    const c = wearableCard(
      { heartConsent: true, activityConsent: false, lastReadingAt: minsAgo(5), lastSource: "bluetooth" },
      NOW,
    );
    expect(c.state).toBe("partial");
    expect(c.facts).toContain("Last source · Bluetooth strap");
  });

  it("keeps body data out of the decision seat", () => {
    const c = wearableCard({ heartConsent: true, activityConsent: true, lastReadingAt: minsAgo(1), lastSource: "manual" }, NOW);
    expect(c.state).toBe("connected");
    expect(c.facts?.join(" ")).toMatch(/never what it decides/i);
  });

  it("labels manual entry honestly", () => {
    expect(sourceLabel("manual")).toBe("Entered by hand");
    expect(sourceLabel("shortcut")).toBe("Phone health data");
    expect(sourceLabel(null)).toBe("Unknown");
  });
});

describe("platforms and device families", () => {
  it("never says connected without a received record", () => {
    const c = platformCard({ key: "gth", label: "Ground Truth Hub", blurb: "x", enabled: true, lastAt: null }, NOW);
    expect(c.state).toBe("no_data");
    expect(c.proof).toBe("Never linked");
  });

  it("does not claim vendor accounts it cannot read", () => {
    const imported = DEVICE_FAMILIES.find((f) => f.key === "imported")!;
    expect(imported.supported).toBe(false);
    expect(imported.caveat).toMatch(/not directly connected yet/i);
  });
});
