import { describe, expect, it } from "vitest";
import { landedAlert } from "../../supabase/functions/_shared/landedAlert";
import type { LiveFlight } from "@/lib/flightStatus";

const live = (over: Partial<LiveFlight> = {}, arr: Record<string, unknown> = {}): LiveFlight =>
  ({
    flight_no: "TG637",
    status: "landed",
    departure: { airport: null, iata: "TPE", terminal: null, gate: null, scheduled: null, estimated: null, actual: null, delay_min: null },
    arrival: {
      airport: null,
      iata: "BKK",
      terminal: "2",
      gate: "D3",
      scheduled: "2026-09-21T18:30:00",
      estimated: null,
      actual: "2026-09-21T18:22:00",
      delay_min: null,
      ...arr,
    },
    ...over,
  }) as unknown as LiveFlight;

/* 18:40 in Bangkok, 18 minutes after the recorded touchdown. */
const justAfter = new Date("2026-09-21T11:40:00Z");

describe("landedAlert", () => {
  it("names the flight, the airport, the local time, the gate and the terminal", () => {
    const a = landedAlert({ planId: "p1", destinationIata: "BKK", live: live(), now: justAfter });
    expect(a?.title).toBe("TG637 touched down at Bangkok (BKK).");
    expect(a?.detail).toContain("6:22 PM");
    expect(a?.detail).toContain("Bangkok time");
    expect(a?.detail).toContain("Arrival gate D3, terminal 2");
    expect(a?.detail).toContain("Double-check the board in the terminal");
  });

  it("dedupes once per plan per touchdown day", () => {
    expect(landedAlert({ planId: "p1", destinationIata: "BKK", live: live(), now: justAfter })?.dedupeKey)
      .toBe("flight_landed:p1:2026-09-21");
  });

  it("says plainly when no gate or terminal was filed", () => {
    const a = landedAlert({
      planId: "p1",
      destinationIata: "BKK",
      live: live({}, { gate: null, terminal: null }),
      now: justAfter,
    });
    expect(a?.detail).toContain("No arrival gate or terminal on the record yet");
  });

  it("reports a real delay off the airline's own number", () => {
    const a = landedAlert({
      planId: "p1",
      destinationIata: "BKK",
      live: live({}, { delay_min: 35 }),
      now: justAfter,
    });
    expect(a?.detail).toContain("35 minutes behind the filed time");
  });

  it("stays quiet without a stamped arrival — a schedule is not a landing", () => {
    expect(
      landedAlert({ planId: "p1", destinationIata: "BKK", live: live({}, { actual: null }), now: justAfter }),
    ).toBeNull();
  });

  it("stays quiet while the flight is still in the air", () => {
    expect(
      landedAlert({
        planId: "p1",
        destinationIata: "BKK",
        live: live({ status: "active" }, { actual: null }),
        now: justAfter,
      }),
    ).toBeNull();
  });

  it("never announces an old landing as news", () => {
    const daysLater = new Date("2026-09-24T11:40:00Z");
    expect(landedAlert({ planId: "p1", destinationIata: "BKK", live: live(), now: daysLater })).toBeNull();
  });

  it("with no known airport timezone, only a fresh reading may speak", () => {
    const unknownPlace = live({}, { iata: "ZZZ" });
    expect(
      landedAlert({
        planId: "p1",
        destinationIata: "ZZZ",
        live: unknownPlace,
        checkedAt: new Date(justAfter.getTime() - 5 * 60_000).toISOString(),
        now: justAfter,
      }),
    ).not.toBeNull();
    expect(
      landedAlert({
        planId: "p1",
        destinationIata: "ZZZ",
        live: unknownPlace,
        checkedAt: new Date(justAfter.getTime() - 5 * 3_600_000).toISOString(),
        now: justAfter,
      }),
    ).toBeNull();
  });
});
