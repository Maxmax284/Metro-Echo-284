// What the mail sweep may look at, what it says afterwards, and how a batched
// answer is read. Pure modules only — no network, no Deno.
import { describe, expect, it } from "vitest";
import {
  candidateQuery,
  emptyCounts,
  isBookingish,
  MAIL_DAILY_CEILING,
  SKIP_LABELS,
  SWEEP_OPEN_MAX,
  sweepDiff,
} from "../../supabase/functions/_shared/mailSweep";
import {
  BATCH_MAX,
  batchBoundary,
  boundaryOf,
  buildMetadataBatch,
  parseBatch,
  sniffBoundary,
} from "../../supabase/functions/_shared/gmailBatch";
import { flightNoticeSignals, hoursUntilDeparture } from "../../supabase/functions/_shared/awareness/flightNoticeSignal";
import { isDriftKind } from "@/lib/drift";

const scope = { userId: "u1", organizationId: null };

describe("what a sweep is allowed to ask for", () => {
  it("asks a narrow question inside a window, never the whole mailbox", () => {
    const q = candidateQuery(14);
    expect(q).toContain("newer_than:14d");
    expect(q).toContain("confirmation");
    expect(q).toContain("-in:spam");
    expect(q).toContain("-in:trash");
  });

  it("never reads your own writing or the bins", () => {
    expect(SKIP_LABELS).toContain("SENT");
    expect(SKIP_LABELS).toContain("DRAFT");
    expect(SKIP_LABELS).toContain("TRASH");
    expect(SKIP_LABELS).toContain("SPAM");
  });

  it("keeps the expensive half small and the day capped", () => {
    expect(SWEEP_OPEN_MAX).toBeLessThanOrEqual(10);
    expect(MAIL_DAILY_CEILING).toBeLessThanOrEqual(120);
  });
});

describe("which mail is worth opening", () => {
  it("opens a booking on its subject line", () => {
    expect(isBookingish({ subject: "Your itinerary for BR3", from: "noreply@x.com" })).toBe(true);
    expect(isBookingish({ subject: "Booking confirmation 8KJ2L", from: "a@b.com" })).toBe(true);
  });

  it("opens an airline's mail on the sender alone", () => {
    expect(isBookingish({ subject: "A note", from: "info@evaair.com" })).toBe(true);
  });

  it("leaves ordinary mail shut", () => {
    expect(isBookingish({ subject: "lunch tomorrow?", from: "dani@example.com" })).toBe(false);
    expect(isBookingish({ subject: "", from: "" })).toBe(false);
  });
});

describe("a run reports a diff, never a status", () => {
  it("says nothing when nothing changed", () => {
    expect(sweepDiff({ ...emptyCounts(), looked: 30, opened: 4 })).toBeNull();
  });

  it("says what actually landed", () => {
    const said = sweepDiff({ ...emptyCounts(), created: 1, asked: 1 });
    expect(said).toContain("1 flight filed as a draft");
    expect(said).toContain("1 question");
  });

  it("counts a disagreement without claiming it wrote one", () => {
    expect(sweepDiff({ ...emptyCounts(), conflicts: 2 })).toContain("2 disagreements left unwritten");
  });
});

describe("one request for many headers", () => {
  it("builds one part per message, capped at Gmail's limit", () => {
    const ids = Array.from({ length: 60 }, (_, i) => `m${i}`);
    const { body, contentType } = buildMetadataBatch(ids, batchBoundary("u1"));
    expect(contentType).toContain("multipart/mixed");
    expect(body.match(/Content-Type: application\/http/g)?.length).toBe(BATCH_MAX);
    expect(body).toContain("format=metadata");
    expect(body).toContain("metadataHeaders=Subject");
  });

  it("reads the boundary the answer actually used, not the one we sent", () => {
    const text = [
      "--batch_reply_9",
      "Content-Type: application/http",
      "",
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "",
      '{"id":"m1","snippet":"hi"}',
      "--batch_reply_9--",
      "",
    ].join("\r\n");
    expect(sniffBoundary(text)).toBe("batch_reply_9");
    const parts = parseBatch("multipart/mixed; boundary=we_sent_this", text);
    expect(parts).toHaveLength(1);
    expect(parts[0].status).toBe(200);
    expect((parts[0].body as { id: string }).id).toBe("m1");
  });

  it("counts a refused part instead of dropping it", () => {
    const text = [
      "--b1",
      "Content-Type: application/http",
      "",
      "HTTP/1.1 403 Forbidden",
      "",
      '{"error":{"message":"nope"}}',
      "--b1",
      "Content-Type: application/http",
      "",
      "HTTP/1.1 200 OK",
      "",
      '{"id":"m2"}',
      "--b1--",
      "",
    ].join("\r\n");
    const parts = parseBatch("multipart/mixed; boundary=b1", text);
    expect(parts.map((p) => p.status)).toEqual([403, 200]);
  });

  it("reads a boundary out of a header when it is there", () => {
    expect(boundaryOf('multipart/mixed; boundary="abc"')).toBe("abc");
    expect(boundaryOf(null)).toBeNull();
  });
});

const row = {
  id: "f1",
  flight_no: "BR3",
  airline: "EVA Air",
  origin: "IAD",
  destination: "TPE",
  depart_on: "2026-09-25",
  ownership: "unknown",
  origin_kind: "recognised",
  source_words: "a mail that arrived",
  created_at: "2026-09-19T00:00:00Z",
};
const now = Date.parse("2026-09-19T00:00:00Z");

describe("a noticed flight asks, it never tells", () => {
  it("asks whose it is and points at the desk", () => {
    const [s] = flightNoticeSignals([row], scope, now);
    expect(s.summary).toContain("is this one of yours?");
    expect(s.nextStep).toContain("Nothing goes on your board");
    expect(s.entityType).toBe("flight_plan");
    expect(s.sourceRefs?.[0]?.id).toBe("f1");
  });

  it("reuses the recognition's own key so nothing is asked twice", () => {
    const [s] = flightNoticeSignals([row], scope, now);
    expect(s.dedupeKey).toBe("flight_noticed:BR3:2026-09-25");
  });

  it("goes quiet once the question is answered", () => {
    expect(flightNoticeSignals([{ ...row, ownership: "mine" }], scope, now)).toHaveLength(0);
    expect(flightNoticeSignals([{ ...row, ownership: "not_mine" }], scope, now)).toHaveLength(0);
  });

  it("stops asking about a flight that already left", () => {
    expect(flightNoticeSignals([{ ...row, depart_on: "2026-09-01" }], scope, now)).toHaveLength(0);
  });

  it("says nothing without a flight number to ask about", () => {
    expect(flightNoticeSignals([{ ...row, flight_no: null }], scope, now)).toHaveLength(0);
  });

  it("lets the clock decide urgency, from a real date only", () => {
    expect(hoursUntilDeparture(row, now)).toBeCloseTo(6 * 24 + 12, 0);
    expect(hoursUntilDeparture({ ...row, depart_on: null }, now)).toBeNull();
  });

  it("lands in the lane Today actually renders", () => {
    expect(isDriftKind("flight_noticed")).toBe(true);
  });
});
