// welcomeStamp — a deliberate mark that this ground is yours.
//
// Doctrine:
//   - Stamping is a deliberate act, never inferred. One press, one row,
//     one receipt in the audit trail.
//   - A stamp is place identity, so it obeys the same law as names: it never
//     travels with coordinates. A real move lifts it (placeMove clears it).
//   - The boot echoes a stamp only where the fix is fresh — a stale fix
//     never earns one, the same rule the kept occasions hold.
//   - Stamps are keepsakes, not tracking. No history, no route, no count of
//     how often you stood somewhere.
//
// Pure module: no IO, no React.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(at: string | Date): { m: string; d: number; y: number } | null {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return { m: MONTHS[date.getMonth()], d: date.getDate(), y: date.getFullYear() };
}

/** Spoken form — "Sep 20", or "Sep 20, 2025" once it belongs to another year. */
export function stampSpoken(at: string | Date, now: Date = new Date()): string | null {
  const p = parts(at);
  if (!p) return null;
  return p.y === now.getFullYear() ? `${p.m} ${p.d}` : `${p.m} ${p.d}, ${p.y}`;
}

/** Ink form for the stamp itself — "SEP 20", or "SEP 20 ’25" across a year. */
export function stampWord(at: string | Date, now: Date = new Date()): string | null {
  const spoken = stampSpoken(at, now);
  if (!spoken) return null;
  return spoken.replace(/, (\d{4})$/, (_m, y: string) => ` ’${y.slice(2)}`).toUpperCase();
}

/** What a stamp may say about itself, everywhere it appears. */
export const STAMP_COPY = {
  action: "Stamp this place",
  why: "Mark this ground as yours. The stamp shows here and echoes when the app opens on it.",
  confirm: "Press the stamp?",
  press: "Press it",
  cancel: "Not yet",
  lift: "Lift the stamp",
  lifted: "Stamp lifted. The receipt is in Receipts.",
  pressed: "Stamped. It's on file — the receipt is in Receipts.",
  /** Boot line provenance, appended to the place line. */
  onFile: (spoken: string) => `on file since ${spoken}`,
  /** Returning to ground near a place you stamped before. */
  stampedGround: "ground you've stamped before",
} as const;
