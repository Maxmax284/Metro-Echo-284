import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { readRoomSwapPrefs } from "@/lib/motionPrefs";
import { roomOrder } from "@/lib/navigation";

/**
 * Room-to-room crossfade with matched layout.
 *
 * React unmounts the outgoing surface the instant the room key changes, which
 * reads as a snap. Instead of keeping two live surfaces mounted (double
 * fetches, double subscriptions), we take a cheap DOM snapshot of the outgoing
 * surface, park it in an absolutely positioned ghost layer over the same box,
 * and fade that out while the incoming surface lifts in. Scroll offsets are
 * copied onto the ghost's scroller so the two layers line up pixel-for-pixel
 * during the handoff.
 *
 * Everything degrades to an instant swap under prefers-reduced-motion.
 */
export function SurfaceCrossfade({
  surfaceKey,
  children,
  innerRef,
  className,
}: {
  surfaceKey: string;
  children: ReactNode;
  innerRef?: React.MutableRefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const ghostHostRef = useRef<HTMLDivElement | null>(null);
  const prevKey = useRef(surfaceKey);
  const [ghosting, setGhosting] = useState(false);
  const ghostMs = useRef(180);

  useLayoutEffect(() => {
    if (prevKey.current === surfaceKey) return;
    prevKey.current = surfaceKey;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Per-device knob from Settings > Room switching. Off = plain swap.
    const prefs = readRoomSwapPrefs();
    ghostMs.current = Math.round(prefs.durationMs * 0.9) + 40;
    const outgoing = liveRef.current;
    const ghostHost = ghostHostRef.current;
    if (reduced || !prefs.enabled || !outgoing || !ghostHost) return;

    // Snapshot the outgoing surface at its current size and scroll position.
    const rect = outgoing.getBoundingClientRect();
    const clone = outgoing.cloneNode(true) as HTMLElement;
    clone.style.height = `${rect.height}px`;
    clone.style.width = `${rect.width}px`;
    clone.classList.remove("motion-surface-in");
    clone.setAttribute("aria-hidden", "true");
    clone.querySelectorAll("input, textarea, button, a, select").forEach((n) =>
      (n as HTMLElement).setAttribute("tabindex", "-1"),
    );

    const srcScrollers = outgoing.querySelectorAll<HTMLElement>(".overflow-y-auto");
    const cloneScrollers = clone.querySelectorAll<HTMLElement>(".overflow-y-auto");
    srcScrollers.forEach((src, i) => {
      const dest = cloneScrollers[i];
      if (dest) dest.scrollTop = src.scrollTop;
    });

    ghostHost.replaceChildren(clone);
    setGhosting(true);
  }, [surfaceKey]);

  // Retire the ghost once its fade has played out.
  useEffect(() => {
    if (!ghosting) return;
    const t = window.setTimeout(() => {
      ghostHostRef.current?.replaceChildren();
      setGhosting(false);
    }, ghostMs.current);
    return () => window.clearTimeout(t);
  }, [ghosting, surfaceKey]);

  return (
    <div ref={hostRef} className={`relative flex flex-1 min-h-0 flex-col ${className ?? ""}`}>
      <div
        ref={ghostHostRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 overflow-hidden ${
          ghosting ? "motion-surface-out" : "hidden"
        }`}
      />
      <div
        key={surfaceKey}
        ref={(node) => {
          liveRef.current = node;
          if (innerRef) innerRef.current = node;
        }}
        className="motion-surface-in flex flex-1 min-h-0 flex-col"
      >
        {children}
      </div>
    </div>
  );
}
