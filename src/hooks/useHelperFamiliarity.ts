// useHelperFamiliarity — helper copy that gets out of the way.
//
// A section explains itself in full for the first few visits, then collapses to
// an info affordance the user can reopen on demand. Counts are local to the
// device: this is a reading habit, not account state, and it must never cost a
// round trip.

import { useCallback, useEffect, useState } from "react";

const PREFIX = "vanta.helper.";
/** Visits during which the full line stays visible. */
export const FAMILIAR_AFTER = 3;

function readCount(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCount(key: string, n: number) {
  try {
    window.localStorage.setItem(PREFIX + key, String(n));
  } catch {
    /* private mode — helper copy just stays expanded, which is the safe side. */
  }
}

/** True once the section has been seen enough times to stop explaining itself. */
export function isFamiliar(key: string, count = readCount(key)): boolean {
  return count >= FAMILIAR_AFTER;
}

export function useHelperFamiliarity(key: string) {
  const [count, setCount] = useState(() => readCount(key));
  const [revealed, setRevealed] = useState(false);

  /* One increment per mount of the section, not per render. */
  useEffect(() => {
    const next = readCount(key) + 1;
    writeCount(key, next);
    setCount(next);
    setRevealed(false);
  }, [key]);

  const reveal = useCallback(() => setRevealed((v) => !v), []);

  const familiar = isFamiliar(key, count);
  return {
    /** Show the full explanation line. */
    expanded: !familiar || revealed,
    /** The user has seen this section enough times. */
    familiar,
    /** Toggle the on-demand explanation. */
    reveal,
    revealed,
  };
}
