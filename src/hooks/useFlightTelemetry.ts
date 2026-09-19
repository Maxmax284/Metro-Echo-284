// useFlightTelemetry — the deck keeping itself current while you watch it.
//
// Doctrine:
//   - Readings are paid for, so this asks only while the tab is on screen, only
//     near the flight, and only one flight per tick.
//   - It reads. It never books, notifies, or writes anything but the reading.
//   - The clock it hands back is what makes the reading's age honest on screen.
import { useEffect, useRef, useState } from "react";
import type { FlightPlan } from "@/lib/flightPlan";
import { REREAD_MS, nextToRead } from "@/lib/flightWatch";
import { reachNow } from "@/hooks/useNetworkReach";

const TICK_MS = 30_000;

export function useFlightTelemetry(
  plans: FlightPlan[],
  read: (plan: FlightPlan, opts?: { auto?: boolean }) => Promise<unknown>,
) {
  /** Ticks so reading ages and countdowns move without a reload. */
  const [now, setNow] = useState(() => Date.now());
  const [reading, setReading] = useState<string | null>(null);
  const busy = useRef(false);
  /** When each flight was last asked about here, so a provider that carries
      nothing still cannot be asked again a moment later. */
  const asked = useRef<Record<string, number>>({});
  const plansRef = useRef(plans);
  const readRef = useRef(read);
  plansRef.current = plans;
  readRef.current = read;

  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      /* No bars, no asking. A retry loop at 38,000 feet spends battery to learn
         nothing, and a failed call is not news worth putting on the card. */
      if (!reachNow().online) return;
      if (busy.current) return;
      const now = Date.now();
      const fresh = plansRef.current.filter((p) => now - (asked.current[p.id] ?? 0) >= REREAD_MS);
      const due = nextToRead(fresh, now);
      if (!due) return;
      busy.current = true;
      asked.current[due.id] = now;
      setReading(due.id);
      try {
        await readRef.current(due, { auto: true });
      } catch {
        /* A provider that would not answer is not an error to shout about —
           the deck keeps drawing the last reading it has. */
      } finally {
        busy.current = false;
        if (!stopped) setReading(null);
      }
    };

    const id = window.setInterval(() => void tick(), TICK_MS);
    void tick();
    const onShow = () => void tick();
    document.addEventListener("visibilitychange", onShow);
    /* Back on a network — airport Wi-Fi or a mobile network, it makes no
       difference — read once straight away, so the first thing on screen on the
       ground is a fresh reading rather than the one from before the doors. The
       wait between readings is dropped for that first ask, because a landing is
       exactly when the old reading is worth least. */
    const onReach = () => {
      if (!reachNow().online) return;
      asked.current = {};
      void tick();
    };
    window.addEventListener("online", onReach);
    /* A link that swaps from cabin Wi-Fi to cellular does not always announce
       itself as going offline and back on. The link change does. */
    const link = (navigator as unknown as { connection?: { addEventListener?: (t: string, fn: () => void) => void; removeEventListener?: (t: string, fn: () => void) => void } })
      .connection;
    link?.addEventListener?.("change", onReach);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("online", onReach);
      link?.removeEventListener?.("change", onReach);
    };
  }, []);

  return { now, readingPlanId: reading };
}
