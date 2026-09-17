// environmentEdge — the quiet line that says where you are, what the clock says
// there, and what is next. One read, three renderings.
//
// Doctrine:
//   - This is not a panel farm and not a weather widget. At most three facts:
//     where, local clock, next thing. When none of them changes the answer, the
//     line renders nothing at all.
//   - Ask, Today and Telegram consume the same read. None of them assembles its
//     own version of the world.
//   - Nothing is invented. No place means no place; no next thing means no
//     "nothing scheduled" filler either — the slot simply disappears.
//   - Disagreement is shown, not smoothed. A contested place says so.
//
// Pure module: no queries, no clock of its own unless one is handed in.
import { formatInTimeZone } from "date-fns-tz";
import { type PlaceState, placeWords, conflictWords } from "./placeState";

export type EnvironmentInput = {
  place: PlaceState | null;
  /** IANA zone Echo actually believes, with a source behind it. */
  timezone?: string | null;
  /** The next thing on record, whatever kind it is. */
  next?: { words: string; atIso: string } | null;
  /** A live countdown that matters more than a clock time, e.g. a connection. */
  countdown?: { words: string; minutes: number } | null;
};

export type EnvironmentEdge = {
  /** Uppercase place, e.g. "TOKYO" or "ARLINGTON, VA". Null when unknown. */
  where: string | null;
  /** Short zone label, e.g. "JST" or "EDT". Null when Echo is guessing. */
  clock: string | null;
  /** "next thing 4:30 PM" or "connection 3h 28m". Null when there is none. */
  next: string | null;
  /** Set when two sources disagree about where you are. */
  conflict: string | null;
  /** True when the whole line has nothing honest to show. */
  empty: boolean;
};

function zoneLabel(tz: string, at: Date): string | null {
  try {
    const raw = formatInTimeZone(at, tz, "zzz");
    return raw && !/^GMT[+-]/.test(raw) ? raw : formatInTimeZone(at, tz, "OOOO").replace("GMT", "UTC");
  } catch {
    return null;
  }
}

function gap(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function environmentEdge(input: EnvironmentInput, now = new Date()): EnvironmentEdge {
  const words = input.place ? placeWords(input.place) : null;
  const where = words ? words.toUpperCase() : null;
  const conflict = input.place ? conflictWords(input.place) : null;

  const tz = (input.timezone ?? "").trim();
  const clock = tz ? zoneLabel(tz, now) : null;

  let next: string | null = null;
  if (input.countdown && input.countdown.minutes > 0) {
    next = `${input.countdown.words} ${gap(input.countdown.minutes)}`;
  } else if (input.next) {
    const at = Date.parse(input.next.atIso);
    if (Number.isFinite(at)) {
      const when = tz ? formatInTimeZone(new Date(at), tz, "h:mm a") : null;
      next = when ? `${input.next.words} ${when}` : input.next.words;
    }
  }

  return {
    where,
    clock,
    next,
    conflict,
    empty: !where && !clock && !next && !conflict,
  };
}

/** One line for a prompt or a strip. Empty string when there is nothing to say. */
export function environmentLine(edge: EnvironmentEdge): string {
  if (edge.empty) return "";
  const head = [edge.where, edge.clock].filter(Boolean).join(" · ");
  const tail = edge.next ?? "";
  const base = head && tail ? `${head} | ${tail}` : head || tail;
  return edge.conflict ? `${base} — ${edge.conflict}` : base;
}

/**
 * Questions the situation makes answerable. Not prompt oatmeal: each one exists
 * because a real fact is on record, and zero suggestions is a valid answer.
 */
export type SituationalState = {
  atAirport?: boolean;
  layoverMinutes?: number | null;
  abroad?: boolean;
  /** Country notes exist for where they are. */
  haveLocalFacts?: boolean;
  cashCountry?: boolean;
  needsCare?: boolean;
  changesTonight?: number;
  housingCostKnown?: boolean;
};

export type SituationalAsk = { id: string; label: string; question: string };

export function situationalAsks(state: SituationalState): SituationalAsk[] {
  const out: SituationalAsk[] = [];

  if (state.atAirport && (state.layoverMinutes ?? 0) >= 120) {
    out.push({
      id: "leave_airport",
      label: "Can I leave the airport?",
      question: "Can I leave the airport on this layover? Use my filed times and nothing else.",
    });
  }
  if (state.atAirport) {
    out.push({
      id: "near_gate",
      label: "What's open near my gate?",
      question: "What is open near my gate right now, from real place data only?",
    });
  }
  if (state.cashCountry) {
    out.push({
      id: "cash",
      label: "Do I need cash?",
      question: "Do I need cash where I am, based on your kept notes for this country?",
    });
  }
  if (state.needsCare) {
    out.push({
      id: "care",
      label: "Pharmacy or clinic?",
      question: "Pharmacy or clinic for this, and what is actually open nearby?",
    });
  }
  if (state.housingCostKnown) {
    out.push({
      id: "housing",
      label: "What's the real monthly cost?",
      question: "What is the real monthly cost here, separating move-in cash from monthly bills?",
    });
  }
  if ((state.changesTonight ?? 0) > 0) {
    out.push({
      id: "tonight",
      label: "What changed tonight?",
      question: "What changed tonight, from recorded events only?",
    });
  }
  if (state.abroad && state.haveLocalFacts) {
    out.push({
      id: "local",
      label: "What should I know here?",
      question: "What should I know about paying, tipping and plugs here, from your kept notes?",
    });
  }

  return out.slice(0, 3);
}
