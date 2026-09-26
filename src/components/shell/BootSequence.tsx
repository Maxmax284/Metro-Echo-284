// BootSequence — the station lights up before you step onto the platform.
//
// Not a splash screen: Today paints underneath immediately, and this is a
// cover that speaks a roll call of verified facts — the place at speakable
// precision, the clock, weather Echo already fetched, the operational state —
// then lifts like a shutter. It never blocks essential UI: any tap skips it,
// a quick reopen gets a nod, a notification deep-link or a pressured day
// skips it entirely, and offline it says NO SIGNAL instead of ALL CLEAR.
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SolariWord } from "@/components/today/SignalBeacon";
import { useAwareness } from "@/providers/AwarenessProvider";
import { placeTruth } from "@/lib/placeTruth";
import { currentWeather } from "@/lib/weather";
import { reachNow } from "@/hooks/useNetworkReach";
import { skyFromCondition, skyIsFresh } from "@/lib/sky";
import { reducedMotion } from "@/lib/reducedMotion";
import { play } from "@/lib/streetSound";
import { feelMs } from "@/lib/motion";
import { daypartInZone } from "@/lib/daylight";
import { seasonFor } from "@/lib/station";
import { OCCASIONS_KEY, occasionFor } from "@/lib/occasions";
import {
  BOOT_ENCORE_KEY,
  buildRollCall,
  bootHoldMs,
  bootTurn,
  decideBoot,
  type BootFacts,
  type BootMode,
} from "@/lib/bootSequence";

const KEY_AT = "vanta.boot.at";
const KEY_DAY = "vanta.boot.day";

function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readLastBoot(): { at: number | null; day: string | null } {
  try {
    const raw = localStorage.getItem(KEY_AT);
    const at = raw ? Number(raw) : null;
    return { at: at != null && Number.isFinite(at) ? at : null, day: localStorage.getItem(KEY_DAY) };
  } catch {
    return { at: null, day: null };
  }
}

function recordBoot() {
  try {
    localStorage.setItem(KEY_AT, String(Date.now()));
    localStorage.setItem(KEY_DAY, localDay());
  } catch {
    /* a private window still gets its boot; it just forgets it happened */
  }
}

/** A notification tap or saved room link asked for something specific. */
function isDeepLink(): boolean {
  if (typeof window === "undefined") return false;
  const p = new URLSearchParams(window.location.search);
  return ["room", "commitment", "surface", "ack", "as"].some((k) => p.has(k));
}

function clockLabel(): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString();
  }
}

export function BootSequence() {
  const { place, snapshot } = useAwareness();
  const timers = useRef<number[]>([]);

  /* The decision is made once, at mount, from what is true right then. */
  const [mode] = useState<BootMode>(() => {
    /* A sign-in just delivered you here (Google's round trip or the email
       form). That is an arrival, not a reopen — the encore marker forces the
       full roll call once, however fresh the last boot was. */
    try {
      if (localStorage.getItem(BOOT_ENCORE_KEY)) {
        localStorage.removeItem(BOOT_ENCORE_KEY);
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
  });
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  const facts: BootFacts = useMemo(() => {
    const truth = placeTruth(place);
    const wx = snapshot?.compact?.weather ?? null;
    const fresh = skyIsFresh(wx?.updated_at ?? null);
    const unit = (() => {
      try {
        return localStorage.getItem("vanta.tempunit") === "f" ? "f" : "c";
      } catch {
        return "c";
      }
    })();
    const weatherLabel =
      fresh && wx && wx.tempC != null && wx.condition
        ? `${Math.round(unit === "f" ? (wx.tempC * 9) / 5 + 32 : wx.tempC)}° ${wx.condition}`
        : null;
    /* The station layer: the turn of day and the season come off the fix and
       the calendar — the device's own clock answers when the fix names no zone. */
    const geo = ((place?.geo ?? {}) as { lat?: unknown; time_zone?: unknown; country_code?: unknown });
    const lat = Number(geo.lat);
    const tz = typeof geo.time_zone === "string" ? geo.time_zone : null;
    /* Kept occasions: opt-in per device, and only where the fix is fresh —
       a stale place never earns a stamp it might not be standing in. */
    const occasionsOn = (() => {
      try {
        return localStorage.getItem(OCCASIONS_KEY) === "1";
      } catch {
        return false;
      }
    })();
    const country =
      (typeof place?.country === "string" && place.country) ||
      (typeof geo.country_code === "string" ? geo.country_code : null);
    const occasion =
      occasionsOn && !truth.stale ? occasionFor(new Date(), country) : null;
    return {
      placeName: truth.name,
      placeStale: truth.stale,
      placeAge: truth.age,
      clockLabel: clockLabel(),
      weatherLabel,
      operational: currentWeather(),
      online: reachNow().online,
      daypart: daypartInZone(tz),
      seasonLabel: Number.isFinite(lat) ? seasonFor(new Date(), lat).short : null,
      occasion: occasion ? { name: occasion.name, tone: occasion.tone } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, snapshot]);

  const roll = useMemo(() => buildRollCall(facts), [facts]);

  /* The stamp lands the moment the occasion arrives, with its own sound —
     once, never on a re-render loop. */
  const stamped = useRef(false);
  const hasOccasion = !!facts.occasion;
  useEffect(() => {
    if (!hasOccasion || stamped.current || mode === "skip") return;
    stamped.current = true;
    if (!reducedMotion()) play("stamp", { gain: 0.35 });
  }, [hasOccasion, mode]);

  useEffect(() => {
    if (mode === "skip") return;
    const reduced = reducedMotion();
    if (mode === "full" && !reduced) {
      play("turnstile", { gain: 0.7 });
      timers.current.push(window.setTimeout(() => play("clack", { gain: 0.5 }), 1600));
      timers.current.push(window.setTimeout(() => play("clack", { gain: 0.4 }), 3200));
      timers.current.push(window.setTimeout(() => play("clack", { gain: 0.35 }), 4800));
    }
    const hold = feelMs(bootHoldMs(mode, reduced), { min: mode === "micro" ? 200 : 420 });
    timers.current.push(window.setTimeout(() => setLeaving(true), hold));
    timers.current.push(
      window.setTimeout(() => {
        recordBoot();
        setGone(true);
      }, hold + 480),
    );
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, [mode]);

  /* Pressure arriving mid-boot cuts the ceremony short: when something needs
     the person, the cover gets out of the way at once. */
  useEffect(() => {
    if (mode === "skip" || gone) return;
    const obs = new MutationObserver(() => {
      if (currentWeather() === "pressure") {
        recordBoot();
        setGone(true);
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-weather"] });
    return () => obs.disconnect();
  }, [mode, gone]);

  if (mode === "skip" || gone) return null;

  const skip = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    recordBoot();
    setGone(true);
  };

  return (
    <div
      className={cn("boot-sequence fixed inset-0 z-[100] flex items-center justify-center px-6", leaving && "boot-sequence-out")}
      role="status"
      aria-live="polite"
      aria-label="Metro Echo is starting. Tap to skip."
      onClick={skip}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
      }}
      tabIndex={-1}
    >
      <div className="boot-box w-full max-w-[340px] rounded-md border border-border/70 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="echo-lens echo-lens-live is-lit h-2.5 w-2.5 rounded-full" aria-hidden />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {bootTurn(facts.daypart).header}
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            tap to skip
          </span>
        </div>

        <div className="mt-3 space-y-2.5">
          {roll.map((call, i) => (
            <div key={`${call.word}-${i}`} className="relative">
              <SolariWord word={call.word} tone={call.word === "ALL CLEAR" ? "live" : call.word === "NEEDS YOU" || call.word === "NEEDS A LOOK" || call.word === "NO SIGNAL" ? "hold" : undefined} />
              {i === 1 && facts.occasion && (
                <span
                  className={cn("boot-stamp", `boot-stamp-${facts.occasion.tone}`)}
                  aria-label={`Kept occasion today: ${facts.occasion.name}`}
                >
                  {facts.occasion.name}
                </span>
              )}
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{call.line}</p>
            </div>
          ))}
        </div>

        <div className="desk-transit-track mt-3.5 h-[3px] w-full overflow-hidden rounded-full">
          <span className="desk-transit-run block h-full w-1/3 rounded-full" aria-hidden />
        </div>
      </div>
    </div>
  );
}
