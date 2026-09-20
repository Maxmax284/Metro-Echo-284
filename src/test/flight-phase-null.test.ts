import { describe, expect, it } from "vitest";
import { flightPhase } from "../../supabase/functions/_shared/flightStatus";

/* The TG637 case from the live Bangkok landing: the traveller's word says
   "landed", and there is no provider snapshot for the leg at all. Reading the
   phase of a snapshot that does not exist must answer "unknown", never crash. */
describe("flightPhase with no provider snapshot", () => {
  it("returns unknown for a null snapshot", () => {
    expect(flightPhase(null)).toBe("unknown");
  });

  it("returns unknown for an undefined snapshot", () => {
    expect(flightPhase(undefined)).toBe("unknown");
  });

  it("still reads a real landed snapshot", () => {
    expect(
      flightPhase({
        flight_no: "BR3",
        status: "landed",
        departure: { iata: "IAD", scheduled: null, estimated: null, actual: null, gate: null, terminal: null },
        arrival: { iata: "TPE", scheduled: null, estimated: null, actual: null, gate: null, terminal: null },
      } as never),
    ).toBe("landed");
  });
});
