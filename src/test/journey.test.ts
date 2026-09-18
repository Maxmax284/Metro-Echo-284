// journey — the trip as one object, and the sit in the middle of it.
//
// What is being held to account here:
//   - Nothing is filled in. A missing gate, terminal or landing time stays missing.
//   - Position is derived and labelled with whose word it is.
//   - The person's word beats the feed, and a leg that did not happen stops
//     everything after it.
//   - Layover arithmetic is shown and adds up.
//   - Legs only chain into one journey when they actually meet: same airport,
//     inside a day.
//   - Country notes are kept by hand and a country with none returns none.
import { describe, expect, it } from "vitest";
import type { FlightPlan } from "@/lib/flightPlan";
import {
  BOARDING_LEAD_MIN,
  IMMIGRATION_MIN,
  TERMINAL_CHANGE_MIN,
  bigNumbers,
  durationWords,
  journeysFrom,
  layoverBetween,
  legOf,
  legState,
  offlinePack,
  packDiff,
  whereOnJourney,
} from "@/lib/journey";
import { countryNotes, haveNotesFor, noNotesWords } from "@/lib/countryNotes";
import { cacheStale, normalizePlaces, placeWords, readingAgeWords } from "@/lib/airportIntel";
import { airport, bordersCrossed } from "@/lib/airports";

function plan(over: Partial<FlightPlan> = {}): FlightPlan {
  return {
    id: over.id ?? "p1",
    origin: "IAD",
    destination: "NRT",
    depart_on: "2026-09-01",
    return_on: null,
    passengers: 1,
    currency: "USD",
    source: "pasted" as FlightPlan["source"],
    options: [],
    chosen_option_id: null,
    status: "confirmed",
    event_ids: [],
    ownership: "mine",
    ...over,
  };
}

function live(o: {
  from: string;
  to: string;
  depScheduled?: string;
  depActual?: string | null;
  arrScheduled?: string;
  arrActual?: string | null;
  status?: string;
  depTerminal?: string | null;
  depGate?: string | null;
  arrTerminal?: string | null;
}) {
  return {
    flight_no: "TG601",
    airline: "Thai",
    status: o.status ?? "scheduled",
    departure: {
      iata: o.from,
      terminal: o.depTerminal ?? null,
      gate: o.depGate ?? null,
      scheduled: o.depScheduled ?? null,
      estimated: null,
      actual: o.depActual ?? null,
    },
    arrival: {
      iata: o.to,
      terminal: o.arrTerminal ?? null,
      gate: null,
      scheduled: o.arrScheduled ?? null,
      estimated: null,
      actual: o.arrActual ?? null,
    },
  };
}

describe("a leg read off a plan", () => {
  it("prefers the actual time over the scheduled one and says which it used", () => {
    const leg = legOf(
      plan({
        live_status: live({
          from: "IAD",
          to: "NRT",
          depScheduled: "2026-09-01T12:00:00+00:00",
          depActual: "2026-09-01T12:22:00+00:00",
        }),
      }),
    );
    expect(leg.from.at).toBe("2026-09-01T12:22:00+00:00");
    expect(leg.from.basis).toBe("actual");
  });

  it("leaves a gate and a terminal empty when the airline filed none", () => {
    const leg = legOf(plan({ live_status: live({ from: "IAD", to: "NRT", depScheduled: "2026-09-01T12:00:00+00:00" }) }));
    expect(leg.from.gate).toBeNull();
    expect(leg.from.terminal).toBeNull();
    expect(leg.from.basis).toBe("scheduled");
  });

  it("has no time at all when nothing was ever filed or typed", () => {
    const leg = legOf(plan());
    expect(leg.from.at).toBeNull();
    expect(leg.from.basis).toBe("none");
  });
});

describe("what state a leg is in", () => {
  const now = new Date("2026-09-01T15:00:00Z");

  it("calls it in the air off a filed departure, and names the airline as the source", () => {
    const leg = legOf(
      plan({
        live_status: live({
          from: "IAD",
          to: "NRT",
          depActual: "2026-09-01T14:00:00+00:00",
          arrScheduled: "2026-09-02T02:00:00+00:00",
          status: "active",
        }),
      }),
    );
    const s = legState(leg, now);
    expect(s.kind).toBe("in_air");
    expect(s.source).toBe("the airline");
    expect(s.stale).toBe(false);
  });

  it("does not claim a landing when the filed landing time simply passed", () => {
    const leg = legOf(
      plan({
        live_status: live({
          from: "IAD",
          to: "NRT",
          depActual: "2026-09-01T00:00:00+00:00",
          arrScheduled: "2026-09-01T10:00:00+00:00",
          status: "active",
        }),
      }),
    );
    const s = legState(leg, now);
    expect(s.kind).toBe("in_air");
    expect(s.stale).toBe(true);
    expect(s.words).toMatch(/not that you have landed/i);
  });

  it("takes the person's word over the feed", () => {
    const leg = legOf(
      plan({
        leg_state: "did_not_happen",
        live_status: live({ from: "IAD", to: "NRT", depActual: "2026-09-01T14:00:00+00:00", status: "active" }),
      }),
    );
    const s = legState(leg, now);
    expect(s.kind).toBe("did_not_happen");
    expect(s.source).toBe("you");
  });
});

describe("the sit between two legs", () => {
  const a = legOf(
    plan({
      id: "a",
      live_status: live({
        from: "IAD",
        to: "NRT",
        depScheduled: "2026-09-01T12:00:00+00:00",
        arrScheduled: "2026-09-02T02:00:00+00:00",
        arrTerminal: "1",
      }),
    }),
  );
  const b = legOf(
    plan({
      id: "b",
      origin: "NRT",
      destination: "BKK",
      live_status: live({
        from: "NRT",
        to: "BKK",
        depScheduled: "2026-09-02T08:00:00+00:00",
        arrScheduled: "2026-09-02T13:00:00+00:00",
        depTerminal: "2",
      }),
    }),
  );

  it("shows the subtraction and it adds up", () => {
    const lay = layoverBetween(a, b);
    expect(lay.gapMin).toBe(360);
    const taken = lay.deductions.reduce((s, d) => s + (d.minutes ?? 0), 0);
    expect(taken).toBe(BOARDING_LEAD_MIN + TERMINAL_CHANGE_MIN + IMMIGRATION_MIN);
    expect(lay.usableMin).toBe(360 - taken);
    expect(lay.words).toContain("actually yours");
  });

  it("flags the terminal change with both terminals named", () => {
    const lay = layoverBetween(a, b);
    expect(lay.terminalChange).toBe("yes");
    expect(lay.arriveTerminal).toBe("1");
    expect(lay.departTerminal).toBe("2");
  });

  it("does not assume the same terminal when neither was filed", () => {
    const bare = legOf(plan({ id: "z", live_status: live({ from: "NRT", to: "BKK", depScheduled: "2026-09-02T08:00:00+00:00" }) }));
    const lay = layoverBetween(a, bare);
    expect(lay.terminalChange).toBe("unknown");
    expect(lay.deductions.some((d) => d.minutes === null)).toBe(true);
  });

  it("refuses the arithmetic when one of the two times is missing", () => {
    const noTime = legOf(plan({ id: "y", origin: "NRT", destination: "BKK" }));
    const lay = layoverBetween(a, noTime);
    expect(lay.gapMin).toBeNull();
    expect(lay.usableMin).toBeNull();
    expect(lay.words).toMatch(/cannot be worked out/i);
  });

  it("only offers leaving the airport when the math leaves room", () => {
    /* Six hours minus boarding, a terminal change and immigration still leaves room. */
    expect(layoverBetween(a, b).canLeaveAirport).toBe(true);
    const tight = legOf(
      plan({
        id: "c",
        origin: "NRT",
        destination: "BKK",
        live_status: live({ from: "NRT", to: "BKK", depScheduled: "2026-09-02T05:00:00+00:00", depTerminal: "2" }),
      }),
    );
    const lay = layoverBetween(a, tight);
    expect(lay.gapMin).toBe(180);
    expect(lay.canLeaveAirport).toBe(false);
  });
});

describe("chaining legs into one journey", () => {
  const legOne = plan({
    id: "1",
    live_status: live({
      from: "IAD",
      to: "NRT",
      depScheduled: "2026-09-01T12:00:00+00:00",
      arrScheduled: "2026-09-02T02:00:00+00:00",
    }),
  });
  const legTwo = plan({
    id: "2",
    origin: "NRT",
    destination: "BKK",
    live_status: live({
      from: "NRT",
      to: "BKK",
      depScheduled: "2026-09-02T08:00:00+00:00",
      arrScheduled: "2026-09-02T13:00:00+00:00",
    }),
  });

  it("chains two legs that meet at the same airport inside a day", () => {
    const [j, ...rest] = journeysFrom([legOne, legTwo]);
    expect(rest).toHaveLength(0);
    expect(j.legs).toHaveLength(2);
    expect(j.title).toBe("IAD → NRT → BKK");
    expect(j.segments.filter((s) => s.kind === "ground")).toHaveLength(1);
  });

  it("does not chain legs that do not meet", () => {
    const elsewhere = plan({
      id: "3",
      origin: "LHR",
      destination: "DXB",
      live_status: live({ from: "LHR", to: "DXB", depScheduled: "2026-09-02T09:00:00+00:00" }),
    });
    expect(journeysFrom([legOne, elsewhere])).toHaveLength(2);
  });

  it("leaves out flights that are not yours and ones you dropped", () => {
    const theirs = plan({ id: "4", ownership: "theirs", live_status: live({ from: "IAD", to: "NRT", depScheduled: "2026-09-01T12:00:00+00:00" }) });
    const dropped = plan({ id: "5", status: "dropped", live_status: live({ from: "IAD", to: "NRT", depScheduled: "2026-09-01T12:00:00+00:00" }) });
    const journeys = journeysFrom([legOne, theirs, dropped]);
    expect(journeys).toHaveLength(1);
    expect(journeys[0].legs.map((l) => l.plan_id)).toEqual(["1"]);
  });
});

describe("where you are on it", () => {
  const legOne = plan({
    id: "1",
    live_status: live({
      from: "IAD",
      to: "NRT",
      depActual: "2026-09-01T12:10:00+00:00",
      arrActual: "2026-09-02T02:05:00+00:00",
      status: "landed",
    }),
  });
  const legTwo = plan({
    id: "2",
    origin: "NRT",
    destination: "BKK",
    live_status: live({
      from: "NRT",
      to: "BKK",
      depScheduled: "2026-09-02T08:00:00+00:00",
      arrScheduled: "2026-09-02T13:00:00+00:00",
      depGate: "56",
    }),
  });

  it("puts you on the ground at the layover with the next leg named", () => {
    const [j] = journeysFrom([legOne, legTwo]);
    const where = whereOnJourney(j, new Date("2026-09-02T03:00:00Z"));
    expect(where.kind).toBe("on_ground");
    expect(where.iata).toBe("NRT");
    expect(where.nextLeg?.plan_id).toBe("2");
    expect(where.layover?.usableMin).not.toBeNull();
  });

  it("gives the two numbers, gate included when it was filed", () => {
    const [j] = journeysFrom([legOne, legTwo]);
    const n = bigNumbers(j, new Date("2026-09-02T03:00:00Z"));
    expect(n.timeLeft).toBe(durationWords(300));
    expect(n.timeLeftLabel).toBe("left here");
    expect(n.gate).toBe("56");
  });

  it("says no gate is filed rather than inventing one", () => {
    const noGate = plan({
      id: "2",
      origin: "NRT",
      destination: "BKK",
      live_status: live({ from: "NRT", to: "BKK", depScheduled: "2026-09-02T08:00:00+00:00" }),
    });
    const [j] = journeysFrom([legOne, noGate]);
    const n = bigNumbers(j, new Date("2026-09-02T03:00:00Z"));
    expect(n.gate).toBeNull();
    expect(n.gateLabel).toMatch(/gate not filed/i);
  });

  it("stops assuming anything after a leg you say did not happen", () => {
    const missed = plan({ ...legOne, leg_state: "did_not_happen" });
    const [j] = journeysFrom([missed, legTwo]);
    const where = whereOnJourney(j, new Date("2026-09-02T03:00:00Z"));
    expect(where.kind).toBe("stopped");
    expect(where.words).toMatch(/on hold/i);
  });
});

describe("reading it with no bars", () => {
  const legOne = plan({
    id: "1",
    live_status: live({ from: "IAD", to: "NRT", depScheduled: "2026-09-01T12:00:00+00:00", arrScheduled: "2026-09-02T02:00:00+00:00" }),
  });

  it("stamps the pack with when it was saved", () => {
    const [j] = journeysFrom([legOne]);
    const pack = offlinePack(j, new Date("2026-08-30T09:00:00Z"));
    expect(pack.saved_at).toBe("2026-08-30T09:00:00.000Z");
    expect(pack.legs[0].depart_basis).toBe("scheduled");
  });

  it("reports no news as no news", () => {
    const [j] = journeysFrom([legOne]);
    const pack = offlinePack(j);
    expect(packDiff(pack, pack)).toEqual([]);
    expect(packDiff(null, pack)).toEqual([]);
  });

  it("reports a gate that appeared and a time that moved", () => {
    const [before] = journeysFrom([legOne]);
    const [after] = journeysFrom([
      plan({
        id: "1",
        live_status: live({
          from: "IAD",
          to: "NRT",
          depScheduled: "2026-09-01T12:45:00+00:00",
          arrScheduled: "2026-09-02T02:00:00+00:00",
          depGate: "C12",
        }),
      }),
    ]);
    const news = packDiff(offlinePack(before), offlinePack(after));
    expect(news.some((n) => n.includes("gate C12"))).toBe(true);
    expect(news.some((n) => /45 min later/.test(n))).toBe(true);
  });
});

describe("the airports table", () => {
  it("knows a hub and says nothing about one it does not", () => {
    expect(airport("NRT")?.city).toBe("Tokyo");
    expect(airport("ZZZ")).toBeNull();
  });

  it("only claims a border crossing when both ends are known", () => {
    expect(bordersCrossed("IAD", "NRT")).toBe("different");
    expect(bordersCrossed("IAD", "JFK")).toBe("same");
    expect(bordersCrossed("IAD", "ZZZ")).toBe("unknown");
  });
});

describe("country notes", () => {
  it("carries the day each line was checked", () => {
    const th = countryNotes("th");
    expect(th?.country).toBe("Thailand");
    expect(th?.transport.every((n) => /^\d{4}-\d{2}-\d{2}$/.test(n.checked_on))).toBe(true);
    expect(th?.watch_out.length).toBeGreaterThan(0);
  });

  it("says it has nothing rather than inventing advice", () => {
    expect(haveNotesFor("MG")).toBe(false);
    expect(countryNotes("MG")).toBeNull();
    expect(noNotesWords("Madagascar")).toMatch(/than invent travel advice/i);
  });
});

describe("terminal listings", () => {
  it("keeps hours only where the provider published them", () => {
    const places = normalizePlaces({
      places: [
        { id: "a", displayName: { text: "FamilyMart" }, currentOpeningHours: { openNow: true } },
        { id: "b", displayName: { text: "Sushi counter" } },
        { displayName: { text: "no id, no listing" } },
      ],
    });
    expect(places).toHaveLength(2);
    expect(places[0].open_now).toBe(true);
    expect(places[1].open_now).toBeNull();
    expect(placeWords(places[1])).toMatch(/hours not published/i);
  });

  it("treats a missing or ancient reading as worth reading again", () => {
    expect(cacheStale(null)).toBe(true);
    expect(cacheStale(new Date(Date.now() - 30 * 864e5).toISOString())).toBe(true);
    expect(cacheStale(new Date().toISOString())).toBe(false);
    expect(readingAgeWords(null)).toBe("not read yet");
  });
});
