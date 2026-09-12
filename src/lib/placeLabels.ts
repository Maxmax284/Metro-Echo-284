// placeLabels — how a saved pin reads on a phone.
//
// Some pins are named by hand ("Wingate Chantilly") and some are stamped by the
// system when a fix was captured ("Spot 8/29/2026, 4:47:45 AM"). At 384px a raw
// timestamp truncates into nonsense, so a stamped pin says what it is and when,
// short enough to fit. Nothing is invented: the date shown is the date stored.

const STAMPED = /^(spot|fix|here|place)\s+(.+)$/i;

/** A stamped pin is one the system named from a timestamp, not the user. */
export function isStampedPlaceLabel(label: string): boolean {
  const m = STAMPED.exec(label.trim());
  if (!m) return false;
  return !Number.isNaN(Date.parse(m[2]));
}

/**
 * Short display label for a saved place. Hand-named pins come back untouched.
 */
export function placeDisplayLabel(label: string): string {
  const raw = (label ?? "").trim();
  const m = STAMPED.exec(raw);
  if (!m) return raw;
  const when = new Date(m[2]);
  if (Number.isNaN(when.getTime())) return raw;
  const kind = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  const date = when.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const time = when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${kind} · ${date}, ${time}`;
}
