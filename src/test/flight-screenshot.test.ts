// A screenshot is evidence, not authority.
import { describe, expect, it } from "vitest";
import { airlineCodeFromName, looksLikeTravel, recognizeFlights } from "@/lib/flightRecognize";
import {
  clockOf,
  fillPatch,
  isSameFiledFlight,
  needsAnswer,
  reconcileFlight,
  reconcileWords,
  type FiledFlight,
} from "@/lib/flightReconcile";

const SHOT = `Trip confirmation
Confirmation code AUZ7KL
Thai Airways Intl Flight 6285
Departs Washington Dulles Intl Airport (IAD)
Saturday Sep 19 2026 1:15 AM
Arrives Taiwan Taoyuan Intl Airport (TPE)
Sunday Sep 20 2026 5:10 AM
Priceline trip number 15662012625`;

describe("reading a booking screenshot", () => {
  it("reads the carrier in words, the codes in brackets, and both days", () => {
    const r = recognizeFlights(SHOT, { today: "2026-09-18" });
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]).toMatchObject({
      flight_no: "TG6285",
      airline: "TG",
      depart_on: "2026-09-19",
      arrive_on: "2026-09-20",
      depart_time: "01:15",
      arrive_time: "05:10",
      origin: "IAD",
      destination: "TPE",
    });
    expect(r.booking_ref).toBe("AUZ7KL");
    expect(r.unread).toEqual([]);
  });

  it("only maps carriers it actually has on record", () => {
    expect(airlineCodeFromName("Thai Airways Intl Flight 6285")).toBe("TG");
    expect(airlineCodeFromName("Wolfe Air Charter Flight 12")).toBeNull();
  });

  it("does not read a carrier name with no flight number as a flight", () => {
    const r = recognizeFlights("Thai Airways is my favourite airline\nSep 19 2026", { today: "2026-09-18" });
    expect(r.legs).toEqual([]);
  });

  it("borrows nothing from the page when two legs are on it", () => {
    const two = `TG 601 departs 08:45\nBR 27 departs 13:10\n3 October 2026\n(BKK)\n(TPE)`;
    const r = recognizeFlights(two, { today: "2026-10-01" });
    expect(r.legs.length).toBeGreaterThan(1);
    expect(r.legs.every((l) => l.arrive_on == null)).toBe(true);
  });

  it("knows travel words from idle chat", () => {
    expect(looksLikeTravel(SHOT)).toBe(true);
    expect(looksLikeTravel("send me the photos from dinner")).toBe(false);
    expect(looksLikeTravel("I might take a flight one day")).toBe(false);
  });
});

const leg = recognizeFlights(SHOT, { today: "2026-09-18" }).legs[0];

function filed(over: Partial<FiledFlight> = {}): FiledFlight {
  return {
    id: "f1",
    origin: "",
    destination: "",
    depart_on: "2026-09-19",
    booking_ref: null,
    traveller_name: null,
    options: [{ id: "o1", flight_no: "TG6285", airline: "TG", depart_at: null, arrive_at: null }],
    ...over,
  };
}

describe("reconciling with a flight already on record", () => {
  it("matches only on the same number and the same day", () => {
    expect(isSameFiledFlight(filed(), leg)).toBe(true);
    expect(isSameFiledFlight(filed({ depart_on: "2026-09-20" }), leg)).toBe(false);
    expect(isSameFiledFlight(filed({ options: [{ flight_no: "BR27" }] }), leg)).toBe(false);
  });

  it("fills blanks and never overwrites what is already there", () => {
    const r = reconcileFlight(filed(), leg, { booking_ref: "AUZ7KL", traveller: null });
    expect(r.fills.map((f) => f.key).sort()).toEqual([
      "arrive_time",
      "booking_ref",
      "depart_time",
      "destination",
      "origin",
    ]);
    expect(r.conflicts).toEqual([]);
    const patch = fillPatch(filed(), r.fills)!;
    expect(patch.origin).toBe("IAD");
    expect(patch.booking_ref).toBe("AUZ7KL");
    expect(clockOf((patch.options as any[])[0].depart_at)).toBe("01:15");
  });

  it("says nothing changed when the evidence agrees", () => {
    const already = filed({
      origin: "IAD",
      destination: "TPE",
      booking_ref: "AUZ7KL",
      options: [{ flight_no: "TG6285", depart_at: "2026-09-19T01:15:00", arrive_at: "2026-09-20T05:10:00" }],
    });
    const r = reconcileFlight(already, leg, { booking_ref: "AUZ7KL" });
    expect(r.fills).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(fillPatch(already, r.fills)).toBeNull();
    expect(reconcileWords(r).join(" ")).toContain("matches what you already have");
  });

  it("raises a disagreement instead of rewriting a filled fact", () => {
    const already = filed({
      origin: "IAD",
      destination: "TPE",
      options: [{ flight_no: "TG6285", depart_at: "2026-09-19T02:40:00", arrive_at: null }],
    });
    const r = reconcileFlight(already, leg, {});
    expect(r.conflicts.map((c) => c.key)).toEqual(["depart_time"]);
    expect(needsAnswer(r)).toBe(true);
    expect(fillPatch(already, r.fills.filter((f) => f.key === "depart_time"))).toBeNull();
    expect(reconcileWords(r).join(" ")).toContain("left your record alone");
  });
});
