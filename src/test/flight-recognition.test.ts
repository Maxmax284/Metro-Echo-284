// A recognised booking is a question with receipts, never a fact.
import { describe, expect, it } from "vitest";
import {
  OWNERSHIP_CHOICES,
  ownershipOutcome,
  ownershipQuestion,
  readDate,
  readTravellers,
  recognizeFlights,
  relationEvidence,
} from "@/lib/flightRecognize";
import { normalizeAviationstack, readingAge, statusDiff, statusWords } from "@/lib/flightStatus";

const MAIL = `Your itinerary is confirmed
Booking reference: XK4T9P
Passenger: Robert Nitz
3 October 2026
JFK → BKK
TG 601 · departs 08:45 · arrives 12:20`;

describe("reading a booking", () => {
  it("reads the flight, the date, the route and the reference", () => {
    const r = recognizeFlights(MAIL, { today: "2026-09-20" });
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0].flight_no).toBe("TG601");
    expect(r.legs[0].depart_on).toBe("2026-10-03");
    expect(r.legs[0].depart_time).toBe("08:45");
    expect(r.legs[0].origin).toBe("JFK");
    expect(r.legs[0].destination).toBe("BKK");
    expect(r.booking_ref).toBe("XK4T9P");
    expect(r.travellers).toEqual(["Robert Nitz"]);
  });

  it("refuses a slash date, because 03/10 is two days in two countries", () => {
    expect(readDate("03/10/2026")).toBeNull();
    expect(readDate("2026-10-03")).toBe("2026-10-03");
  });

  it("leaves a flight with no date anywhere unread rather than guessing one", () => {
    const r = recognizeFlights("Flight TG 601 departs 08:45", {});
    expect(r.legs).toHaveLength(0);
    expect(r.unread).toHaveLength(1);
  });

  it("does not read a bare code in prose as a flight", () => {
    const r = recognizeFlights("Invoice AB 1234 sent 3 October 2026", { today: "2026-01-01" });
    expect(r.legs).toHaveLength(0);
  });

  it("reads a ticket-style name", () => {
    expect(readTravellers("NITZ/ROBERT MR")).toEqual(["Robert Nitz"]);
  });

  it("counts the same flight on the same day once", () => {
    const r = recognizeFlights(`3 October 2026\nTG 601 08:45 JFK → BKK\nTG 601 08:45 JFK → BKK`, {});
    expect(r.legs).toHaveLength(1);
  });
});

describe("whose flight it is", () => {
  const r = recognizeFlights(MAIL, { today: "2026-09-20" });

  it("asks, and claims nothing, when nothing on record connects it to you", () => {
    const rel = relationEvidence({ recognition: r, text: MAIL, me: { name: "Maxwell Wolfe", emails: ["max@example.com"] } });
    expect(rel.suggested).toBe("unknown");
    expect(rel.confidence).toBe("unclear");
    expect(rel.lines.join(" ")).not.toContain("Your name");
  });

  it("says it is yours only when your name or address is on it", () => {
    const mine = recognizeFlights(MAIL.replace("Robert Nitz", "Maxwell Wolfe"), { today: "2026-09-20" });
    const rel = relationEvidence({ recognition: mine, text: MAIL, me: { name: "Maxwell Wolfe" } });
    expect(rel.suggested).toBe("mine");
    expect(rel.confidence).toBe("recorded");
    expect(rel.lines).toContain("Your name is on the booking.");
  });

  it("a destination or a date only raises the confidence — it never decides", () => {
    const rel = relationEvidence({
      recognition: r,
      text: MAIL,
      me: { name: "Maxwell Wolfe" },
      myPlaces: ["BKK"],
      myWindows: [{ start: "2026-10-01", end: "2026-10-12" }],
    });
    expect(rel.suggested).toBe("unknown");
    expect(rel.confidence).toBe("likely");
    expect(rel.lines.length).toBeGreaterThanOrEqual(2);
  });

  it("a sender already answered for is filed by that answer, not asked about again", () => {
    const rel = relationEvidence({
      recognition: r,
      text: MAIL,
      me: { name: "Maxwell Wolfe" },
      sender: { name: "Robert Nitz", email: "robert@example.com" },
      knownSender: { ownership: "theirs", name: "Robert Nitz" },
    });
    expect(rel.suggested).toBe("theirs");
    expect(rel.lines.join(" ")).toContain("Robert Nitz's flights have been theirs before.");
  });

  it("names the sender in the question and offers four answers", () => {
    const q = ownershipQuestion(r, "mail", { name: "Robert Nitz" });
    expect(q).toContain("Robert Nitz sent flight details");
    expect(q).toContain("TG601");
    expect(q).toContain("Does this flight have anything to do with you?");
    expect(OWNERSHIP_CHOICES.map((c) => c.id)).toEqual(["mine", "mine_too", "theirs", "not_mine"]);
    expect(ownershipOutcome("not_mine")).toContain("Dropped");
  });
});

describe("where a flight actually is", () => {
  const payload = {
    data: [
      {
        flight_date: "2026-10-03",
        flight_status: "active",
        flight: { iata: "TG601" },
        airline: { name: "Thai Airways" },
        departure: { iata: "jfk", scheduled: "2026-10-03T08:45:00+00:00", estimated: "2026-10-03T09:25:00+00:00", delay: 40, gate: "B22" },
        arrival: { iata: "bkk", scheduled: "2026-10-03T12:20:00+00:00" },
      },
    ],
  };

  it("reads only the flight it was asked about", () => {
    const live = normalizeAviationstack(payload, { flight_no: "TG 601", flight_date: "2026-10-03" }, "2026-10-03T08:00:00Z");
    expect(live?.flight_no).toBe("TG601");
    expect(live?.departure.gate).toBe("B22");
    expect(live?.arrival.gate).toBeNull();
  });

  it("reports nothing on record as nothing, never as on time", () => {
    expect(normalizeAviationstack({ data: [] }, { flight_no: "TG601", flight_date: "2026-10-03" })).toBeNull();
  });

  it("says a delay in minutes and keeps missing detail missing", () => {
    const live = normalizeAviationstack(payload, { flight_no: "TG601", flight_date: "2026-10-03" }, "2026-10-03T08:00:00Z")!;
    const words = statusWords(live, (i) => i.slice(11, 16));
    expect(words).toContain("in the air");
    expect(words).toContain("40 min later than planned");
    expect(words).not.toContain("terminal");
  });

  it("has no news when nothing changed", () => {
    const live = normalizeAviationstack(payload, { flight_no: "TG601", flight_date: "2026-10-03" }, "2026-10-03T08:00:00Z")!;
    expect(statusDiff(live, live)).toBeNull();
    expect(statusDiff(null, live)).toBeNull();
  });

  it("reports a diff when the departure moves", () => {
    const before = normalizeAviationstack(payload, { flight_no: "TG601", flight_date: "2026-10-03" }, "2026-10-03T07:00:00Z")!;
    const after = structuredClone(before);
    /* Forty minutes on from the reading as pinned, not a fresh wall clock: the
       two readings have to be compared as instants to be compared at all. */
    after.departure.estimated = new Date(Date.parse(before.departure.estimated!) + 40 * 60_000).toISOString();
    const news = statusDiff(before, after);
    expect(news).toContain("40 min later");
  });

  it("puts a time on every reading", () => {
    const now = new Date("2026-10-03T09:00:00Z");
    expect(readingAge("2026-10-03T08:59:50Z", now)).toBe("checked just now");
    expect(readingAge("2026-10-03T08:30:00Z", now)).toBe("checked 30 min ago");
    expect(readingAge("2026-10-03T08:00:00Z", now)).toBe("checked an hour ago");
  });
});
