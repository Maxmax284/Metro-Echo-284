// motion — one vocabulary for movement in Metro Echo.
//
// Why this exists: durations were spelled three different ways (raw
// `duration-200`, token `duration-[var(--motion-base)]`, legacy
// `animate-fade-in`). Motion should mean something, so it gets named here and
// nowhere else.
//
// Timing contract (tokens live in index.css):
//   micro feedback        ~140ms  --motion-fast
//   standard UI change    ~240ms  --motion-base
//   sheets / dialogs      ~300ms  (--motion-slow is 480ms, used for ambient)
//
// Every class below degrades under `prefers-reduced-motion: reduce`.

/** Colour/opacity feedback on hover, focus and selection. */
export const MOTION_MICRO =
  "transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] motion-reduce:transition-none";

/** Tap compression. Pair with MOTION_MICRO on buttons and tappable cards. */
export const MOTION_PRESS = "motion-press";

/** One-time arrival for a row that just showed up from real new data. */
export const MOTION_ARRIVAL = "motion-arrival";

/**
 * Motion doctrine, in four words:
 *
 *   live data     → arrives  (MOTION_ARRIVE)
 *   history       → settles  (MOTION_STAMP)
 *   user actions  → confirm  (MOTION_COMMIT / MOTION_PRESS)
 *   navigation    → travels  (flip.ts, MOTION_SHEET)
 *
 * Background and graffiti never move. Both classes below are one-shot: apply
 * them only to rows that are genuinely new to this session, never on re-render.
 */

/** Live arrival: slides in from the left, status rail draws, then locks. */
export const MOTION_ARRIVE = "motion-arrive";

/** Recorded history: presses onto the page and settles. Heavier, shorter. */
export const MOTION_STAMP = "motion-stamp";

/**
 * Transit-board flip — a fact that is true *right now* changed its wording: a
 * stay ends on a different day, a meeting is running, a truth ended. The line
 * turns over once, like a split-flap board, and stops. One-shot only: apply
 * while the change is acknowledged, then remove it. Never for new rows (those
 * arrive) and never for history (that stamps).
 */
export const MOTION_FLIP = "motion-flip";

/**
 * Closed and cleared — a promise that was just marked done. The row presses
 * down, dims and holds for a beat so the person sees it land before the list
 * refreshes and it leaves. Applied once, on the row that closed.
 */
export const MOTION_STAMPED_DONE = "motion-stamped-done";

/**
 * Timestamp lock — the clock on a genuinely new row lights once, then
 * settles. Pair with MOTION_ARRIVE (live) or MOTION_STAMP (receipts) on the
 * row; this goes on the timestamp element only. Never re-applied.
 */
export const MOTION_TIME_LOCK = "vanta-time-lock";


/** Tappable row: micro colour feedback plus press compression. */
export const MOTION_ROW = `${MOTION_MICRO} ${MOTION_PRESS}`;

/** Desktop-only 1px depth response for interactive cards. Touch uses press. */
export const MOTION_HOVER_LIFT = "vanta-hover-lift";

/**
 * The one "Echo noticed something" motif: a 1px purple line that sweeps once
 * and settles. Event-driven only — apply while a real change is acknowledged,
 * then remove. Never left on.
 */
export const MOTION_SIGNAL = "vanta-signal";

/**
 * Commit — the one moment of drama in the whole app. Fires when an execute is
 * confirmed: the card presses inward 1px and its border goes solid. Use once
 * per execution, then drop it.
 */
export const MOTION_COMMIT = "motion-commit";

/** Keyboard focus that reads as deliberate. Pair with interactive elements. */
export const MOTION_FOCUS = "vanta-focus";

/** Leading 2px status rail on a row. Tone comes from the row's text-* token. */
export const LEAD_BAR = "vanta-lead";

/**
 * Boot order — put on a feed container so its children arrive in sequence
 * (off the Feel stagger knob, capped at six deep) instead of the whole room
 * painting at once. One-shot per mount, so it re-runs on room entry only.
 */
export const MOTION_BOOT = "vanta-boot";

/**
 * Overlay continuity — a sheet or drawer rising from the edge so it reads as
 * the tapped card expanding rather than a modal appearing on top.
 */
export const MOTION_SHEET = "motion-sheet-in";

/** One slow scan pass. Empty surfaces only: says watching, not broken. */
export const MOTION_SCAN = "vanta-scan";

/** Registration marks shift once when real new data lands. */
export const MOTION_TICKS_LIVE = "vanta-ticks-live";

/**
 * The Feel knob, readable from JavaScript.
 *
 * `--feel-k` is written to <html> by motionPrefs (1 == Standard, 0 == motion
 * off). CSS animations already scale with it; timers used to ignore it, so the
 * setting felt honest in one room and cosmetic in the next. Every JS-held
 * "flash this for a moment" duration goes through feelMs() now.
 */
export function feelK(): number {
  if (typeof document === "undefined") return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--feel-k");
  const k = Number.parseFloat(raw);
  return Number.isFinite(k) ? Math.max(0, Math.min(2.5, k)) : 1;
}

/**
 * Scale a one-shot decorative duration by the Feel knob.
 *
 * `min` keeps a flash perceptible when someone tuned Feel way down; pass
 * `min: 0` for purely decorative flashes that may vanish entirely when motion
 * is off. Never use this for data timing (polls, debounces, retries) — those
 * are correctness, not feel.
 */
export function feelMs(ms: number, { min = 0 }: { min?: number } = {}): number {
  const k = feelK();
  if (k === 0) return min;
  return Math.max(min, Math.round(ms * k));
}





