// baseline — a sense of "usual", computed only from recorded history.
//
// Doctrine:
//   - missing data stays missing. Absence is never a zero, never a low score.
//   - no scores, no grades, no streaks. The verdict is a word, and the word is
//     backed by the numbers it came from.
//   - too little history means "no baseline yet". Saying nothing is allowed.
//   - a baseline describes cadence only: how often this thing usually moves.
//
// Pure module: no IO, no clock beyond what the caller passes in.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The minimum number of gaps before Vanta is allowed to claim a normal. */
export const MIN_SAMPLES = 3;

export type Cadence = {
  /** How many gaps between events were measured. */
  samples: number;
  /** Middle gap between events, in days. */
  medianGapDays: number;
  /** The band Vanta treats as ordinary, in days. */
  normalLowDays: number;
  normalHighDays: number;
  /** The most recent event that fed the baseline. */
  lastAt: string | null;
};

export type BaselineVerdict = "usual" | "quiet" | "unusual" | "no_baseline_yet" | "no_data";

export type BaselineRead = {
  verdict: BaselineVerdict;
  /** Days since the last recorded movement, or null when nothing was recorded. */
  observedGapDays: number | null;
  cadence: Cadence | null;
  /** Plain English, safe to print as-is. Never a number without its meaning. */
  line: string;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const days = (ms: number) => ms / DAY_MS;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Human gap: "about a day", "4 days", "about 3 weeks". */
export function gapPhrase(d: number): string {
  if (d < 0.5) return "hours";
  if (d < 1.5) return "about a day";
  if (d < 13) return `${Math.round(d)} days`;
  const weeks = Math.round(d / 7);
  if (weeks < 9) return weeks === 1 ? "about a week" : `about ${weeks} weeks`;
  const months = Math.round(d / 30);
  return months === 1 ? "about a month" : `about ${months} months`;
}

/**
 * Build a cadence from event timestamps. Order does not matter; anything
 * unparseable is dropped rather than guessed at.
 */
export function buildCadence(timestamps: Array<string | null | undefined>): Cadence | null {
  const ts = timestamps
    .map((t) => (t ? new Date(t).getTime() : NaN))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (ts.length < MIN_SAMPLES + 1) return null;
  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) gaps.push(days(ts[i] - ts[i - 1]));
  const m = median(gaps);
  if (!(m > 0)) return null;
  return {
    samples: gaps.length,
    medianGapDays: round1(m),
    /* A wide, forgiving band. Vanta only speaks well outside ordinary. */
    normalLowDays: round1(Math.max(0, m * 0.4)),
    normalHighDays: round1(m * 2.5),
    lastAt: new Date(ts[ts.length - 1]).toISOString(),
  };
}

/**
 * Compare the current silence against the cadence.
 *
 * "quiet" means longer than ordinary but not yet outside the band; "unusual"
 * means genuinely outside it. Neither is a diagnosis, and neither fires when
 * there is not enough history.
 */
export function unusual(
  cadence: Cadence | null,
  lastAt: string | null | undefined,
  now: number = Date.now(),
): BaselineRead {
  const t = lastAt ? new Date(lastAt).getTime() : NaN;
  const observed = Number.isFinite(t) ? Math.max(0, days(now - t)) : null;

  if (!cadence) {
    if (observed === null) {
      return { verdict: "no_data", observedGapDays: null, cadence: null, line: "Nothing recorded yet." };
    }
    return {
      verdict: "no_baseline_yet",
      observedGapDays: round1(observed),
      cadence: null,
      line: `Last moved ${gapPhrase(observed)} ago. Not enough history yet to say what's normal here.`;
    };
  }

  if (observed === null) {
    return {
      verdict: "no_data",
      observedGapDays: null,
      cadence,
      line: "Nothing recorded yet.",
    };
  }

  const usualPhrase = `usually every ${gapPhrase(cadence.medianGapDays)}`;
  if (observed > cadence.normalHighDays) {
    return {
      verdict: "unusual",
      observedGapDays: round1(observed),
      cadence,
      line: `Quiet for ${gapPhrase(observed)} — ${usualPhrase}.`,
    };
  }
  if (observed > cadence.medianGapDays * 1.4) {
    return {
      verdict: "quiet",
      observedGapDays: round1(observed),
      cadence,
      line: `Slower than usual — ${gapPhrase(observed)} since the last move, ${usualPhrase}.`,
    };
  }
  return {
    verdict: "usual",
    observedGapDays: round1(observed),
    cadence,
    line: `Moving at its usual pace — ${usualPhrase}.`,
  };
}

/** Only "unusual" is worth interrupting someone for. */
export function worthSurfacing(read: BaselineRead): boolean {
  return read.verdict === "unusual";
}

/** The stored row shape — one per object per window. */
export type CadenceRow = {
  object_type: string;
  object_id: string;
  window_days: number;
  samples: number;
  median_gap_days: number;
  last_event_at: string | null;
};

export function cadenceFromRow(row: CadenceRow | null | undefined): Cadence | null {
  if (!row || row.samples < MIN_SAMPLES || !(row.median_gap_days > 0)) return null;
  const m = row.median_gap_days;
  return {
    samples: row.samples,
    medianGapDays: round1(m),
    normalLowDays: round1(Math.max(0, m * 0.4)),
    normalHighDays: round1(m * 2.5),
    lastAt: row.last_event_at ?? null,
  };
}

export function cadenceRowFor(
  objectType: string,
  objectId: string,
  windowDays: number,
  cadence: Cadence,
): CadenceRow {
  return {
    object_type: objectType,
    object_id: objectId,
    window_days: windowDays,
    samples: cadence.samples,
    median_gap_days: cadence.medianGapDays,
    last_event_at: cadence.lastAt,
  };
}
