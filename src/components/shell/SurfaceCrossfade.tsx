import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { readRoomSwapPrefs } from "@/lib/motionPrefs";
import { roomOrder } from "@/lib/navigation";
import { registerRoomSwap } from "@/lib/roomSwap";

/**
 * Room-to-room handoff.
 *
 * Two things were making this read as a flicker rather than a move, and both had
 * to be fixed:
 *
 * 1. The outgoing room was being photographed in a layout effect, which runs
 *    *after* React has already swapped the DOM — so the photograph was of the
 *    incoming room. Two copies of the same room slid opposite ways while the
 *    graffiti wall flashed through the gap between them.
 *
 * 2. Rendering a room costs real main-thread time. Starting the slide only after
 *    that render means the stall eats the motion and you get a snap.
 *
 * So: the nav announces the destination on press (see lib/roomSwap), we take the
 * photograph and start it sliding on the compositor right then, and React
 * changes rooms a frame later. The photograph holds full opacity through the
 * render stall — no bare frames — and cross-dissolves with the incoming room
 * once that room is actually on screen.
 *
 * The ghost layer is driven imperatively on purpose. Routing it through React
 * state would batch it into the same commit as the expensive room render, which
 * is exactly the stall we are trying to get out in front of.
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
  const keyRef = useRef(surfaceKey);
  /** Ghost that the nav press already put on screen and started sliding. */
  const armed = useRef<{ key: string; clone: HTMLElement; fadeMs: number } | null>(null);
  const clearTimer = useRef<number | null>(null);
  /** Snapshot taken during render when the swap arrived without warning. */
  const pendingFallback = useRef<{ clone: HTMLElement; x: number } | null>(null);

  // Announced swap: photograph and start moving before the room state changes.
  useEffect(
    () =>
      registerRoomSwap((nextKey) => {
        if (nextKey === keyRef.current) return;
        const prefs = readRoomSwapPrefs();
        if (!prefs.enabled || prefersReducedMotion()) return;
        const outgoing = liveRef.current;
        const ghostHost = ghostHostRef.current;
        if (!outgoing || !ghostHost) return;

        const x = travelFor(keyRef.current, nextKey);
        const clone = snapshot(outgoing);
        ghostHost.replaceChildren(clone);
        hostRef.current?.style.setProperty("--swap-x", `${x}px`);

        /* Transform only for now. The photograph stays fully opaque until the
           incoming room has actually painted, otherwise the wall shows through
           while React is still busy building it. */
        clone.animate(
          [
            { transform: "translate3d(0, 0, 0) scale(1)" },
            {
              transform: `translate3d(${-x * 1.1}px, ${-prefs.driftPx * 0.6}px, 0) scale(0.992)`,
            },
          ],
          { duration: prefs.durationMs * 1.35, easing: "cubic-bezier(0.16, 0.9, 0.2, 1)", fill: "forwards" },
        );
        armed.current = { key: nextKey, clone, fadeMs: Math.max(80, prefs.durationMs * 0.54) };
      }),
    [],
  );

  /* Render phase for the new key: React has not touched the DOM yet, so if no
     ghost was armed (a room change from somewhere other than the nav) this is
     the last moment the outgoing room is still reachable.
     Nothing here may clear `armed` — this block can run twice for one commit,
     and throwing away a ghost that is already sliding leaves blank frames. */
  if (keyRef.current !== surfaceKey) {
    const from = keyRef.current;
    keyRef.current = surfaceKey;
    if (armed.current?.key !== surfaceKey) {
      const prefs = readRoomSwapPrefs();
      const outgoing = liveRef.current;
      if (prefs.enabled && !prefersReducedMotion() && outgoing) {
        pendingFallback.current = { clone: snapshot(outgoing), x: travelFor(from, surfaceKey) };
      }
    }
  }

  // The incoming room has landed. Hand over.
  useLayoutEffect(() => {
    const ghostHost = ghostHostRef.current;
    const liveEl = liveRef.current;
    if (!ghostHost) return;
    if (clearTimer.current) window.clearTimeout(clearTimer.current);

    const prefs = readRoomSwapPrefs();
    const fallback = pendingFallback.current;
    pendingFallback.current = null;
    const active = armed.current?.key === surfaceKey ? armed.current : null;
    armed.current = null;

    let clone: HTMLElement;
    let fadeMs: number;
    if (active) {
      // Already sliding from the nav press. Only the dissolve is left.
      clone = active.clone;
      fadeMs = active.fadeMs;
    } else if (fallback) {
      // Room changed from somewhere other than the nav: slide and dissolve here.
      hostRef.current?.style.setProperty("--swap-x", `${fallback.x}px`);
      ghostHost.replaceChildren(fallback.clone);
      clone = fallback.clone;
      fadeMs = Math.max(80, prefs.durationMs * 0.54);
      clone.animate(
        [
          { transform: "translate3d(0, 0, 0) scale(1)" },
          {
            transform: `translate3d(${-fallback.x * 1.1}px, ${-prefs.driftPx * 0.6}px, 0) scale(0.992)`,
          },
        ],
        { duration: prefs.durationMs * 1.35, easing: "cubic-bezier(0.16, 0.9, 0.2, 1)", fill: "forwards" },
      );
    } else {
      ghostHost.replaceChildren();
      return;
    }

    /* Both fades are created here, together, so they share one start time on the
       document timeline. That is the whole point: if the next frame is late
       because the browser is still building the room, both are late by the same
       amount and their opacities still add up to one. Fading each layer on its
       own schedule is what let the wall flash through. */
    const fadeOut = clone.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: fadeMs,
      easing: "linear",
      fill: "forwards",
    });
    liveEl?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: fadeMs,
      easing: "linear",
      fill: "backwards",
    });

    // Retire the photograph when its fade has actually finished, not on a guess.
    let retired = false;
    const retire = () => {
      if (retired) return;
      retired = true;
      if (ghostHostRef.current?.firstElementChild === clone) {
        ghostHostRef.current.replaceChildren();
      } else {
        clone.remove();
      }
    };
    fadeOut.finished.then(retire).catch(() => {});
    // Belt and braces: a cancelled or discarded animation must not leave a ghost.
    clearTimer.current = window.setTimeout(retire, fadeMs + prefs.durationMs * 1.35 + 200);
  }, [surfaceKey]);

  useEffect(
    () => () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    },
    [],
  );

  return (
    <div ref={hostRef} className={`relative flex flex-1 min-h-0 flex-col ${className ?? ""}`}>
      {/* Stable and empty when idle, so React never re-paints over a live ghost. */}
      <div
        ref={ghostHostRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
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

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/**
 * How far the room travels, and from which side.
 *
 * Forward along the line (Today to Work) arrives from the right; stepping back
 * arrives from the left, so the motion agrees with the tab you pressed. 26px
 * reads on a phone and disappears on a monitor, so the distance scales with the
 * glass and the room lands with the same weight on both.
 */
function travelFor(fromKey: string, toKey: string): number {
  const from = roomOrder(fromKey);
  const to = roomOrder(toKey);
  const dir = to === from ? 0 : to > from ? 1 : -1;
  const vw = typeof window === "undefined" ? 384 : window.innerWidth;
  const travel = vw >= 1280 ? 72 : vw >= 768 ? 52 : 26;
  return dir * travel;
}

/** Frozen copy of a surface at its current size and scroll position. */
function snapshot(outgoing: HTMLElement): HTMLElement {
  const rect = outgoing.getBoundingClientRect();
  const clone = outgoing.cloneNode(true) as HTMLElement;
  clone.style.height = `${rect.height}px`;
  clone.style.width = `${rect.width}px`;
  clone.classList.remove("motion-surface-in");
  clone.style.animation = "none";
  clone.style.willChange = "opacity, transform";
  clone.setAttribute("aria-hidden", "true");
  // Nothing inside a photograph should be reachable by keyboard or screen reader.
  clone.querySelectorAll("input, textarea, button, a, select").forEach((n) =>
    (n as HTMLElement).setAttribute("tabindex", "-1"),
  );
  // Duplicate ids would collide with the live room for the length of the slide.
  clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));

  const srcScrollers = outgoing.querySelectorAll<HTMLElement>(".overflow-y-auto");
  const cloneScrollers = clone.querySelectorAll<HTMLElement>(".overflow-y-auto");
  srcScrollers.forEach((src, i) => {
    const dest = cloneScrollers[i];
    if (dest) dest.scrollTop = src.scrollTop;
  });
  return clone;
}
