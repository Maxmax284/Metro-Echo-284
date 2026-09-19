// mailSweep — which mail is worth a second look, and what to say afterwards.
//
// Doctrine:
//   - A sweep is not a mailbox download. It asks Gmail a narrow question about
//     bookings and receipts, reads headers first, and opens a body only for the
//     few messages whose own subject line says they carry one.
//   - Nothing recognised is ever a fact. Recognition files a draft and asks.
//   - A background job reports a diff, never a status. "Swept" alone is not news.
// Pure module: no IO, no Deno globals.

/** Provider readings a single person's sweeps may spend in one day. */
export const MAIL_DAILY_CEILING = 60;

/** New ids one run will look at, however many arrived. */
export const SWEEP_LOOK_MAX = 50;

/** Bodies one run will open. The expensive half, deliberately small. */
export const SWEEP_OPEN_MAX = 6;

/** Labels a sweep never reads: your own writing, and the bins. */
export const SKIP_LABELS = ["SENT", "DRAFT", "SPAM", "TRASH", "CHAT"];

const BOOKING_WORDS = [
  "confirmation",
  "confirmed",
  "itinerary",
  "booking",
  "reservation",
  "e-ticket",
  "eticket",
  "ticket",
  "boarding pass",
  "check-in",
  "flight",
];

/**
 * The narrow question asked of Gmail on a first run. Words a booking uses,
 * inside a window, never the whole mailbox.
 */
export function candidateQuery(days = 14): string {
  const words = BOOKING_WORDS.map((w) => (w.includes(" ") ? `"${w}"` : w)).join(" OR ");
  return `(${words}) newer_than:${Math.max(1, Math.round(days))}d -in:spam -in:trash`;
}

const SUBJECT_HINT = new RegExp(
  `(${BOOKING_WORDS.map((w) => w.replace(/[-\s]/g, "[-\\s]?")).join("|")})`,
  "i",
);

/** Airlines and agents whose mail is worth opening on the sender alone. */
const SENDER_HINT =
  /(@|\.)((\w*air\w*)|airlines?|flyfrontier|united|delta|aa|jetblue|evaair|thaiairways|singaporeair|cathaypacific|emirates|qatarairways|ana|jal|expedia|kiwi|booking|trip|travel|amadeus|sabre)\./i;

/**
 * Worth opening the body for. Subject line or sender must say so — a sweep never
 * opens a message on a hunch.
 */
export function isBookingish(m: { subject?: string | null; from?: string | null }): boolean {
  const subject = (m.subject ?? "").trim();
  const from = (m.from ?? "").trim();
  if (subject && SUBJECT_HINT.test(subject)) return true;
  return !!from && SENDER_HINT.test(from);
}

export type SweepCounts = {
  /** New ids the run considered. */
  looked: number;
  /** Bodies actually opened. */
  opened: number;
  /** Flight drafts filed. */
  created: number;
  /** Questions raised because whose flight it is could not be read. */
  asked: number;
  /** Blanks filled on a flight already on record. */
  filled: number;
  /** Facts the mail disagreed with. Nothing was written for these. */
  conflicts: number;
  /** Parts the provider refused. Counted, never hidden. */
  failed: number;
};

export function emptyCounts(): SweepCounts {
  return { looked: 0, opened: 0, created: 0, asked: 0, filled: 0, conflicts: 0, failed: 0 };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What changed, in one line — or null when nothing did. A run that found nothing
 * says nothing at all; silence is a valid answer.
 */
export function sweepDiff(c: SweepCounts): string | null {
  const said: string[] = [];
  if (c.created) said.push(`${plural(c.created, "flight")} filed as a draft`);
  if (c.asked) said.push(`${plural(c.asked, "question")} about whose flight it is`);
  if (c.filled) said.push(`${plural(c.filled, "blank")} filled on a flight already on record`);
  if (c.conflicts) said.push(`${plural(c.conflicts, "disagreement")} left unwritten`);
  if (!said.length) return null;
  return `From your mail: ${said.join(", ")}.`;
}
