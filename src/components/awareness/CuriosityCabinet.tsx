// CuriosityCabinet — small dials about the sky over the place you're reading,
// and the ground under you.
//
// Moon, daylight, season — plus about-you dials: the hour at home, the line
// the device claims, and a sixth slot that rotates one dial a day (places
// kept, the platform clock, marks pressed). Every one is figured on this
// device from the date, the fix, the zone database and the board — no feed,
// no AI, no network — so the cabinet works with no signal at all, and says
// where each reading comes from when you tap a dial.
//
// Doctrine:
//   - No widget pile: one card, six dials, one caption line — the sixth slot
//     rotates with the date, it never grows.
//   - A season read is a generalization and is labelled as one — the usual
//     pattern for a band of the world, never a forecast.
//   - No coordinates, no cabinet claims: the empty state teaches how the
//     dials get their sky.
//   - The travel counter counts the board. No route history, no breadcrumbs.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, Home, MapPinned, Moon, Signal, Stamp, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";
import { rotatingDial, type RotatingDialId } from "@/lib/stationMarks";
import { signalRead, type SignalRead } from "@/lib/signalBars";
import {
  clockFromMinutes,
  dateKeyDiff,
  hoursFromMinutes,
  seasonFor,
  stationRead,
  sunFraction,
  zoneClock,
  type Hemisphere,
  type SeasonKey,
} from "@/lib/station";

type DialId = "moon" | "light" | "season" | "home" | "signal" | RotatingDialId;

export type CabinetHome = {
  label: string;
  timeZone: string | null;
  /** True when the board is reading the home place itself. */
  atHome?: boolean;
};

export type CabinetCounts = { places: number; countries: number };

const SEASON_TOKEN: Record<SeasonKey, string> = {
  spring: "--cab-spring",
  summer: "--cab-summer",
  autumn: "--cab-autumn",
  winter: "--cab-winter",
  wet: "--cab-wet",
  dry: "--cab-dry",
  equatorial: "--cab-eq",
};

/** SVG path of the lit part of the moon face. r=16 in a 40×40 box. */
function moonLitPath(k: number, waxing: boolean, hemi: Hemisphere): string {
  const t = Math.min(0.995, Math.max(-0.995, 2 * k - 1));
  const rx = (Math.abs(t) * 16).toFixed(2);
  // Northern sky: waxing lit on the right. Below the equator the face turns
  // over and the lit side flips — the cabinet draws what you'd actually see.
  const litRight = hemi === "south" ? !waxing : waxing;
  return litRight
    ? `M20,4 A16,16 0 0 1 20,36 A${rx},16 0 0 ${t > 0 ? 1 : 0} 20,4 Z`
    : `M20,4 A16,16 0 0 0 20,36 A${rx},16 0 0 ${t > 0 ? 0 : 1} 20,4 Z`;
}

/** A 12-month ring, each segment coloured by the season that month lives in. */
function SeasonRing({ lat, now }: { lat: number; now: Date }) {
  const year = now.getUTCFullYear();
  const months = Array.from({ length: 12 }, (_, m) => seasonFor(new Date(Date.UTC(year, m, 15)), lat).key);
  const r = 26;
  const c = 2 * Math.PI * r;
  const seg = c / 12;
  const gap = 1.6;
  const nowAngle = (((now.getUTCMonth() + 0.5) / 12) * 360 - 90) * (Math.PI / 180);
  return (
    <svg viewBox="0 0 64 64" className="cab-ring" aria-hidden>
      {months.map((key, i) => (
        <circle
          key={i}
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={`hsl(var(${SEASON_TOKEN[key]}))`}
          strokeWidth="7"
          strokeDasharray={`${(seg - gap).toFixed(2)} ${(c - seg + gap).toFixed(2)}`}
          strokeDashoffset={(-(i * seg) + c / 4).toFixed(2)}
        />
      ))}
      <circle
        className="cab-needle"
        r="3.2"
        style={{ transform: `translate(${32 + r * Math.cos(nowAngle)}px, ${32 + r * Math.sin(nowAngle)}px)` }}
      />
    </svg>
  );
}

/** The device's own claim about the line. Never a probe. */
function readDeviceLine(): SignalRead {
  try {
    const nav = navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number } };
    return signalRead(nav.onLine !== false, nav.connection?.effectiveType ?? null, nav.connection?.rtt ?? null);
  } catch {
    return signalRead(true, null, null);
  }
}

/** "tomorrow there" / "yesterday there" / "+2d there" — 0 stays quiet. */
function shiftWord(days: number): string | null {
  if (days === 1) return "tomorrow there";
  if (days === -1) return "yesterday there";
  if (days !== 0) return `${days > 0 ? "+" : ""}${days}d there`;
  return null;
}

export function CuriosityCabinet({
  city,
  lat,
  lon,
  timeZone,
  home = null,
  counts = null,
  marks = null,
  className,
}: {
  city: string | null;
  lat: number | null;
  lon: number | null;
  timeZone?: string | null;
  home?: CabinetHome | null;
  counts?: CabinetCounts | null;
  /** Marks still standing, or null when unknown — unknown never joins the rotation. */
  marks?: number | null;
  className?: string;
}) {
  const [tick, setTick] = useState(0);
  const [src, setSrc] = useState<DialId | null>(null);
  const [conn, setConn] = useState<SignalRead>(() => readDeviceLine());

  // The sun and the clocks move; re-figure every minute.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // The line changes when the device says so — online, offline, 4g to 2g.
  useEffect(() => {
    const update = () => setConn(readDeviceLine());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const c = (navigator as Navigator & { connection?: EventTarget }).connection;
    c?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      c?.removeEventListener?.("change", update);
    };
  }, []);

  const ready = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [tick]);
  const read = useMemo(
    () => (ready ? stationRead(now, lat!, lon!, timeZone ?? null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, lat, lon, timeZone, now],
  );
  const frac = useMemo(
    () => (ready ? sunFraction(now, lat!, lon!, timeZone ?? null) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, lat, lon, timeZone, now],
  );

  /* Home hour, and how many days apart home's calendar is from the place
     being read (device zone when the place carries none). */
  const homeClock = home?.timeZone ? zoneClock(now, home.timeZone) : null;
  const hereDateKey = useMemo(() => {
    if (timeZone) return zoneClock(now, timeZone)?.dateKey ?? null;
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, [now, timeZone]);
  const homeShift = homeClock && hereDateKey ? shiftWord(dateKeyDiff(hereDateKey, homeClock.dateKey)) : null;

  /* The rotating sixth slot: the places count always qualifies, the platform
     clock needs a zone on file, the marks dial needs a known count. The date
     picks — never a flicker inside a day. */
  const hereClock = timeZone ? zoneClock(now, timeZone) : null;
  const extras: RotatingDialId[] = [
    "travel",
    ...(hereClock ? (["clock"] as const) : []),
    ...(marks != null ? (["marks"] as const) : []),
  ];
  const slotDial = rotatingDial(hereDateKey ?? "undated", extras);

  const flip = (d: DialId) => {
    play("tick", { gain: 0.35 });
    setSrc((s) => (s === d ? null : d));
  };

  if (!ready || !read) {
    return (
      <section className={cn("vanta-card p-4", className)}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Curiosity cabinet</p>
        <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
          The cabinet needs a place to be about. Set where you are and the moon, the daylight and the
          season set themselves — they only need the date and a sky to be over.
        </p>
      </section>
    );
  }

  const { moon, daylight, season, line } = read;
  const moonPct = Math.round(moon.illumination * 100);
  const sunUp = frac != null;
  const sunX = 60 - 46 * Math.cos(Math.PI * (frac ?? 0));
  const sunY = 38 - 46 * Math.sin(Math.PI * (frac ?? 0));

  const lightLine = daylight.polar === "midnight-sun"
    ? "The sun doesn't set today"
    : daylight.polar === "polar-night"
      ? "The sun doesn't rise today"
      : `${hoursFromMinutes(daylight.dayLengthMin)} of light`;

  const lightSub = daylight.sunriseMin != null && daylight.sunsetMin != null
    ? `up ${clockFromMinutes(daylight.sunriseMin)} · down ${clockFromMinutes(daylight.sunsetMin)}`
    : daylight.polar
      ? "this far from the equator, this time of year"
      : null;

  const homeAria = home?.atHome
    ? `Home: you're home — ${home.label}.`
    : home && homeClock
      ? `Home: ${homeClock.hhmm} at ${home.label}${homeShift ? `, ${homeShift}` : ""}.`
      : home
        ? "Home is pinned but its clock zone isn't on file."
        : "No home pinned yet.";

  const travelCount = counts && counts.places > 0 ? counts : null;

  const PROVENANCE: Record<DialId, string> = {
    moon: "Lunar math from the date — the same cycle everywhere, good to about a day. The lit side flips below the equator.",
    light: "From the latitude and the day of the year. Times are approximate — terrain and clock rules both argue.",
    season: season.note,
    home: home
      ? "Home is the place you marked Home on your board. The hour comes from that place's clock zone — figured here, never fetched."
      : "Mark a saved place as Home and this dial keeps its hour while you're away.",
    signal: "Your device's own report — its word, not a test. Echo doesn't spend a packet to check the line.",
    travel: "Counted from the places on your board — nothing else. No route history, no breadcrumb trail.",
  };

  return (
    <section className={cn("vanta-card cabinet p-4", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Curiosity cabinet</p>
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/70">
          {line}{city ? ` · ${city}` : ""}
        </p>
      </div>

      <div className="cabinet-row mt-3 grid grid-cols-3 gap-2">
        {/* Moon */}
        <button
          type="button"
          onClick={() => flip("moon")}
          aria-pressed={src === "moon"}
          aria-label={`Moon: ${moon.name}, ${moonPct} percent lit. Tap for where this reading comes from.`}
          className="cab-dial"
        >
          <span className="cab-dial-icon"><Moon className="h-3 w-3" /> moon</span>
          <svg viewBox="0 0 40 40" className="cab-moon" aria-hidden>
            <circle cx="20" cy="20" r="16" className="cab-moon-dark" />
            <path d={moonLitPath(moon.illumination, moon.waxing, read.hemisphere)} className="cab-moon-lit" />
          </svg>
          <span className="cab-dial-word">{moon.name}</span>
          <span className="cab-dial-sub">{moonPct}% lit</span>
        </button>

        {/* Daylight */}
        <button
          type="button"
          onClick={() => flip("light")}
          aria-pressed={src === "light"}
          aria-label={`Daylight: ${lightLine}${lightSub ? `, ${lightSub}` : ""}. Tap for where this reading comes from.`}
          className="cab-dial"
        >
          <span className="cab-dial-icon"><Sun className="h-3 w-3" /> light</span>
          <svg viewBox="0 0 120 44" className="cab-arc" aria-hidden>
            <line x1="8" y1="38" x2="112" y2="38" className="cab-horizon" />
            <path d="M14,38 A46,46 0 0 1 106,38" className="cab-arc-track" />
            {sunUp && <circle className="cab-sun" r="4" style={{ transform: `translate(${sunX}px, ${sunY}px)` }} />}
            {!sunUp && !daylight.polar && <circle className="cab-sun cab-sun-down" r="3" style={{ transform: "translate(60px, 41px)" }} />}
          </svg>
          <span className="cab-dial-word">{lightLine}</span>
          {lightSub && <span className="cab-dial-sub">{lightSub}</span>}
        </button>

        {/* Season */}
        <button
          type="button"
          onClick={() => flip("season")}
          aria-pressed={src === "season"}
          aria-label={`Season: ${season.label}. Tap for where this reading comes from.`}
          className="cab-dial"
        >
          <span className="cab-dial-icon"><CalendarDays className="h-3 w-3" /> season</span>
          <SeasonRing lat={lat!} now={now} />
          <span className="cab-dial-word">{season.label}</span>
          <span className="cab-dial-sub">{read.hemisphere === "south" ? "southern" : "northern"} {read.band}</span>
        </button>
      </div>

      <div className="cabinet-row mt-2 grid grid-cols-3 gap-2">
        {/* Home — the hour at the place you marked Home. */}
        <button
          type="button"
          onClick={() => flip("home")}
          aria-pressed={src === "home"}
          aria-label={`${homeAria} Tap for where this reading comes from.`}
          className="cab-dial"
        >
          <span className="cab-dial-icon"><Home className="h-3 w-3" /> home</span>
          {home?.atHome ? (
            <>
              <span className="cab-home-mark" aria-hidden>■</span>
              <span className="cab-dial-word">You're home</span>
              <span className="cab-dial-sub">{home.label}</span>
            </>
          ) : home && homeClock ? (
            <>
              <span className="cab-clockface font-mono" aria-hidden>
                {homeClock.hhmm.split(":")[0]}
                <span className="cab-blink">:</span>
                {homeClock.hhmm.split(":")[1]}
              </span>
              <span className="cab-dial-word">At home</span>
              <span className="cab-dial-sub">{homeShift ? `${home.label} · ${homeShift}` : home.label}</span>
            </>
          ) : home ? (
            <>
              <span className="cab-home-mark" aria-hidden>■</span>
              <span className="cab-dial-word">Home</span>
              <span className="cab-dial-sub">its clock zone isn't on file</span>
            </>
          ) : (
            <>
              <span className="cab-home-mark" aria-hidden>■</span>
              <span className="cab-dial-word">No home pinned</span>
              <span className="cab-dial-sub">mark a saved place Home</span>
            </>
          )}
        </button>

        {/* Signal — the line the device claims. */}
        <button
          type="button"
          onClick={() => flip("signal")}
          aria-pressed={src === "signal"}
          aria-label={`Signal: ${conn.word}. ${conn.sub}. Tap for where this reading comes from.`}
          className="cab-dial"
        >
          <span className="cab-dial-icon"><Signal className="h-3 w-3" /> signal</span>
          <span className="cab-bars" aria-hidden>
            {[1, 2, 3, 4].map((b) => (
              <span key={b} className={cn("cab-bar", b <= conn.bars && "on")} />
            ))}
          </span>
          <span className="cab-dial-word">{conn.word}</span>
          <span className="cab-dial-sub">{conn.sub}</span>
        </button>

        {/* Travel — the board, counted. */}
        <button
          type="button"
          onClick={() => flip("travel")}
          aria-pressed={src === "travel"}
          aria-label={
            travelCount
              ? `Travel: ${travelCount.places} places kept across ${travelCount.countries} countries. Tap for where this reading comes from.`
              : "Travel: no places kept yet. Tap for where this reading comes from."
          }
          className="cab-dial"
        >
          <span className="cab-dial-icon"><MapPinned className="h-3 w-3" /> travel</span>
          {travelCount ? (
            <>
              <span className="cab-count font-mono" aria-hidden>{travelCount.places}</span>
              <span className="cab-dial-word">{travelCount.places === 1 ? "Place kept" : "Places kept"}</span>
              <span className="cab-dial-sub">
                {travelCount.countries === 0
                  ? "one country's worth"
                  : `${travelCount.countries} ${travelCount.countries === 1 ? "country" : "countries"}`}
              </span>
            </>
          ) : (
            <>
              <span className="cab-count font-mono" aria-hidden>0</span>
              <span className="cab-dial-word">No places yet</span>
              <span className="cab-dial-sub">save one and the count starts</span>
            </>
          )}
        </button>
      </div>

      <p key={src ?? "base"} className="ground-line mt-3 text-[11px] leading-snug text-muted-foreground">
        {src
          ? PROVENANCE[src]
          : "Figured on this device from the date and the fix — no feed, so these hold with no signal. Tap a dial for where its reading comes from."}
      </p>
    </section>
  );
}
