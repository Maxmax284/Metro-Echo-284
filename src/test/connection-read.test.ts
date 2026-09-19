import { describe, expect, it } from "vitest";
import { connectionAt, connectionRead } from "@/lib/connectionRead";
import type { Leg } from "@/lib/journey";

function leg(over: Partial<Leg> & { from: Leg["from"]; to: Leg["to"] }): Leg {
  return {
    plan_id: over.plan_id ?? "p",
    order: over.order ?? 0,
    flight_no: over.flight_no ?? null,
    airline: over.airline ?? null,
    live_checked_at: null,
    filed_status: null,
    override: null,
    override_note: null,
    ...over,
  } as Leg;
}

const end = (iata: string, at: string | null, terminal: string | null = null, gate: string | null = null) => ({
  iata,
  at,
  basis: "scheduled" as const,
  terminal,
  gate,
});

describe("connectionRead", () => {
  const landing = leg({
    plan_id: "a",
    flight_no: "BR3",
    airline: "EVA Air",
    from: end("IAD", "2026-09-19T22:00:00Z"),
    to: end("TPE", "2026-09-20T18:00:00Z", "2"),
  });
  const onward = leg({
    plan_id: "b",
    order: 1,
    flight_no: "BR67",
    airline: "EVA Air",
    from: end("TPE", "2026-09-20T22:00:00Z", "2"),
    to: end("BKK", "2026-09-21T01:00:00Z"),
  });

  it("leads with the onward flight, not the city", () => {
    const read = connectionRead(landing, onward, new Date("2026-09-20T18:10:00Z"));
    expect(read.lead).toContain("Connecting at");
    expect(read.lead).toContain("EVA Air BR67");
    expect(read.detail.join(" ")).toContain("No gate filed");
  });

  it("calls a short sit tight", () => {
    const tightOnward = leg({ ...onward, from: end("TPE", "2026-09-20T19:00:00Z", "2") });
    expect(connectionRead(landing, tightOnward, new Date("2026-09-20T18:10:00Z")).tight).toBe(true);
  });

  it("names a filed gate and never invents one", () => {
    const gated = leg({ ...onward, from: end("TPE", "2026-09-20T22:00:00Z", "2", "A5") });
    const read = connectionRead(landing, gated, new Date("2026-09-20T18:10:00Z"));
    expect(read.detail.join(" ")).toContain("Gate A5");
  });

  it("is null when the landing ends the journey", () => {
    expect(connectionAt([landing], 0)).toBeNull();
    expect(connectionAt([landing, onward], 0)).not.toBeNull();
  });

  it("is null when the next leg leaves from somewhere else", () => {
    const elsewhere = leg({ ...onward, from: end("HKG", "2026-09-20T22:00:00Z") });
    expect(connectionAt([landing, elsewhere], 0)).toBeNull();
  });
});
