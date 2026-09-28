// bootDecision — the one place the boot mode is decided.
//
// The decision needs IO (the encore marker, the boot's own memory, the URL,
// the weather), so it can't live in the pure bootSequence.ts. It lives here
// so two callers can share it without two systems:
//
//  - The boot itself decides at mount with consumeEncore: true — a sign-in
//    encore is spent exactly once.
//  - The shell peeks (consumeEncore: false) at its first render, purely to
//    claim the ceremony day for the arbitration gate. The peek never spends
//    the encore — that marker belongs to the boot's own decision.
import { BOOT_ENCORE_KEY, decideBoot, type BootMode } from "@/lib/bootSequence";
import { localDay, readLastBoot } from "@/lib/bootStorage";
import { currentWeather } from "@/lib/weather";

/** A notification tap or saved room link asked for something specific. */
function isDeepLink(): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams(window.location.search);
  return ["room", "commitment", "surface", "ack", "as"].some((k) => p.has(k));
}

export function decideBootAtMount(opts: { consumeEncore: boolean }): BootMode {
  /* A sign-in just delivered you here (Google's round trip or the email
     form). That is an arrival, not a reopen — the encore marker forces the
     full roll call once, however fresh the last boot was. */
  try {
    if (localStorage.getItem(BOOT_ENCORE_KEY)) {
      if (opts.consumeEncore) localStorage.removeItem(BOOT_ENCORE_KEY);
      return "full";
    }
  } catch {
    /* private window — fall through to the ordinary decision */
  }
  const last = readLastBoot();
  return decideBoot({
    now: Date.now(),
    lastBootAt: last.at,
    lastBootDay: last.day,
    today: localDay(),
    deepLink: isDeepLink(),
    urgent: currentWeather() === "pressure",
  }).mode;
}
