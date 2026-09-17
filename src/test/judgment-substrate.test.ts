// The judgment substrate is internal. These tests hold it to the doctrine:
// nothing invented, unknown stays unknown, and no user-facing mode.
import { describe, expect, it } from "vitest";
import { judgmentBlock } from "../../supabase/functions/_shared/judgment/index.ts";
import { activeArchetypes, inferArchetypes } from "../../supabase/functions/_shared/judgment/archetype.ts";
import { consequenceOf, consequenceImpact, needsYouNow } from "../../supabase/functions/_shared/judgment/consequence.ts";
import { compareOptions } from "../../supabase/functions/_shared/judgment/friction.ts";
import { applicableExperience, yieldsToCurrent } from "../../supabase/functions/_shared/judgment/experience.ts";
import { activeRhythms } from "../../supabase/functions/_shared/judgment/rhythm.ts";
import { platformRoles, domainForSource } from "../../supabase/functions/_shared/judgment/roleMap.ts";
import { reconcile } from "../../supabase/functions/_shared/judgment/worldBackbone.ts";

const NOW = new Date("2026-09-16T15:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("nothing in, nothing out", () => {
  it("stays silent when there is no evidence at all", () => {
    expect(judgmentBlock({ now: NOW })).toBe("");
    expect(inferArchetypes({}, NOW)).toEqual([]);
  });
});

describe("situation shapes", () => {
  it("reads a disrupted filed flight as a travel day and explains itself", () => {
    const out = inferArchetypes({ flightWithin24h: true, flightDisrupted: true }, NOW);
    expect(out[0].id).toBe("travel_day");
    expect(out[0].because.length).toBeGreaterThan(0);
    expect(out[0].confidence).toBeLessThanOrEqual(0.9);
  });

  it("expires, so a shape has to be re-earned", () => {
    const stale = inferArchetypes({ flightWithin24h: true }, NOW)
      .map((h) => ({ ...h, expiresAt: daysAgo(1) }));
    expect(activeArchetypes(stale, NOW)).toEqual([]);
  });
});

describe("consequence, not count", () => {
  it("ranks a recorded consequence above volume", () => {
    const high = consequenceOf({ money: true, deadline: true, hardToReverse: true });
    expect(consequenceImpact(high)).toBeGreaterThan(consequenceImpact(consequenceOf({})));
  });

  it("keeps quiet hours for anything short of high consequence", () => {
    expect(needsYouNow({ consequence: "moderate", quietHours: true })).toBe(false);
    expect(needsYouNow({ consequence: "high", quietHours: true })).toBe(true);
  });
});

describe("friction", () => {
  it("refuses a cheapest answer across two currencies", () => {
    const out = compareOptions([
      { label: "bus", money: 2, currency: "USD" },
      { label: "van", money: 60, currency: "THB" },
    ]);
    expect(out.cheapest).toBeNull();
    expect(out.unknown.join(" ")).toMatch(/currenc/i);
  });

  it("names a tie rather than picking a winner", () => {
    const out = compareOptions([
      { label: "a", minutes: 30, currency: "USD", money: 5 },
      { label: "b", minutes: 30, currency: "USD", money: 5 },
    ]);
    expect(out.fastest).toBeNull();
  });
});

describe("what bit me before", () => {
  it("keeps the origin attached and drops stale experience", () => {
    const rows = [
      { subject: "clinic", note: "cash only last time", origin: "user_reported" as const, recordedAt: daysAgo(10) },
      { subject: "clinic", note: "cash only", origin: "inferred_pattern" as const, recordedAt: daysAgo(2000) },
    ];
    const out = applicableExperience(rows, { now: NOW, subject: "clinic" });
    expect(out.length).toBe(1);
    expect(out[0].origin).toBe("user_reported");
  });

  it("yields to a newer authoritative source", () => {
    expect(yieldsToCurrent(
      { subject: "clinic", note: "cash only", origin: "user_reported", recordedAt: daysAgo(30) },
      { authority: "official", at: daysAgo(1) },
    )).toBe(true);
  });
});

describe("rhythm without surveillance", () => {
  it("drops a routine nobody has confirmed in a month", () => {
    const out = activeRhythms([
      { label: "training", origin: "recurring_calendar", lastSeen: daysAgo(60), seen: 9, weekday: 1 },
    ], NOW);
    expect(out).toEqual([]);
  });
});

describe("role map, not absorption", () => {
  it("maps every platform and claims nothing live without inbound facts", () => {
    const rows = platformRoles({});
    expect(rows.length).toBe(6);
    expect(rows.every((r) => r.state !== "connected")).toBe(true);
  });

  it("puts a platform signal in the right life domain", () => {
    expect(domainForSource("campstay")).toBeTruthy();
  });
});

describe("source disagreement", () => {
  it("shows the disagreement instead of smoothing it", () => {
    const out = reconcile([
      { topic: "emergency_number", value: "191", authority: "official", at: daysAgo(2), source: "gov" },
      { topic: "emergency_number", value: "911", authority: "public", at: daysAgo(1), source: "blog" },
    ]);
    expect(out.disagreements.length).toBe(1);
  });
});
