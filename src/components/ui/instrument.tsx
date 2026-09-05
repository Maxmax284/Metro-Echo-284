// instrument — the machine-data layer of Echo's visual language.
//
// Doctrine: prose wears Rubik, machine data wears Space Mono. Timestamps, ids,
// counts, status words and sync stamps are instrument readings, so they get the
// mono face, tabular numbers and small-caps tracking. That split is what makes
// the app read as a custom rig rather than a styled dark dashboard.
//
// Nothing here invents data. A sparkline with no activity draws flat, a count
// that did not change does not animate, and a sync stamp shows a real time or
// nothing at all.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { bucketByDay, isFlat, sparklinePath } from "@/lib/sparkline";
import { cn } from "@/lib/utils";
import { MOTION_TICKS_LIVE } from "@/lib/motion";

/** Small-caps mono label. Section names, field names, scope tags. */
export function MachineLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("vanta-machine-label text-muted-foreground", className)}>{children}</span>
  );
}

/** Inline mono reading: a timestamp, an id, a duration, a count. */
export function MachineText({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  /** Native tooltip — used to show the full precise value on hover. */
  title?: string;
}) {
  return (
    <span className={cn("vanta-machine", className)} title={title}>
      {children}
    </span>
  );
}

/**
 * Section rail — a mono label, an optional reading in the gap, and a hairline
 * that runs to the edge. Replaces bold sentence-case headings inside cards.
 */
export function SectionRail({
  label,
  reading,
  icon,
  action,
  className,
}: {
  label: string;
  /** A real number or short status shown in the rail gap. */
  reading?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="vanta-rail min-w-0 flex-1">
        {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
        <MachineLabel className="shrink-0 text-foreground/70">{label}</MachineLabel>
        {reading ? (
          <MachineText className="shrink-0 text-[10px] text-muted-foreground">{reading}</MachineText>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Rolling number — a machine readout that settles.
 *
 * On first paint it counts up from zero (~420ms) so the number reads as a
 * reading being taken rather than a printed label. After that it only moves
 * when the value genuinely changes: same value, nothing moves. Reduced motion
 * gets the final number immediately.
 */
export function RollingNumber({
  value,
  className,
  /** Set false for values where counting up would be misleading. */
  countOnMount = true,
}: {
  value: number;
  className?: string;
  countOnMount?: boolean;
}) {
  const [rolling, setRolling] = useState(false);
  const [shown, setShown] = useState(() =>
    countOnMount && value > 1 && !prefersReducedMotion() ? 0 : value,
  );
  const prev = useRef(value);
  const mounted = useRef(false);

  /* Count-up on mount only. rAF, eased out, no library, no timers left behind. */
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    if (shown === value) return;
    const from = shown;
    const start = performance.now();
    const duration = 420;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setShown(value);
    setRolling(true);
    const t = window.setTimeout(() => setRolling(false), 260);
    return () => window.clearTimeout(t);
  }, [value]);

  return (
    <span className={cn("inline-block overflow-hidden align-bottom", className)}>
      <span className={cn("vanta-machine inline-block", rolling && "motion-roll")}>{shown}</span>
    </span>
  );
}


/**
 * Activity trace — a 14-day sparkline built from real recorded timestamps.
 * Flat and muted when nothing happened, so it never implies activity.
 */
export function ActivityTrace({
  timestamps,
  days = 14,
  className,
  label = "Activity, last 14 days",
}: {
  timestamps: (string | null | undefined)[];
  days?: number;
  className?: string;
  label?: string;
}) {
  const buckets = bucketByDay(timestamps, days);
  const flat = isFlat(buckets);
  const path = sparklinePath(buckets, 64, 16);
  const total = buckets.reduce((a, b) => a + b, 0);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={label}>
      <svg
        role="img"
        aria-label={flat ? `${label}: nothing recorded` : `${label}: ${total} recorded`}
        viewBox="0 0 64 16"
        width="64"
        height="16"
        className="shrink-0 overflow-visible"
        preserveAspectRatio="none"
      >
        <path
          d={path}
          fill="none"
          strokeWidth="1"
          strokeLinecap="square"
          className={flat ? "stroke-border" : "stroke-primary/80"}
        />
      </svg>
      <MachineText className="text-[10px] text-muted-foreground">
        {flat ? "—" : total}
      </MachineText>
    </span>
  );
}

/**
 * Sync stamp — the real time of the last read, in the user's timezone. This is
 * the "instrumented" tell: the app tells you when it last looked.
 */
export function SyncStamp({
  at,
  timezone,
  className,
}: {
  at: Date | number | null;
  timezone?: string;
  className?: string;
}) {
  if (!at) return null;
  const tz = timezone || "UTC";
  let stamp: string;
  try {
    stamp = formatInTimeZone(new Date(at), tz, "HH:mm zzz");
  } catch {
    stamp = formatInTimeZone(new Date(at), "UTC", "HH:mm 'UTC'");
  }
  return (
    <MachineText className={cn("text-[10px] text-muted-foreground", className)}>
      last read {stamp}
    </MachineText>
  );
}

/**
 * Registration marks — a machined tick row. Structural punctuation between a
 * hero and the feed below it. When `live` is set the marks shift one notch,
 * once, because real new data just landed.
 */
export function TickRow({ className, live = false }: { className?: string; live?: boolean }) {
  return <div aria-hidden className={cn("vanta-ticks w-full", live && MOTION_TICKS_LIVE, className)} />;
}

