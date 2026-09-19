import { describe, expect, it } from "vitest";
import { airportMismatchWords, airportsNamed } from "@/lib/airports";

describe("airportsNamed", () => {
  it("reads a name a person would actually say", () => {
    expect(airportsNamed("I'm at Dulles").map((a) => a.iata)).toContain("IAD");
    expect(airportsNamed("standing in Dallas").map((a) => a.iata)).toContain("DFW");
    expect(airportsNamed("at IAD now").map((a) => a.iata)).toContain("IAD");
  });
  it("matches nothing it does not keep", () => {
    expect(airportsNamed("at the bus station")).toEqual([]);
    expect(airportsNamed("")).toEqual([]);
  });
});

describe("airportMismatchWords", () => {
  it("names both airports and asks", () => {
    const out = airportMismatchWords("I just got to Dallas", "IAD");
    expect(out).toContain("Dallas/Fort Worth (DFW)");
    expect(out).toContain("Washington Dulles (IAD)");
    expect(out).toContain("Which one");
  });
  it("stays quiet when the airport matches, is unnamed, or is not kept", () => {
    expect(airportMismatchWords("I'm at Dulles", "IAD")).toBeNull();
    expect(airportMismatchWords("I'm at the terminal", "IAD")).toBeNull();
    expect(airportMismatchWords("I'm at Dallas", "ZZZ")).toBeNull();
  });
});
