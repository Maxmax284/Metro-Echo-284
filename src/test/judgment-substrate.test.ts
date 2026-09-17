// The judgment substrate is internal. These tests hold it to the doctrine:
// nothing invented, unknown stays unknown, and no user-facing mode.
import { describe, expect, it } from "vitest";
import { judgmentBlock } from "../../supabase/functions/_shared/judgment/index.ts";
import { activeArchetypes, inferArchetypes } from "../../supabase/functions/_shared/judgment/archetype.ts";
import { consequenceOf, consequenceImpact, needsYouNow } from "../../supabase/functions/_shared/judgment/consequence.ts";
import { compareOptions } from "../../supabase/functions/_shared/judgment/friction.ts";
import { applicableExperience, yieldsToCurrent, type ExperienceEntry } from "../../supabase/functions/_shared/judgment/experience.ts";
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
  it("ranks a recorded consequence above ordinary volume", () => {
    const high = consequenceOf({ touchesCommitment: true, hoursUntil: 2, movedSomethingBooked: true, changed: true });
    const noise = consequenceOf({ broadcast: true });
    expect(consequenceImpact(high.level)).toBeGreaterThan(consequenceImpact(noise.level));
  });

  it("keeps quiet hours for anything short of high consequence", () => {
    expect(needsYouNow("moderate", { inQuietHours: true })).toBe(false);
    expect(needsYouNow("high", { inQuietHours: true })).toBe(true);
  });
});

describe("friction", () => {
  it("refuses a cheapest answer across two currencies", () => {
    const out = compareOptions([
      { label: "bus", costMinor: 200, currency: "USD" },
      { label: "van", costMinor: 6000, currency: "THB" },
    ]);
    expect(out.cheapest).toBeNull();
    expect(out.unknown.join(" ").toLowerCase()).toMatch(/currenc/);
  });

  it("names a tie rather than picking a winner", () => {
    const out = compareOptions([
      { label: "a", minutes: 30, costMinor: 500, currency: "USD" },
      { label: "b", minutes: 30, costMinor: 500, currency: "USD" },
    ]);
    expect(out.fastest).toBeNull();
  });
});

describe("what bit me before", () => {
  const held: ExperienceEntry[] = [
    { id: "1", lesson: "cash only last time", origin: "user_reported", recordedAt: daysAgo(10), scope: "clinic" },
    { id: "2", lesson: "probably cash only", origin: "inferred_pattern", recordedAt: daysAgo(2000), scope: "clinic" },
  ];

  it("keeps the origin attached and drops stale experience", () => {
    const out = applicableExperience(held, { now: NOW, scope: "clinic" });
    expect(out.length).toBe(1);
    expect(out[0].origin).toBe("user_reported");
  });

  it("yields to a newer authoritative source", () => {
    expect(yieldsToCurrent(held[0], { source: "clinic website", authority: "official", readAt: daysAgo(1) }, NOW)).toBe(true);
  });
});

describe("rhythm without surveillance", () => {
  it("drops a routine nobody has confirmed in a month", () => {
    expect(activeRhythms([
      { id: "r1", label: "training", origin: "recurring_event", weekdays: [1], lastSeenAt: daysAgo(60), seen: 9 },
    ], NOW)).toEqual([]);
  });

  it("keeps a live recurring routine that has actually been seen", () => {
    expect(activeRhythms([
      { id: "r2", label: "training", origin: "recurring_event", weekdays: [1], lastSeenAt: daysAgo(2), seen: 9 },
    ], NOW).length).toBe(1);
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
      { topic: "emergency", country: "TH", value: "191", stamp: { source: "gov", authority: "official", readAt: daysAgo(2) } },
      { topic: "emergency", country: "TH", value: "911", stamp: { source: "blog", authority: "public", readAt: daysAgo(1) } },
    ], NOW);
    expect(out.disagreements.length).toBe(1);
  });
});
