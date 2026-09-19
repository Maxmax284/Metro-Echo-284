import { describe, expect, it } from "vitest";
import { terminalPath } from "@/lib/terminalPath";
import { preDepartureNotice, preDeparturePack } from "@/lib/preDeparture";

describe("terminalPath", () => {
  it("walks the departure stops in order and marks where you are", () => {
    const stops = terminalPath({
      step: "find_check_in",
      carrier: "EVA Air",
      zone: null,
      terminal: "2",
      gate: null,
      place: "Washington Dulles",
    });
    expect(stops.map((s) => s.key)).toEqual(["check_in", "bag_drop", "security", "gate"]);
    expect(stops[0].state).toBe("now");
    expect(stops[0].where).toMatch(/no zone or counter is on record/);
    expect(stops[3].where).toMatch(/gate not posted yet/);
  });

  it("names a zone and a gate only when they are on record", () => {
    const stops = terminalPath({
      step: "gate_posted",
      carrier: "EVA Air",
      zone: "Zone 4",
      terminal: "2",
      gate: "B49",
      place: "Washington Dulles",
    });
    expect(stops[0].where).toContain("Zone 4");
    expect(stops[0].state).toBe("done");
    expect(stops[3].state).toBe("now");
    expect(stops[3].where).toContain("Gate B49");
  });

  it("switches to the arrival walk once the flight is up", () => {
    const stops = terminalPath({
      step: "in_air",
      carrier: "EVA Air",
      zone: null,
      terminal: null,
      gate: null,
      place: "Taipei Taoyuan",
      arrivalSide: true,
      arrivalIntent: "destination",
    });
    expect(stops.map((s) => s.key)).toEqual(["gate", "baggage", "exit"]);
    expect(stops[1].where).toMatch(/If you checked a bag to this airport/i);
    expect(stops[1].where).toMatch(/No belt is on record/i);
  });

  it("does not send an unknown transfer passenger to baggage claim", () => {
    const stops = terminalPath({
      step: "in_air",
      carrier: "EVA Air",
      zone: null,
      terminal: "2",
      gate: "C6",
      place: "Taipei Taoyuan",
      arrivalSide: true,
      arrivalIntent: "unknown",
    });
    expect(stops.map((s) => s.label)).toEqual(["Off the aircraft", "Your next route", "Checked bags"]);
    expect(stops[1].where).toMatch(/Flight Connections or Transfer/);
    expect(stops[2].where).toMatch(/does not have that fact on record/);
  });

  it("keeps a confirmed connection on the transfer path without assuming immigration", () => {
    const stops = terminalPath({
      step: "in_air",
      carrier: "EVA Air",
      zone: null,
      terminal: "2",
      gate: "C6",
      place: "Taipei Taoyuan",
      arrivalSide: true,
      arrivalIntent: "connection",
    });
    expect(stops.map((s) => s.label)).toEqual(["Off the aircraft", "Flight connections", "Onward gate"]);
    expect(stops[2].where).toMatch(/does not assume you enter the country/);
  });
});

describe("preDepartureNotice", () => {
  const NOW = new Date("2026-09-19T01:00:00Z"); // 9:00 PM at Dulles

  it("says the errands once when the flight is close enough", () => {
    const pack = preDeparturePack({ departAt: "2026-09-19T01:15:00", fromIata: "IAD", toIata: "TPE", now: NOW });
    const notice = preDepartureNotice({
      pack,
      minsToDeparture: 255,
      flightWords: "BR3",
      fromIata: "IAD",
    });
    expect(notice?.title).toBe("Before you leave");
    expect(notice?.body).toContain("Check-in closes");
    expect(notice?.body).toContain("12:15 AM");
    expect(notice?.body).toMatch(/usual airline practice/);
  });

  it("stays quiet while the flight is still hours away", () => {
    const pack = preDeparturePack({ departAt: "2026-09-19T01:15:00", fromIata: "IAD", toIata: "TPE", now: NOW });
    expect(preDepartureNotice({ pack, minsToDeparture: 900, flightWords: "BR3", fromIata: "IAD" })).toBeNull();
  });
});
