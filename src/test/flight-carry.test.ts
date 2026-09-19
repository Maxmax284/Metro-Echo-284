import { describe, expect, it } from "vitest";
import { carryFiled, isCarried, statusDiff, type LiveFlight } from "@/lib/flightStatus";

const base: LiveFlight = {
  flight_no: "BR3",
  flight_date: "2026-09-19",
  airline: "EVA Air",
  status: "scheduled",
  departure: {
    airport: "Dulles",
    iata: "IAD",
    terminal: "Main",
    gate: "B49",
    scheduled: "2026-09-19T21:15:00",
    estimated: null,
    actual: null,
    delay_min: null,
  },
  arrival: {
    airport: "Taoyuan",
    iata: "TPE",
    terminal: "2",
    gate: null,
    scheduled: "2026-09-21T05:10:00",
    estimated: null,
    actual: null,
    delay_min: null,
  },
  checked_at: "2026-09-19T12:00:00Z",
};

const quiet: LiveFlight = {
  ...base,
  departure: { ...base.departure, gate: null, terminal: null },
  checked_at: "2026-09-19T13:00:00Z",
};

describe("carryFiled", () => {
  it("keeps a verified gate when the next reading is silent about it", () => {
    const next = carryFiled(base, quiet);
    expect(next.departure.gate).toBe("B49");
    expect(isCarried(next, "departure.gate")?.since).toBe(base.checked_at);
  });

  it("does not report a gate change when the gate was only kept", () => {
    expect(statusDiff(base, carryFiled(base, quiet))).toBeNull();
  });

  it("lets a cancellation clear the gate", () => {
    const cancelled = carryFiled(base, { ...quiet, status: "cancelled" });
    expect(cancelled.departure.gate).toBeNull();
    expect(cancelled.carried).toBeUndefined();
  });

  it("prefers a freshly read gate over the kept one", () => {
    const moved = carryFiled(base, { ...quiet, departure: { ...quiet.departure, gate: "C7" } });
    expect(moved.departure.gate).toBe("C7");
    expect(isCarried(moved, "departure.gate")).toBeNull();
  });
});
