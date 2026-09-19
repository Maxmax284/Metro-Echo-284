import { describe, expect, it } from "vitest";
import { carrierId, mergeIdentity } from "@/lib/flightIdentity";
import { groundPath, type GroundInput } from "@/lib/groundPath";

const identity = mergeIdentity(
  { marketing: carrierId({ carrier: "Thai Airways", flight_no: "TG6285" }), operating: null, aliases: [] },
  { operating: carrierId({ carrier: "EVA Air", carrier_code: "BR", flight_no: "BR3" }) },
);

const base: GroundInput = {
  where: "at_airport",
  identity,
  fromPlace: "Washington Dulles",
  toPlace: "Taipei",
  terminal: null,
  gate: null,
  minsToDeparture: 200,
};

describe("groundPath", () => {
  it("sends you to the operating airline's counters and admits the zone is unknown", () => {
    const read = groundPath(base);
    expect(read.step).toBe("find_check_in");
    expect(read.lead).toContain("EVA Air");
    expect(read.lead).toContain("not on record");
    expect(read.needsCheckIn).toBe(true);
  });

  it("names the zone once a page has been read for it", () => {
    const read = groundPath({
      ...base,
      identity: mergeIdentity(identity, {
        check_in: { where: "Zone 2, main terminal", source_url: null, source_host: "evaair.com", read_at: "2026-09-19T10:00:00Z" },
      }),
    });
    expect(read.needsCheckIn).toBe(false);
    expect(read.detail.join(" ")).toContain("Zone 2");
  });

  it("never ends on a missing gate", () => {
    const read = groundPath({ ...base, throughSecurity: true });
    expect(read.step).toBe("gate_pending");
    expect(read.lead).toContain("No gate filed yet");
    expect(read.lead).toContain("EVA Air");
  });

  it("leads with the gate once one is posted, and with boarding when it is close", () => {
    expect(groundPath({ ...base, gate: "B49" }).lead).toContain("Gate B49 is posted");
    expect(groundPath({ ...base, gate: "B49", minsToDeparture: 25 }).step).toBe("boarding");
  });

  it("keeps out of the way before the airport and in the air", () => {
    expect(groundPath({ ...base, where: "before" }).step).toBe("before_airport");
    expect(groundPath({ ...base, where: "in_air" }).lead).toContain("In the air to Taipei");
    expect(groundPath({ ...base, where: "done" }).lead).toContain("Immigration");
  });
});
