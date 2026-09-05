import { describe, expect, it } from "vitest";
import { agoPhrase, compactWhy, hasReveal, whyFor, whyLines } from "@/lib/whySurfaced";
import { HEALTH_LABEL, healthFor, healthSummary, needsAttention } from "@/lib/sourceHealth";

const NOW = new Date("2026-09-06T12:00:00Z").getTime();
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("the shared why reveal", () => {
  it("keeps the seven answers in one fixed order", () => {
    const why = whyFor({
      source: "Commitments",
      whatChanged: "A promise passed its due time.",
      comparedWith: "What's usual for it",
      reason: "The due time passed and it is still open.",
      at: minsAgo(5),
      whyItMatters: "You told someone this would be done.",
      ifIgnored: "It keeps ageing.",
    });
    expect(whyLines(why, NOW).map((l) => l.key)).toEqual([
      "source",
      "whatChanged",
      "comparedWith",
      "reason",
      "at",
      "whyItMatters",
      "ifIgnored",
    ]);
  });

  it("leaves unrecorded facts out instead of inventing them", () => {
    const why = whyFor({
      source: "Telegram",
      whatChanged: "A photo arrived.",
      reason: "It is not filed yet.",
      whyItMatters: "It has no home.",
    });
    const keys = whyLines(why, NOW).map((l) => l.key);
    expect(keys).not.toContain("comparedWith");
    expect(keys).not.toContain("at");
    expect(keys).not.toContain("ifIgnored");
  });

  it("compresses to the same truth for a chat or a wrist", () => {
    const line = compactWhy(
      whyFor({
        source: "Bookings",
        whatChanged: "A booking changed.",
        comparedWith: "The version you approved",
        reason: "The time moved after you approved it.",
        at: minsAgo(3),
        whyItMatters: "It is in the inbox.",
      }),
      NOW,
    );
    expect(line).toContain("The time moved after you approved it.");
    expect(line).toContain("Compared with the version you approved.");
    expect(line).toContain("From Bookings, 3m ago.");
  });

  it("says nothing when there is nothing recorded to reveal", () => {
    expect(hasReveal(null)).toBe(false);
    expect(hasReveal(whyFor({ source: "x", whatChanged: "", reason: "", whyItMatters: "y" }))).toBe(false);
  });

  it("reads real moments only", () => {
    expect(agoPhrase(null, NOW)).toBeNull();
    expect(agoPhrase("not a date", NOW)).toBeNull();
    expect(agoPhrase(minsAgo(0), NOW)).toBe("just now");
    expect(agoPhrase(minsAgo(90), NOW)).toBe("2h ago");
    expect(agoPhrase(minsAgo(60 * 24), NOW)).toBe("yesterday");
  });
});

describe("source health", () => {
  it("separates quiet from late", () => {
    const quiet = healthFor({
      key: "telegram",
      label: "Telegram",
      what: "Messages arrive as captures",
      conn: "connected",
      lastAt: minsAgo(60 * 40),
      expectEveryHours: null,
      now: NOW,
    });
    expect(quiet.state).toBe("healthy");

    const late = healthFor({
      key: "calendar",
      label: "Calendar",
      what: "Your meetings",
      conn: "connected",
      lastAt: minsAgo(60 * 5),
      expectEveryHours: 1,
      now: NOW,
    });
    expect(HEALTH_LABEL[late.state]).toBe("Late");
    expect(late.line).toContain("expected something by now");
  });

  it("never turns a missing reading into a zero", () => {
    const none = healthFor({
      key: "wearable",
      label: "Body signals",
      what: "Readings from your watch",
      conn: "connected",
      lastAt: null,
      expectEveryHours: 12,
      now: NOW,
    });
    expect(HEALTH_LABEL[none.state]).toBe("Missing data");
    expect(none.proof).toBe("No signal recorded");
  });

  it("summarises without counting nothing", () => {
    expect(healthSummary([])).toBe("Nothing is connected yet.");
    const list = [
      healthFor({ key: "a", label: "Telegram", what: "x", conn: "connected", lastAt: minsAgo(2), expectEveryHours: null, now: NOW }),
      healthFor({ key: "b", label: "Calendar", what: "y", conn: "attention", lastAt: minsAgo(2), expectEveryHours: 1, now: NOW }),
    ];
    expect(needsAttention(list)).toBe(true);
    expect(healthSummary(list)).toBe("Calendar needs a look.");
  });
});
