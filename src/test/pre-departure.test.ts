import { describe, expect, it } from "vitest";
import { preDeparturePack } from "@/lib/preDeparture";

/* The clock at Dulles on Sep 18 2026, 9:00 PM EDT — four and a quarter hours
   before the 1:15 AM Sep 19 ticket time. */
const NOW = new Date("2026-09-19T01:00:00Z"); // 9:00 PM in New York

describe("preDeparturePack", () => {
  it("builds the errands from the ticket time for an international flight", () => {
    const pack = preDeparturePack({ departAt: "2026-09-19T01:15:00", fromIata: "IAD", toIata: "TPE", now: NOW });
    expect(pack.show).toBe(true);
    expect(pack.international).toBe(true);
    const checkIn = pack.items.find((i) => i.key === "check_in")!;
    expect(checkIn.words).toContain("12:15 AM");
    expect(checkIn.words).toMatch(/international/);
    const gate = pack.items.find((i) => i.key === "at_gate")!;
    expect(gate.words).toContain("12:35 AM");
    expect(pack.items.map((i) => i.key)).toEqual(["check_in", "bag_drop", "security", "boarding_pass", "at_gate"]);
    expect(pack.note).toMatch(/usual airline practice/);
  });

  it("uses the home-flight cutoff when no border is crossed", () => {
    const pack = preDeparturePack({ departAt: "2026-09-19T01:15:00", fromIata: "IAD", toIata: "JFK", now: NOW });
    expect(pack.show).toBe(true);
    expect(pack.international).toBe(false);
    expect(pack.items.find((i) => i.key === "check_in")!.words).toContain("12:30 AM");
  });

  it("steps out of the way once boarding owns the card", () => {
    const soon = new Date("2026-09-19T04:50:00Z"); // 12:50 AM at Dulles, 25 min out
    const pack = preDeparturePack({ departAt: "2026-09-19T01:15:00", fromIata: "IAD", toIata: "TPE", now: soon });
    expect(pack.show).toBe(false);
  });

  it("stays silent without a departure time or beyond the horizon", () => {
    expect(preDeparturePack({ departAt: null, fromIata: "IAD", toIata: "TPE", now: NOW }).show).toBe(false);
    const far = preDeparturePack({ departAt: "2026-09-21T01:15:00", fromIata: "IAD", toIata: "TPE", now: NOW });
    expect(far.show).toBe(false);
  });

  it("reads zoned live times the same way", () => {
    const pack = preDeparturePack({ departAt: "2026-09-19T05:15:00Z", fromIata: "IAD", toIata: "TPE", now: NOW });
    expect(pack.show).toBe(true);
    expect(pack.items.find((i) => i.key === "check_in")!.words).toContain("12:15 AM");
  });
});
