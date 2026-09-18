// FlightArc — the great-circle track, drawn so a glance tells you where the
// plane is and what the sky looks like under it.
//
// Doctrine:
//   - Position is never invented. With no honest progress the arc draws dashed
//     and carries no plane, and the caller says so in words.
//   - The day/night wash is derived from the two ends' clocks, nothing else.
//   - Scrubbing is a read: it moves the marker and the readout, never the record.
import { useEffect, useRef, useState } from "react";
import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";

const W = 320;
const H = 74;

/** Quadratic arc from left end to right end, bowed like a great circle. */
const PATH = `M 18 ${H - 14} Q ${W / 2} 2 ${W - 18} ${H - 14}`;

function pointAt(t: number): { x: number; y: number; angle: number } {
  const p0 = { x: 18, y: H - 14 };
  const p1 = { x: W / 2, y: 2 };
  const p2 = { x: W - 18, y: H - 14 };
  const u = 1 - t;
  const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y;
  const dx = 2 * u * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const dy = 2 * u * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
  return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

export function FlightArc({
  from,
  to,
  progress,
  phase,
  /** Instant at a given fraction of the trip, when both ends carried a time. */
  instantAt,
  clock,
}: {
  from: string;
  to: string;
  /** 0..1, or null when there is no honest position. */
  progress: number | null;
  phase: "waiting" | "flying" | "landed" | "stopped" | "unknown";
  instantAt?: (t: number) => string | null;
  clock: (iso: string) => string;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
  const holdRef = useRef<number | null>(null);

  useEffect(() => () => { if (holdRef.current) window.clearTimeout(holdRef.current); }, []);

  const live = progress;
  const shown = scrub ?? live;
  const canScrub = live !== null && instantAt !== undefined;
  const marker = shown === null ? null : pointAt(shown);

  const release = () => {
    /* Spring back to the real moment, so the deck never keeps a fictional time. */
    if (holdRef.current) window.clearTimeout(holdRef.current);
    holdRef.current = window.setTimeout(() => setScrub(null), 220);
  };

  const scrubIso = scrub !== null && instantAt ? instantAt(scrub) : null;

  return (
    <div className="space-y-1">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[74px] w-full"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            {/* Day/night wash: dusk at the origin, morning at the far end. */}
            <linearGradient id="flight-sky" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
              <stop offset="45%" stopColor="hsl(var(--accent))" stopOpacity="0.14" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="flight-flown" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={W} height={H} fill="url(#flight-sky)" />

          {/* Ground grid — the instrument feel, static. */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1={W * g}
              y1="0"
              x2={W * g}
              y2={H}
              stroke="hsl(var(--border))"
              strokeOpacity="0.3"
              strokeWidth="1"
            />
          ))}

          {/* The whole track. Dashed when no position is on record. */}
          <path
            d={PATH}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="1.25"
            strokeDasharray={shown === null ? "3 4" : undefined}
            className={shown === null ? undefined : "flight-arc-draw"}
          />

          {/* Flown portion. */}
          {shown !== null && (
            <path
              d={PATH}
              fill="none"
              stroke="url(#flight-flown)"
              strokeWidth="1.75"
              strokeDasharray="1000"
              strokeDashoffset={1000 - 1000 * Math.max(0.001, shown)}
              style={{ transition: "stroke-dashoffset 1200ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          )}

          {/* Beacons at both ends; the origin pings while the flight waits. */}
          <circle cx="18" cy={H - 14} r="3" fill="hsl(var(--primary))" fillOpacity="0.9" />
          {phase === "waiting" && (
            <circle cx="18" cy={H - 14} r="3" fill="none" stroke="hsl(var(--primary))" className="flight-radar-ping" />
          )}
          <circle
            cx={W - 18}
            cy={H - 14}
            r="3"
            fill={phase === "landed" ? "hsl(var(--primary))" : "none"}
            stroke="hsl(var(--primary))"
            strokeOpacity="0.8"
          />

          {/* Sun/moon marker riding the arc's high point. */}
          {shown !== null && (
            <circle
              cx={pointAt(0.5).x}
              cy={pointAt(0.5).y - 0}
              r="7"
              fill="hsl(var(--accent))"
              fillOpacity="0.16"
            />
          )}
        </svg>

        {marker && (
          <Plane
            className={cn(
              "pointer-events-none absolute h-4 w-4 text-primary",
              phase === "flying" && "flight-plane-hum",
            )}
            style={{
              left: `${(marker.x / W) * 100}%`,
              top: `${(marker.y / H) * 100}%`,
              transform: `translate(-50%, -50%) rotate(${marker.angle}deg)`,
              transition: scrub === null ? "left 900ms cubic-bezier(0.22,1,0.36,1), top 900ms cubic-bezier(0.22,1,0.36,1)" : "none",
            }}
            aria-hidden
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-1 font-mono text-[10.5px] text-foreground/75">
          <span>{from}</span>
          <span>{to}</span>
        </div>
      </div>

      {canScrub && (
        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={1000}
            step={5}
            value={Math.round((shown ?? 0) * 1000)}
            onChange={(e) => setScrub(Number(e.target.value) / 1000)}
            onPointerUp={release}
            onPointerCancel={release}
            onBlur={release}
            onKeyUp={release}
            aria-label="Scrub along the flight to read the time at that point"
            className="h-5 w-full accent-primary"
          />
          <p className="font-mono text-[10.5px] text-muted-foreground">
            {scrubIso
              ? `${Math.round((scrub ?? 0) * 100)}% along · ${clock(scrubIso)}`
              : "Drag to read the time at any point. Let go and it snaps back to now."}
          </p>
        </div>
      )}
    </div>
  );
}
