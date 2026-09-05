// whySurfaced — the one trust reveal, shared by every surface.
//
// Doctrine: if Vanta put something in front of a person unasked, the person can
// always ask "why this?" and get the same seven answers, in the same order, on
// every surface — screen, watch, Telegram:
//
//   1. Where it came from
//   2. What changed
//   3. Compared with what
//   4. Why Vanta raised it
//   5. How fresh the reading is
//   6. Why it matters
//   7. What happens if it is ignored
//
// Nothing here invents an explanation. A fact that was not recorded is left
// out rather than filled in, and an unrecorded comparison is stated as such —
// missing stays missing. Pure module: no IO, no React, no Deno APIs.

export type WhySurfaced = {
  /** Plain-English source name: "Commitments", "Telegram", "Your calendar". */
  source: string;
  /** The change that produced this, in one sentence. */
  whatChanged: string;
  /** The baseline or expectation it was measured against. Null when none exists. */
  comparedWith: string | null;
  /** Why Vanta decided this was worth surfacing. */
  reason: string;
  /** ISO time of the newest fact behind it. Null when nothing was recorded. */
  at: string | null;
  /** The consequence that makes it worth a person's attention. */
  whyItMatters: string;
  /** What happens if nobody touches it. Null when honestly nothing does. */
  ifIgnored: string | null;
};

export const WHY_LABELS = {
  source: "Where it came from",
  whatChanged: "What changed",
  comparedWith: "Compared with",
  reason: "Why Vanta raised it",
  at: "How fresh this is",
  whyItMatters: "Why it matters",
  ifIgnored: "If you ignore it",
} as const;

const MIN = 60_000;

/** "2m ago" / "yesterday" — the age of a real recorded moment, or null. */
export function agoPhrase(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const m = Math.round((now - t) / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

/**
 * Build a reveal from what a caller actually knows. The four load-bearing
 * facts are required; the rest are honestly optional.
 */
export function whyFor(
  input: Pick<WhySurfaced, "source" | "whatChanged" | "reason" | "whyItMatters"> &
    Partial<Pick<WhySurfaced, "comparedWith" | "at" | "ifIgnored">>,
): WhySurfaced {
  return {
    source: input.source,
    whatChanged: input.whatChanged,
    comparedWith: input.comparedWith ?? null,
    reason: input.reason,
    at: input.at ?? null,
    whyItMatters: input.whyItMatters,
    ifIgnored: input.ifIgnored ?? null,
  };
}

export type WhyLine = { key: keyof typeof WHY_LABELS; label: string; text: string };

/** The reveal, in fixed order. Unrecorded facts are dropped, never guessed. */
export function whyLines(why: WhySurfaced, now = Date.now()): WhyLine[] {
  const fresh = agoPhrase(why.at, now);
  const raw: Array<[keyof typeof WHY_LABELS, string | null]> = [
    ["source", why.source],
    ["whatChanged", why.whatChanged],
    ["comparedWith", why.comparedWith],
    ["reason", why.reason],
    ["at", fresh ? `Read ${fresh}` : null],
    ["whyItMatters", why.whyItMatters],
    ["ifIgnored", why.ifIgnored],
  ];
  return raw
    .filter((pair): pair is [keyof typeof WHY_LABELS, string] => Boolean(pair[1] && pair[1].trim()))
    .map(([key, text]) => ({ key, label: WHY_LABELS[key], text }));
}

/**
 * The same reveal compressed for a chat or a wrist: reason, comparison, then
 * source and freshness. Still the truth, just fewer words.
 */
export function compactWhy(why: WhySurfaced, now = Date.now()): string {
  const fresh = agoPhrase(why.at, now);
  const parts = [
    why.reason,
    why.comparedWith ? `Compared with ${lowerFirst(why.comparedWith)}` : null,
    `From ${why.source}${fresh ? `, ${fresh}` : ""}`,
  ].filter(Boolean) as string[];
  return parts.map((p) => (p.endsWith(".") ? p : `${p}.`)).join(" ");
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** True when there is enough recorded to be worth a reveal at all. */
export function hasReveal(why: WhySurfaced | null | undefined): why is WhySurfaced {
  return Boolean(why && why.reason.trim() && why.whatChanged.trim());
}
