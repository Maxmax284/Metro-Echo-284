// bodyNotice — when a phone's readings are worth saying out loud, and in what
// words.
//
// Doctrine:
//   - A reading arriving is not news. Only a move against this person's own
//     recorded usual is, and only when there is enough history to have a usual.
//   - Observation, never a verdict. Every word comes from the shared body
//     comparison, which cannot advise or diagnose.
//   - One move, one note, one day. The dedupe key carries the day and the
//     kinds, so the same news never buzzes twice.
//   - Pure module: no IO, so every rule here is testable.
import { compareKind, type Move, type SenseReading } from "./bodySense.ts";
import { BODY_DISCLAIMER } from "./bodyLog.ts";

/** The two families a phone pushes that Echo may speak about unprompted. */
export const SPOKEN_KINDS = [
  "heart_rate",
  "resting_heart_rate",
  "hr",
  "pulse",
  "sleep",
  "sleep_minutes",
] as const;

export type BodyNews = {
  title: string;
  body: string;
  /** Which kinds actually moved, newest reading first. */
  kinds: string[];
  /** Stable per person, per day, per set of moved kinds. */
  dedupeKey: string;
};

const hm = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

function moveLine(m: Move): string {
  const sleep = m.kind === "sleep" || m.kind === "sleep_minutes";
  const recent = sleep ? hm(m.recent) : String(m.recent);
  const usual = sleep ? hm(m.usual) : String(m.usual);
  return `${m.words} — ${recent} against your usual ${usual}`;
}

/**
 * Read what the phone has pushed and decide whether anything moved.
 *
 * @param rows this person's recorded readings, any kinds, any window
 * @param arrived the kinds that just landed; only those are considered
 */
export function bodyNews(
  rows: SenseReading[],
  arrived: string[],
  opts: { now?: Date; recentDays?: number; usualDays?: number } = {},
): BodyNews | null {
  const now = opts.now ?? new Date();
  const wanted = new Set(
    arrived.map((k) => String(k).toLowerCase()).filter((k) => (SPOKEN_KINDS as readonly string[]).includes(k)),
  );
  if (wanted.size === 0) return null;

  const moved = [...wanted]
    .map((kind) => compareKind(rows, kind, { ...opts, now }))
    .filter((m): m is Move => m !== null && m.direction !== "same")
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  if (moved.length === 0) return null;

  const day = now.toISOString().slice(0, 10);
  const kinds = moved.map((m) => m.kind);
  return {
    title: moved.length === 1 ? `Your ${label(moved[0].kind)} moved` : "Your readings moved",
    body: [
      `${moved.map(moveLine).join(". ")}.`,
      `Usual here means your own last ${moved[0].usualDays} recorded days, nothing published.`,
      BODY_DISCLAIMER,
    ].join(" "),
    kinds,
    dedupeKey: `body_moved:${day}:${[...kinds].sort().join("+")}`,
  };
}

function label(kind: string): string {
  if (kind === "sleep" || kind === "sleep_minutes") return "sleep";
  return "heart rate";
}
