import { describe, expect, it } from "vitest";

// Removing a flight card is a deliberate yes with a receipt. It must never be
// mistaken for cancelling a ticket, and it must never touch the board entries a
// confirmed flight already wrote.
import {
  dropConfirmWords,
  dropFlightPlan,
  droppedWords,
  findFlightByNumber,
} from "../../supabase/functions/_shared/flightFile";

function db(rows: any[], audits: any[] = [], updates: any[] = []) {
  const q: any = {
    select: () => q,
    eq: () => q,
    neq: () => q,
    is: () => q,
    order: () => q,
    limit: () => Promise.resolve({ data: rows, error: null }),
    update: (patch: any) => {
      updates.push(patch);
      return { eq: () => Promise.resolve({ error: null }) };
    },
    insert: (row: any) => {
      audits.push(row);
      return Promise.resolve({ error: null });
    },
  };
  return { from: () => q, audits, updates } as any;
}

const scope = { userId: "u1", orgId: null };

describe("finding the flight a number means", () => {
  it("picks the soonest one still ahead", async () => {
    const rows = [
      { id: "old", depart_on: "2000-01-01", status: "confirmed", options: [{ flight_no: "TG601" }] },
      { id: "next", depart_on: "2999-01-01", status: "prepared", options: [{ flight_no: "TG601" }] },
    ];
    const hit = await findFlightByNumber(db(rows), scope, "TG601");
    expect(hit?.id).toBe("next");
  });

  it("returns nothing when no card carries that number", async () => {
    const rows = [{ id: "a", depart_on: "2999-01-01", status: "prepared", options: [{ flight_no: "BA12" }] }];
    expect(await findFlightByNumber(db(rows), scope, "TG601")).toBeNull();
  });
});

describe("the words before and after removal", () => {
  it("says the board entries survive a confirmed removal", () => {
    const words = dropConfirmWords("TG601", { id: "x", depart_on: "2026-09-22", status: "confirmed" });
    expect(words).toContain("stay on your board");
    expect(words).toContain("Nothing is cancelled with the airline");
  });

  it("says a draft was never booked", () => {
    expect(dropConfirmWords("TG601", { id: "x", depart_on: "2026-09-22", status: "prepared" })).toContain("still a draft");
    expect(droppedWords("TG601", { id: "x", depart_on: "2026-09-22", status: "prepared" })).toContain("nothing was cancelled");
  });
});

describe("removing one known card", () => {
  it("drops the card and leaves a receipt naming the surface", async () => {
    const audits: any[] = [];
    const updates: any[] = [];
    const sb = db([], audits, updates);
    const out = await dropFlightPlan(sb, scope, { id: "p1", depart_on: "2026-09-22", status: "confirmed" }, {
      flight_no: "TG601",
      via: "telegram",
    });
    expect(out.dropped).toBe(true);
    expect(updates[0]).toEqual({ status: "dropped" });
    expect(audits[0].event).toBe("flight.dropped");
    expect(audits[0].payload).toMatchObject({ flight_no: "TG601", via: "telegram", was_confirmed: true });
  });
});
