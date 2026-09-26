// daylight — the light in the room follows the clock where you actually are.
//
// Doctrine: the artwork never moves; only the light over it does. This sets two
// things on <html> and nothing else:
//   --tod       0 at dawn → 1 at dusk, for the position of the light puddle
//   data-daypart  dawn | day | golden | dusk | night, for its colour
// No data is read, nothing is invented: it is the local clock, that is all.

export type Daypart = "dawn" | "day" | "golden" | "dusk" | "night";

/** Which part of the day a local hour belongs to. Pure, so it is testable. */
export function daypartFor(hour: number): Daypart {
  if (hour < 5) return "night";
  if (hour < 8) return "dawn";
  if (hour < 16) return "day";
  if (hour < 18.5) return "golden";
  if (hour < 20.5) return "dusk";
  return "night";
}

/** Where the light sits across the wall, 0 (east) → 1 (west). */
export function lightPosition(hour: number): number {
  return Math.max(0, Math.min(1, (hour - 5) / 15));
}

function localHour(timezone?: string): number {
  const now = new Date();
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const h = Number(parts.find((p) => p.type === "hour")?.value);
      const m = Number(parts.find((p) => p.type === "minute")?.value);
      if (Number.isFinite(h) && Number.isFinite(m)) return h + m / 60;
    } catch {
      /* bad zone — fall through to the device clock */
    }
  }
  return now.getHours() + now.getMinutes() / 60;
}

/** The daypart on the clock at the place — the device's own when no zone is given. */
export function daypartInZone(timeZone?: string | null): Daypart {
  return daypartFor(localHour(timeZone ?? undefined));
}

/** Apply the current light once. Safe to call as often as you like. */
export function applyDaylight(timezone?: string): void {
  if (typeof document === "undefined") return;
  const hour = localHour(timezone);
  const root = document.documentElement;
  root.style.setProperty("--tod", lightPosition(hour).toFixed(2));
  root.setAttribute("data-daypart", daypartFor(hour));
}

let timer: number | null = null;

/** Keep it honest through the day: re-read every five minutes. */
export function startDaylight(timezone?: string): () => void {
  applyDaylight(timezone);
  if (typeof window === "undefined") return () => undefined;
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(() => applyDaylight(timezone), 5 * 60 * 1000);
  return () => {
    if (timer) window.clearInterval(timer);
    timer = null;
  };
}
