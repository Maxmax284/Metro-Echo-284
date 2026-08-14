// sparkline — turn real recorded timestamps into a tiny activity trace.
//
// This is data-as-decoration: the shape is cool because it is true. No random
// values, no filler curve. If nothing happened, the caller gets a flat line and
// should say so in words rather than draw a fake hill.

/**
 * Bucket ISO timestamps into per-day counts, oldest first.
 * Day 0 is `days - 1` days ago; the last bucket is today.
 */
export function bucketByDay(
  timestamps: (string | null | undefined)[],
  days = 14,
  now = Date.now(),
): number[] {
  const span = Math.max(1, Math.floor(days));
  const buckets = new Array<number>(span).fill(0);
  const DAY = 24 * 60 * 60 * 1000;
  // Anchor to the start of "today" in local time so buckets line up with days.
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const anchor = startOfToday.getTime();

  for (const ts of timestamps) {
    if (!ts) continue;
    const d = new Date(ts);
    const t = d.getTime();
    if (!Number.isFinite(t)) continue;
    // Compare day-to-day, not instant-to-midnight, or a row from yesterday
    // afternoon lands in today's bucket.
    const rowDay = new Date(t);
    rowDay.setHours(0, 0, 0, 0);
    const dayOffset = Math.round((anchor - rowDay.getTime()) / DAY);
    // dayOffset 0 = today, 1 = yesterday, …
    if (dayOffset < 0) {
      buckets[span - 1] += 1; // future-dated rows still count as now
      continue;
    }
    const idx = span - 1 - dayOffset;
    if (idx >= 0) buckets[idx] += 1;
  }
  return buckets;
}

/**
 * Build an SVG polyline path for a bucket series inside a `w × h` box.
 * Scaled to the series max so a quiet week still reads as quiet.
 */
export function sparklinePath(values: number[], w = 64, h = 16): string {
  if (values.length === 0) return "";
  if (values.length === 1) {
    const mid = (h / 2).toFixed(2);
    return `M 0 ${mid} L ${w} ${mid}`;
  }
  const max = Math.max(...values);
  const step = w / (values.length - 1);
  // Keep 1px of headroom top and bottom so the stroke never clips.
  const top = 1;
  const bottom = h - 1;
  return values
    .map((v, i) => {
      const ratio = max === 0 ? 0 : v / max;
      const x = (i * step).toFixed(2);
      const y = (bottom - ratio * (bottom - top)).toFixed(2);
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

/** True when nothing at all was recorded in the window. */
export function isFlat(values: number[]): boolean {
  return values.every((v) => v === 0);
}
