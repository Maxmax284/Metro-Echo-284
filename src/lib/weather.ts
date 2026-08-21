// Shell weather — the room reflects the state of the world.
//
// One derived value, three settings. Weather is *ambient*: it never tells the
// user anything they can't read in words elsewhere, it just changes how the
// shell feels so a calm day and a pressured day are distinguishable at a
// glance, before reading.
//
//   calm     — nothing overdue, nothing waiting on you.
//   drift    — something is slipping: things waiting, captures piling up.
//   pressure — overdue promises or a real security signal.
//
// Applied as a `data-weather` attribute on <html>; every visual consequence
// lives in index.css so components stay unaware.

export type Weather = "calm" | "drift" | "pressure";

export type WeatherInputs = {
  /** Promises past their date. */
  overdue: number;
  /** Items asking for a decision (approvals, staged actions, risks). */
  attention: number;
  /** Unrouted captures sitting in the inbox. */
  captures: number;
  /** True when security has something unusual to say. */
  securityAlert: boolean;
  /** A proactive drift signal is currently surfaced. */
  noticed: boolean;
};

export function deriveWeather(input: WeatherInputs): Weather {
  if (input.overdue > 0 || input.securityAlert) return "pressure";
  if (input.attention > 0 || input.noticed || input.captures >= 5) return "drift";
  return "calm";
}

const ATTR = "data-weather";
const CALM_CLASS = "vanta-exhale-once";

/**
 * Write the weather onto <html>. When the world settles into calm from
 * something worse, the shell exhales once — the only reward in the system, and
 * it is earned rather than celebratory (no confetti, no toast).
 */
export function applyWeather(next: Weather): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const prev = root.getAttribute(ATTR) as Weather | null;
  if (prev === next) return;
  root.setAttribute(ATTR, next);

  if (next === "calm" && prev && prev !== "calm") {
    root.classList.remove(CALM_CLASS);
    // Force a reflow so the class re-triggers even on rapid transitions.
    void root.offsetWidth;
    root.classList.add(CALM_CLASS);
    window.setTimeout(() => root.classList.remove(CALM_CLASS), 1600);
  }
}

/** Read the current weather. Test/debug convenience. */
export function currentWeather(): Weather | null {
  if (typeof document === "undefined") return null;
  return (document.documentElement.getAttribute(ATTR) as Weather | null) ?? null;
}
