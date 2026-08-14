// motion — one vocabulary for movement in Vanta.
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

/** Standard UI transition: state, size, position. */
export const MOTION_UI =
  "transition-all duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none";

/** Tap compression. Pair with MOTION_MICRO on buttons and tappable cards. */
export const MOTION_PRESS = "motion-press";

/** One-time arrival for a row that just showed up from real new data. */
export const MOTION_ARRIVAL = "motion-arrival";

/** One-time settle when a record resolves (staged → approved → executed). */
export const MOTION_RESOLVE = "motion-resolve";

/** Tappable row: micro colour feedback plus press compression. */
export const MOTION_ROW = `${MOTION_MICRO} ${MOTION_PRESS}`;
