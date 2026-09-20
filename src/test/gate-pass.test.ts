// The PG165 case: a printed pass says boarding 15:15, departure 15:55, gate A2,
// seat 7F, zone 3. Boarding is the clock that matters, and it is never worked out
// from a departure time.
import { describe, it, expect } from "vitest";
import {
  boardingInstant,
  boardingRead,
  cleanDraft,
  clockMinutes,
  draftEmpty,
  gateMode,
  passCells,
  passConflicts,
  sameLocalDay,
  untilWords,
  ESTIMATE_WORDS,
  UNKNOWN_WORDS,
} from "@/lib/gatePass";
import type { LocalTransferVerification } from "@/lib/transferVerification";

const PASS: LocalTransferVerification = {
  gate: "A2",
  boarding_time: "15:15",
  seat: "7F",
  zone: "3",
  baggage_status: "unknown",
  transfer_route: "unknown",
  source: "boarding_pass",
  verified_at: "2026-09-20T07:00:00.000Z",
};

/** PG165 BKK→USM: 15:55 departure, Bangkok clock. */
const DEPART_AT = "2026-09-20T15:55:00+07:00";
const hhmm = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(11, 16);

describe("boarding time is its own fact", () => {
  it("leads with the traveller's confirmed boarding time, named to its source", () => {
    const read = boardingRead({ local: PASS, departAt: DEPART_AT, fmt: hhmm });
    expect(read.kind).toBe("confirmed");
    if (read.kind !== "confirmed") return;
    expect(read.time).toBe("15:15");
    expect(read.sourceWords).toContain("Boarding pass");
    expect(read.sourceWords).toContain("your word");
  });

  it("never manufactures a boarding time from a departure time", () => {
    const read = boardingRead({ local: null, departAt: DEPART_AT, fmt: hhmm });
    expect(read.kind).toBe("estimate");
    if (read.kind !== "estimate") return;
    expect(read.window).toBe("15:15–15:25");
    expect(read.words).toBe(ESTIMATE_WORDS);
    expect(read.words).toMatch(/planning window, not a boarding time/);
  });

  it("says plainly when there is nothing to plan around", () => {
    const read = boardingRead({ local: null, departAt: null, fmt: hhmm });
    expect(read).toEqual({ kind: "unknown", words: UNKNOWN_WORDS });
  });

  it("does not let an estimate replace a confirmed time", () => {
    const read = boardingRead({ local: PASS, departAt: DEPART_AT, fmt: hhmm });
    expect(read.kind).toBe("confirmed");
  });

  it("counts down to boarding, not to departure", () => {
    const at = boardingInstant({ boarding: "15:15", departAt: DEPART_AT, departLocal: "3:55 PM" });
    expect(at).toBe("2026-09-20T08:15:00.000Z");
    expect(untilWords(at, "2026-09-20T07:33:00.000Z")).toBe("in 42 min");
    expect(untilWords(at, "2026-09-20T08:15:00.000Z")).toBe("now");
    expect(untilWords(at, "2026-09-20T08:27:00.000Z")).toBe("12 min ago");
  });

  it("refuses a boarding clock that cannot belong to this departure", () => {
    expect(boardingInstant({ boarding: "23:40", departAt: DEPART_AT, departLocal: "15:55" })).toBeNull();
  });

  it("reads clocks in both 24-hour and 12-hour print", () => {
    expect(clockMinutes("15:15")).toBe(915);
    expect(clockMinutes("3:55 PM")).toBe(955);
    expect(clockMinutes("12:05 AM")).toBe(5);
    expect(clockMinutes("no time here")).toBeNull();
  });
});

describe("seat and zone belong to the traveller", () => {
  it("shows 7F and 3 with the source named", () => {
    const cells = passCells(PASS);
    expect(cells.map((c) => c.value)).toEqual(["7F", "3"]);
    expect(cells[0].note).toContain("Boarding pass");
  });

  it("leaves them empty rather than inventing them", () => {
    const cells = passCells(null);
    expect(cells.map((c) => c.value)).toEqual(["—", "—"]);
    expect(cells[1].note).toMatch(/Not on your record/);
  });
});

describe("disagreement is shown, never settled", () => {
  it("names both gates and sends the traveller to the display or the staff", () => {
    const out = passConflicts({ providerGate: "B1", local: PASS, providerDepartLocal: "3:55 PM" });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("gate B1");
    expect(out[0]).toContain("gate A2");
    expect(out[0]).toMatch(/live airport display or ask the gate staff/);
  });

  it("stays quiet when the feed agrees", () => {
    expect(passConflicts({ providerGate: "A2", local: PASS, providerDepartLocal: "3:55 PM" })).toEqual([]);
  });

  it("flags a boarding time that does not sit before departure", () => {
    const out = passConflicts({
      providerGate: "A2",
      local: { ...PASS, boarding_time: "15:55" },
      providerDepartLocal: "15:55",
    });
    expect(out[0]).toMatch(/does not sit before the departure time/);
  });
});

describe("gate mode only on a departure day", () => {
  it("holds while the flight leaves today and has not gone", () => {
    expect(gateMode({ departAt: DEPART_AT, nowIso: "2026-09-20T07:30:00.000Z" })).toBe(true);
  });

  it("stands down once it is airborne or down", () => {
    expect(gateMode({ departAt: DEPART_AT, nowIso: "2026-09-20T07:30:00.000Z", inAir: true })).toBe(false);
    expect(gateMode({ departAt: DEPART_AT, nowIso: "2026-09-20T07:30:00.000Z", landed: true })).toBe(false);
  });

  it("stays off for another day and for a flight with no filed time", () => {
    expect(gateMode({ departAt: DEPART_AT, nowIso: "2026-09-18T07:30:00.000Z" })).toBe(false);
    expect(gateMode({ departAt: null, nowIso: "2026-09-20T07:30:00.000Z" })).toBe(false);
    expect(sameLocalDay("2026-09-21T00:30:00+07:00", "2026-09-20T18:00:00.000Z")).toBe(true);
  });
});

describe("what a person types or a photo reads", () => {
  it("cleans a pass draft without filling a blank", () => {
    expect(cleanDraft({ boarding_time: " 3:15 ", gate: "a2", seat: "7f", zone: "" })).toEqual({
      boarding_time: "03:15",
      gate: "A2",
      seat: "7F",
      zone: null,
    });
    expect(cleanDraft({ boarding_time: "nonsense" }).boarding_time).toBeNull();
    expect(draftEmpty(cleanDraft({}))).toBe(true);
  });
});
