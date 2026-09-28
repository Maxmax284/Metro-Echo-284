// Receipts front layer — six human lines, derived from recorded rows only.
//
// Doctrine: conclusion first, evidence second. The room opens with what
// happened in plain English; the raw audit rows live one level deeper behind
// "Show the record". Nothing here invents a fact: every line counts real rows
// and quotes the newest one.

export type DigestAuditRow = {
  id: string;
  event: string;
  entity_type: string;
  created_at: string;
};

export type DigestActionEvent = {
  id: string;
  to_status: string;
  actor: string;
  created_at: string;
};

export type ReceiptLineKey =
  | "happened"
  | "echo_did"
  | "you_approved"
  | "failed"
  | "held_back"
  | "outside";

export type ReceiptLine = {
  key: ReceiptLineKey;
  /** Human label for the line. */
  label: string;
  count: number;
  /** One sentence. Never a status word on its own. */
  sentence: string;
  /** Newest matching moment, ISO, when there is one. */
  at: string | null;
  /** Quick-filter id to drill into the record with, when one applies. */
  drill?: string;
};

const FAILED = /(fail|error|reject|retried|refused)/;
const HELD = /(held|held_back|suppress|blocked|skipped|deferred|withheld)/;
// Only work Echo actually carried out. Filing, linking and inbound arrivals are
// not "Echo did it" — they belong to the outside-change line.
const ECHO_DID = /(executed|sent|generated|composed|delivered|reached)/;
const OUTSIDE = /(calendar|telegram|inbound|external|feed|webhook)/;

function newest<T extends { created_at: string }>(rows: T[]): T | null {
  return rows.reduce<T | null>((best, r) => (!best || r.created_at > best.created_at ? r : best), null);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * Build the six-line front layer. Counts are over the rows handed in — the
 * caller decides the window (Receipts loads the newest 100).
 */
export function receiptDigest(
  audit: DigestAuditRow[],
  events: DigestActionEvent[],
): ReceiptLine[] {
  const match = (re: RegExp) => audit.filter((r) => re.test(r.event.toLowerCase()));

  const failed = match(FAILED);
  const held = match(HELD);
  // A held-back or failed row is not "Echo did it".
  const echo = match(ECHO_DID).filter((r) => !FAILED.test(r.event.toLowerCase()) && !HELD.test(r.event.toLowerCase()));
  const outside = audit.filter(
    (r) => OUTSIDE.test(r.entity_type.toLowerCase()) || OUTSIDE.test(r.event.toLowerCase()),
  );
  const approvals = events.filter(
    (e) => e.actor === "user" && /(approved|executed|done|completed)/.test(e.to_status.toLowerCase()),
  );

  const lines: ReceiptLine[] = [
    {
      key: "happened",
      label: "What happened",
      count: audit.length,
      at: newest(audit)?.created_at ?? null,
      sentence: audit.length
        ? `${audit.length} ${plural(audit.length, "thing", "things")} left a record.`
        : "Nothing has happened yet.",
    },
    {
      key: "echo_did",
      label: "What Echo did",
      count: echo.length,
      at: newest(echo)?.created_at ?? null,
      drill: "",
      sentence: echo.length
        ? `Echo carried out ${echo.length} ${plural(echo.length, "thing", "things")} for you.`
        : "Echo hasn't run anything.",
    },
    {
      key: "you_approved",
      label: "What you approved",
      count: approvals.length,
      at: newest(approvals)?.created_at ?? null,
      drill: "action",
      sentence: approvals.length
        ? `You gave the go-ahead ${approvals.length} ${plural(approvals.length, "time", "times")}.`
        : "You haven't approved anything.",
    },
    {
      key: "failed",
      label: "What failed",
      count: failed.length,
      at: newest(failed)?.created_at ?? null,
      sentence: failed.length
        ? `${failed.length} ${plural(failed.length, "thing didn't", "things didn't")} go through.`
        : "Nothing failed.",
    },
    {
      key: "held_back",
      label: "What Echo held back",
      count: held.length,
      at: newest(held)?.created_at ?? null,
      sentence: held.length
        ? `Echo kept ${held.length} ${plural(held.length, "thing", "things")} to itself rather than interrupt you.`
        : "Echo held nothing back.",
    },
    {
      key: "outside",
      label: "What changed outside Echo",
      count: outside.length,
      at: newest(outside)?.created_at ?? null,
      drill: "telegram",
      sentence: outside.length
        ? `${outside.length} ${plural(outside.length, "change", "changes")} came in from your calendar or messages.`
        : "Nothing changed out there.",
    },
  ];

  return lines;
}

/** Quiet-day read: true when there is genuinely nothing to report. */
export function isQuietRecord(lines: ReceiptLine[]): boolean {
  return lines.every((l) => l.count === 0);
}
