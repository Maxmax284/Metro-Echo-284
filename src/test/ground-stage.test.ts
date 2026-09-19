import { describe, expect, it, beforeEach } from "vitest";
import { nextStage, readStage, writeStage } from "@/lib/groundStage";
import { whoWords } from "@/lib/flightPlan";

describe("groundStage", () => {
  beforeEach(() => localStorage.clear());

  it("starts away and remembers one tap at a time", () => {
    expect(readStage("p1")).toBe("away");
    writeStage("p1", "airport");
    expect(readStage("p1")).toBe("airport");
    writeStage("p1", "security");
    expect(readStage("p1")).toBe("security");
  });

  it("clears back out", () => {
    writeStage("p1", "security");
    writeStage("p1", "away");
    expect(readStage("p1")).toBe("away");
  });

  it("offers one next tap and then stops", () => {
    expect(nextStage("away")).toBe("airport");
    expect(nextStage("airport")).toBe("security");
    expect(nextStage("security")).toBeNull();
  });
});

describe("whoWords", () => {
  it("says a flight's name once", () => {
    expect(whoWords({ airline: "TG", flight_no: "TG6285" })).toBe("TG6285");
    expect(whoWords({ airline: "Thai Airways", flight_no: "TG6285" })).toBe("Thai Airways TG6285");
    expect(whoWords({ airline: null, flight_no: "BR3" })).toBe("BR3");
    expect(whoWords({ airline: "TG", flight_no: null })).toBe("TG");
  });
});
