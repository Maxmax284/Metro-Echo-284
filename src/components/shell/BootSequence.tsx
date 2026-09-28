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
import { readTempUnit, tempIn } from "@/lib/tempUnit";
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
  buildRollCall,
  bootHoldMs,
  bootTurn,
  type BootFacts,
  type BootMode,
} from "@/lib/bootSequence";
/* The boot's memory of itself lives in bootStorage — bootSequence.ts stays
   pure, and the intro writes through the same module. The mode decision
   itself is shared with the shell (bootDecision) so the ceremony-day claim
   and the boot never disagree. */
import { localDay, recordBoot } from "@/lib/bootStorage";
import { decideBootAtMount } from "@/lib/bootDecision";
import { metresApart } from "@/lib/placeMove";
import { STAMP_ECHO_M, stampSpoken, stampWord } from "@/lib/welcomeStamp";

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
  const { place, snapshot, stampedPlaces } = useAwareness();
  const timers = useRef<number[]>([]);

  /* The decision is made once, at mount, from what is true right then. The
     encore marker is spent here and only here; the shell's earlier peek
     (bootDecision, consumeEncore: false) claimed the ceremony day without
     touching it. */
  const [mode] = useState<BootMode>(() => decideBootAtMount({ consumeEncore: true }));
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  const facts: BootFacts = useMemo(() => {
    const truth = placeTruth(place);
    const wx = snapshot?.compact?.weather ?? null;
    const fresh = skyIsFresh(wx?.updated_at ?? null);
    const unit = readTempUnit();
    const weatherLabel =
      fresh && wx && wx.tempC != null && wx.condition
        ? `${tempIn(wx.tempC, unit)}°${unit.toUpperCase()} ${wx.condition}`
        : null;
    /* The station layer: the turn of day and the season come off the fix and
       the calendar — the device's own clock answers when the fix names no zone. */
    const geo = ((place?.geo ?? {}) as { lat?: unknown; lon?: unknown; time_zone?: unknown; country_code?: unknown });
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
    /* The welcome stamp echoes only where the fix is fresh — the same law
       the kept occasions hold. "here" when the live row itself is stamped;
       "near" when you're back within earshot of ground you stamped before. */
    let stamp: BootFacts["stamp"] = null;
    if (!truth.stale) {
      const own = typeof place?.stamped_at === "string" ? place.stamped_at : null;
      const ownWord = own ? stampWord(own) : null;
      const ownSpoken = own ? stampSpoken(own) : null;
      if (own && ownWord && ownSpoken) {
        stamp = { word: ownWord, spoken: ownSpoken, kind: "here" };
      } else if (Number.isFinite(lat)) {
        const lon = Number(geo.lon);
        if (Number.isFinite(lon)) {
          let best: { p: (typeof stampedPlaces)[number]; d: number } | null = null;
          for (const p of stampedPlaces ?? []) {
            if (p.id === place?.id) continue;
            const plat = Number((p.geo as { lat?: unknown } | null)?.lat);
            const plon = Number((p.geo as { lon?: unknown } | null)?.lon);
            if (!Number.isFinite(plat) || !Number.isFinite(plon)) continue;
            const d = metresApart({ lat, lon }, { lat: plat, lon: plon });
            if (d <= STAMP_ECHO_M && (!best || d < best.d)) best = { p, d };
          }
          const nearAt = best?.p.stamped_at;
          const nearWord = nearAt ? stampWord(nearAt) : null;
          const nearSpoken = nearAt ? stampSpoken(nearAt) : null;
          if (nearAt && nearWord && nearSpoken) {
            stamp = { word: nearWord, spoken: nearSpoken, kind: "near", label: best?.p.label ?? null };
          }
        }
      }
    }
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
      stamp,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, snapshot]);

  const roll = useMemo(() => buildRollCall(facts), [facts]);

  /* The stamp lands the moment the occasion arrives, with its own sound —
     once, never on a re-render loop. */
  const stamped = useRef(false);
  const hasOccasion = !!facts.occasion;
  const hasStamp = !!facts.stamp;
  useEffect(() => {
    if ((!hasOccasion && !hasStamp) || stamped.current || mode === "skip") return;
    stamped.current = true;
    if (!reducedMotion()) play("stamp", { gain: 0.35 });
  }, [hasOccasion, hasStamp, mode]);

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
              {i === 1 && facts.stamp && (
                <span
                  className="boot-stamp boot-stamp-welcome"
                  aria-label={
                    facts.stamp.kind === "here"
                      ? `You stamped this place ${facts.stamp.spoken}`
                      : `Stamped ground nearby: ${facts.stamp.label ?? "a saved place"}, ${facts.stamp.spoken}`
                  }
                >
                  Stamped {facts.stamp.word}
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
