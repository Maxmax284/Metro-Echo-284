// todayContext — how Awareness speaks *inside* Today, without taking a card.
//
// Doctrine (Today should not contain Awareness; Today should behave as if
// Awareness is underneath it):
//   - place never gets a module of its own. It is a clause on an existing line
//     or one light strip above the read, and nothing else.
//   - the strip appears only when place actually matters: it grounds a line on
//     the board, a real move just happened, a trip is running, or the clock
//     disagrees with the device. A quiet day shows nothing at all.
//   - an aging fix says how old it is in words. Opacity is not honesty.
//   - a severe board simplifies. It never gains decoration.
//   - nothing here estimates. A distance is said only when it was computed
//     from two recorded fixes; travel time is never invented.
//
// Pure module: no IO, no React. The caller hands over already-read state.

/** One hour of forecast, exactly as the provider reported it. */
export type ContextForecastHour = {
  at: string;
  tempC?: number | null;
  condition?: string | null;
  rainChance?: number | null;
};

const WET = ["rain", "showers", "thunderstorm", "snow", "sleet"];
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function clockLabel(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const m = d.getMinutes();
  return m === 0 ? `${h}:00` : `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * The distance half of a bundled line. Said only in the units the fix earns:
 * a rounded kilometre reading, or nothing.
 */
export function distanceClause(distanceM: number | null | undefined): string | null {
  if (distanceM === null || distanceM === undefined) return null;
  const n = Number(distanceM);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 300) return "you're already there";
  if (n < 1000) return `about ${Math.round(n / 100) * 100} m from where you are`;
  const km = n < 10_000 ? Math.round(n / 100) / 10 : Math.round(n / 1000);
  return `about ${km} km from where you are`;
}

/**
 * The weather half. Only the hours between now and shortly after the thing
 * starts, and only when a recorded hour is actually wet.
 */
export function weatherClauseFor(
  startsAt: string,
  forecast: ContextForecastHour[] | null | undefined,
  now = Date.now(),
): string | null {
  const start = new Date(startsAt).getTime();
  if (!Number.isFinite(start)) return null;
  const window = (forecast ?? []).filter((h) => {
    const t = new Date(h.at).getTime();
    return Number.isFinite(t) && t >= now - HOUR && t <= start + HOUR;
  });
  if (window.length === 0) return null;
  const wet = window.find((h) => {
    const cond = String(h.condition ?? "").toLowerCase();
    if (WET.some((w) => cond.includes(w))) return true;
    return typeof h.rainChance === "number" && h.rainChance >= 60;
  });
  if (!wet) return null;
  const at = clockLabel(wet.at);
  const word = WET.find((w) => String(wet.condition ?? "").toLowerCase().includes(w)) ?? "rain";
  return at ? `${word} around ${at}` : word;
}

/**
 * One bundled clause for a meeting: where it is relative to you, and whether
 * the weather touches it. Four facts become one sentence, or none.
 */
export function meetingContextClause(input: {
  startsAt: string;
  distanceM?: number | null;
  forecast?: ContextForecastHour[] | null;
  now?: number;
}): string | null {
  const now = input.now ?? Date.now();
  const parts = [distanceClause(input.distanceM), weatherClauseFor(input.startsAt, input.forecast, now)]
    .filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(", ") : null;
}

/* ------------------------------------------------------------------ */

export type PlaceCueInput = {
  now?: number;
  /** The most precise name Echo may say — from placeTruth, never a raw label. */
  name: string | null;
  /** Age of the fix in plain words, from placeTruth. */
  age?: string | null;
  /** True when the fix is old enough that it must not be spoken as "now". */
  stale?: boolean;
  /** How many lines the situation read put on the board. Place alone is not news. */
  lineCount: number;
  /** True when a line on the board is explained by where you are standing. */
  explainsRead?: boolean;
  /** A move Echo actually recorded: the place it had before this one. */
  movedFrom?: string | null;
  /** The device clock disagrees with the stored zone and Echo has asked once. */
  timezoneDrift?: boolean;
  /** A trip is running right now. */
  tripActive?: boolean;
  /**
   * How many recorded lines the place board holds behind the strip: named places
   * nearby, local changes, entries on your day here. Real content earns the
   * strip on its own; an empty board never does.
   */
  boardLines?: number;
  /** Severe board. Simplify rather than decorate. */
  pressure?: boolean;
};

export type PlaceCue = {
  /** False means render nothing. Not an empty strip — nothing. */
  show: boolean;
  /** The place, as precisely as the fix earns. */
  where: string;
  /** "last confirmed 3 hours ago" — present only when the fix is aging. */
  freshness: string | null;
  stale: boolean;
  /** A real move, for one mechanical flip. Never continuous movement. */
  transition: { from: string; to: string } | null;
  /** Why the strip is on screen at all. */
  reason: "moved" | "trip" | "clock" | "grounds" | null;
  /** Severe state: the strip carries the place and nothing else. */
  simplified: boolean;
};

const HIDDEN: PlaceCue = {
  show: false,
  where: "",
  freshness: null,
  stale: false,
  transition: null,
  reason: null,
  simplified: false,
};

/**
 * Should Today say where you are, and how? This is the only place that
 * decides. Callers render; they do not add conditions of their own.
 */
export function readPlaceCue(input: PlaceCueInput): PlaceCue {
  const where = (input.name ?? "").trim();
  if (!where) return HIDDEN;

  const stale = !!input.stale;
  const movedFrom = (input.movedFrom ?? "").trim();
  const transition = movedFrom && movedFrom !== where ? { from: movedFrom, to: where } : null;

  /* The four reasons place is allowed to speak, in order of consequence. */
  const grounds = input.lineCount > 0 && (!!input.explainsRead || !stale);
  const reason: PlaceCue["reason"] = transition
    ? "moved"
    : input.tripActive
      ? "trip"
      : input.timezoneDrift
        ? "clock"
        : grounds
          ? "grounds"
          : null;

  /* Quiet day, quiet strip. Echo does not prove it is running. */
  if (!reason) return HIDDEN;

  /* Severe: one fact, no flip, no freshness footnote competing with it. */
  if (input.pressure) {
    return { show: true, where, freshness: null, stale, transition: null, reason, simplified: true };
  }

  return {
    show: true,
    where,
    freshness: stale && input.age ? `last confirmed ${input.age}` : null,
    stale,
    transition,
    reason,
    simplified: false,
  };
}
