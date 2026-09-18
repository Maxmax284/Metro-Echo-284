// New evidence meets a flight already on record. No network, no real database:
// a stub client records every write so the rules are provable.
import { describe, expect, it } from "vitest";
import { noticeFlights } from "../../supabase/functions/_shared/flightNotice";

const SHOT = `Confirmation code AUZ7KL
Thai Airways Intl Flight 6285
Departs Washington Dulles Intl Airport (IAD)
Saturday Sep 19 2026 1:15 AM
Arrives Taiwan Taoyuan Intl Airport (TPE)
Sunday Sep 20 2026 5:10 AM`;

type Row = Record<string, unknown>;

function stub(filed: Row[]) {
  const writes: { table: string; op: string; row: Row }[] = [];
  const updates: Row[] = [];
  const api = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain as never;
    Object.assign(chain, {
      select: () => self(),
      eq: () => self(),
      is: () => self(),
      neq: () => self(),
      order: () => self(),
      limit: () => self(),
      in: () => self(),
      maybeSingle: async () => ({ data: table === "profiles" ? { display_name: "Maxwell Wolfe" } : null }),
      single: async () => ({ data: { id: "new-plan" }, error: null }),
      then: undefined,
      insert: (row: Row) => {
        writes.push({ table, op: "insert", row });
        return {
          select: () => ({ single: async () => ({ data: { id: `${table}-1` }, error: null }) }),
          then: (r: (v: unknown) => unknown) => r({ data: null, error: null }),
        } as never;
      },
      update: (row: Row) => {
        updates.push(row);
        writes.push({ table, op: "update", row });
        return { eq: async () => ({ error: null }) } as never;
      },
    });
    /* The reads this module makes, resolved as plain awaited queries. */
    if (table === "flight_plans") {
      (chain as Record<string, unknown>).select = () => {
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          eq: () => q,
          is: () => q,
          then: (r: (v: unknown) => unknown) => r({ data: filed, error: null }),
        });
        return q as never;
      };
    }
    if (table === "awareness_places" || table === "calendar_events" || table === "cross_links") {
      (chain as Record<string, unknown>).select = () => {
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          eq: () => q,
          is: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({ data: null }),
          then: (r: (v: unknown) => unknown) => r({ data: [], error: null }),
        });
        return q as never;
      };
    }
    return chain;
  };
  return { sb: { from: api } as never, writes, updates };
}

const scope = { userId: "u1", orgId: null };

describe("a screenshot meeting a filed flight", () => {
  it("fills the blanks and leaves a receipt naming the screenshot", async () => {
    const { sb, writes, updates } = stub([
      {
        id: "plan-1",
        origin: "",
        destination: "",
        depart_on: "2026-09-19",
        booking_ref: null,
        traveller_name: null,
        options: [{ flight_no: "TG6285", depart_at: null, arrive_at: null }],
        noticed_from: { source: "mail" },
      },
    ]);
    const r = await noticeFlights(sb, scope, {
      text: SHOT,
      source: "telegram",
      origin_ref: { kind: "ingested_file", id: "11111111-1111-4111-8111-111111111111" },
      today: "2026-09-18",
    });
    expect(r.created).toBe(0);
    expect(r.known).toBe(1);
    expect(r.filled.join(" ")).toContain("where it leaves from");
    expect(r.conflicts).toEqual([]);

    const patch = updates[0] as Record<string, unknown>;
    expect(patch.origin).toBe("IAD");
    expect(patch.destination).toBe("TPE");
    expect(patch.booking_ref).toBe("AUZ7KL");
    /* Provenance grows rather than being replaced. */
    expect((patch.noticed_from as any).source).toBe("mail");
    expect((patch.noticed_from as any).sources).toHaveLength(1);

    const receipts = writes.filter((w) => w.table === "audit_log").map((w) => w.row.event);
    expect(receipts).toContain("flight.filled_from_evidence");
    /* The picture stays attached to the flight it spoke about. */
    const link = writes.find((w) => w.table === "cross_links");
    expect(link?.row).toMatchObject({ source_kind: "file", target_kind: "flight_plan", relation: "about" });
  });

  it("changes nothing and asks when the evidence disagrees", async () => {
    const { sb, writes, updates } = stub([
      {
        id: "plan-1",
        origin: "IAD",
        destination: "TPE",
        depart_on: "2026-09-19",
        booking_ref: "AUZ7KL",
        traveller_name: null,
        options: [{ flight_no: "TG6285", depart_at: "2026-09-19T02:40:00", arrive_at: "2026-09-20T05:10:00" }],
        noticed_from: { source: "telegram" },
      },
    ]);
    const r = await noticeFlights(sb, scope, { text: SHOT, source: "telegram", today: "2026-09-18" });
    expect(r.known).toBe(1);
    expect(r.filled).toEqual([]);
    expect(r.conflicts.join(" ")).toContain("the departure time does not match");
    expect(updates.filter((u) => "origin" in u || "options" in u)).toEqual([]);
    const receipts = writes.filter((w) => w.table === "audit_log").map((w) => w.row.event);
    expect(receipts).toContain("flight.evidence_conflict");
    expect(writes.find((w) => w.table === "nudges")?.row.kind).toBe("flight_evidence_conflict");
  });

  it("says nothing at all when every fact already agrees", async () => {
    const { sb, writes, updates } = stub([
      {
        id: "plan-1",
        origin: "IAD",
        destination: "TPE",
        depart_on: "2026-09-19",
        booking_ref: "AUZ7KL",
        traveller_name: null,
        options: [{ flight_no: "TG6285", depart_at: "2026-09-19T01:15:00", arrive_at: "2026-09-20T05:10:00" }],
        noticed_from: { source: "telegram" },
      },
    ]);
    const r = await noticeFlights(sb, scope, { text: SHOT, source: "telegram", today: "2026-09-18" });
    expect(r).toMatchObject({ created: 0, known: 1, filled: [], conflicts: [] });
    expect(updates).toEqual([]);
    expect(writes.filter((w) => w.table === "nudges")).toEqual([]);
  });

  it("files an overnight arrival on the day it actually lands", async () => {
    const { sb, writes } = stub([]);
    const r = await noticeFlights(sb, scope, { text: SHOT, source: "telegram", today: "2026-09-18" });
    expect(r.created).toBe(1);
    const insert = writes.find((w) => w.table === "flight_plans")!.row as any;
    expect(insert.options[0].depart_at).toBe("2026-09-19T01:15:00");
    expect(insert.options[0].arrive_at).toBe("2026-09-20T05:10:00");
  });
});
