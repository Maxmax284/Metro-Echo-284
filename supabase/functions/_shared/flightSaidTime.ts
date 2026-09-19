// flightSaidTime — a time the traveller read off a ticket, boarding pass or
// board, put onto a flight that carries none.
//
// Doctrine:
//   - The provider leads. This exists only for the flight no feed knows about,
//     and what it writes is always marked as the person's word.
//   - A boarding time is not a departure time. Echo keeps the distinction in the
//     record and in the words, and never quietly adds minutes to turn one into
//     the other.
//   - A time with no zone is the wall clock at the airport it leaves from. It is
//     stored exactly as written and anchored at read time, never shifted here.
//   - Nothing is invented. An unreadable time is refused with a plain reason.
//
// Pure module: no IO, no React.

/** What the person says the time on their ticket actually is. */
export type SaidTimeKind = "departure" | "boarding";

export type SaidTime = {
  kind: SaidTimeKind;
  /** The wall clock as written, zero-padded 24-hour: "07:15". */
  hhmm: string;
  /** Local wall-clock instant on the day of departure, no zone attached. */
  at: string;
  /** What the card and the receipt say about where this came from. */
  words: string;
  /** The note kept on the option itself. */
  note: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "07:15", "7:15 am", "0755", "7.55pm" — the ways a time is written on a ticket.
 * Returns null when it does not read as a clock time at all.
 */
export function readClock(raw: string | null | undefined): string | null {
  const t = (raw ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})[:.]?(\d{2})\s*(am|pm)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(min) || min > 59) return null;
  const half = m[3];
  if (half) {
    if (hour < 1 || hour > 12) return null;
    if (half === "pm" && hour !== 12) hour += 12;
    if (half === "am" && hour === 12) hour = 0;
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * A time the person read off their own ticket, turned into what the record
 * keeps. `depart_on` is the day the flight leaves, as already filed.
 */
export function saidTime(
  raw: string | null | undefined,
  depart_on: string | null | undefined,
  kind: SaidTimeKind = "departure",
): { ok: boolean; said?: SaidTime; reason?: string } {
  const hhmm = readClock(raw);
  if (!hhmm) {
    return {
      ok: false,
      reason: "That does not read as a time. Write it as it is on your ticket, like 07:15 or 7:15 am.",
    };
  }
  const day = (depart_on ?? "").trim().slice(0, 10);
  if (!DATE_RE.test(day)) {
    return { ok: false, reason: "This flight has no day on record yet, so a time has nothing to sit on." };
  }
  const at = `${day}T${hhmm}:00`;
  const words =
    kind === "boarding"
      ? `Boarding ${hhmm} from your ticket. Departure is a little after that, and no airline has said when — so Echo counts from boarding rather than inventing a take-off time.`
      : `Departure ${hhmm} from your ticket, on your word rather than the airline's feed.`;
  const note =
    kind === "boarding"
      ? `boarding ${hhmm} off your ticket, departure not filed`
      : `departure ${hhmm} off your ticket`;
  return { ok: true, said: { kind, hhmm, at, words, note } };
}

/** How a saved time is described wherever the flight is shown. */
export function saidTimeWords(kind: SaidTimeKind, hhmm: string): string {
  return kind === "boarding"
    ? `Boarding ${hhmm}, off your own ticket. The airline has filed no departure time.`
    : `Departure ${hhmm}, off your own ticket, not the airline's feed.`;
}
