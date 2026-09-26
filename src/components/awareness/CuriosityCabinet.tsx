// CuriosityCabinet — three dials about the sky over the place you're reading.
//
// Moon, daylight, season. Every one is figured on this device from the date
// and the fix — no feed, no AI, no network — so the cabinet works with no
// signal at all, and says where each reading comes from when you tap a dial.
//
// Doctrine:
//   - No widget pile: one card, three dials, one caption line.
//   - A season read is a generalization and is labelled as one — the usual
//     pattern for a band of the world, never a forecast.
//   - No coordinates, no cabinet claims: the empty state teaches how the
//     dials get their sky.
import { useEffect, useMemo, useState } from "react";
import { Moon, Sun, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";
import {
  clockFromMinutes,
  hoursFromMinutes,
  seasonFor,
  stationRead,
  sunFraction,
  type Hemisphere,
  type SeasonKey,
} from "@/lib/station";

type DialId = "moon" | "light" | "season";

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

export function CuriosityCabinet({
  city,
  lat,
  lon,
  timeZone,
  className,
}: {
  city: string | null;
  lat: number | null;
  lon: number | null;
  timeZone?: string | null;
  className?: string;
}) {
  const [tick, setTick] = useState(0);
  const [src, setSrc] = useState<DialId | null>(null);

  // The sun moves; re-figure every five minutes.
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 5 * 60_000);
    return () => window.clearInterval(t);
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

  const PROVENANCE: Record<DialId, string> = {
    moon: "Lunar math from the date — the same cycle everywhere, good to about a day. The lit side flips below the equator.",
    light: "From the latitude and the day of the year. Times are approximate — terrain and clock rules both argue.",
    season: season.note,
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

      <p key={src ?? "base"} className="ground-line mt-3 text-[11px] leading-snug text-muted-foreground">
        {src
          ? PROVENANCE[src]
          : "Figured on this device from the date and the fix — no feed, so these hold with no signal. Tap a dial for where its reading comes from."}
      </p>
    </section>
  );
}
