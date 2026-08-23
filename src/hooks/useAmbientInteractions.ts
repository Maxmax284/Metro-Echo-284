// useAmbientInteractions — the platform reacts to being touched.
//
// Four global behaviours, all presentation-only, all one-shot or reversible:
//   1. Tap pulse   — a square-cut pulse at the touch point on real controls.
//   2. Long press  — the background grid brightens under a held finger.
//   3. Parallax    — the backdrop drifts against scroll, never with it.
//   4. Idle / depth — the world dims after a minute, and blurs 1px behind an
//                     open sheet or dialog so focus is unambiguous.
//
// Nothing here reads or writes app data. Reduced motion is handled in CSS.
import { useEffect } from "react";

const IDLE_MS = 60_000;
const LONG_PRESS_MS = 350;
const PULSE_MS = 320;

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function useAmbientInteractions() {
  useEffect(() => {
    const root = document.documentElement;
    const quiet = reducedMotion();

    /* ---- 1 + 2: tap pulse and long press ---- */
    let pressTimer: number | undefined;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const control = target.closest(
        'button, a, [role="button"], [role="tab"], [role="menuitem"], .vanta-card',
      );
      if (!control) return;

      if (!quiet) {
        const pulse = document.createElement("span");
        pulse.className = "vanta-pulse";
        pulse.style.left = `${e.clientX}px`;
        pulse.style.top = `${e.clientY}px`;
        document.body.appendChild(pulse);
        window.setTimeout(() => pulse.remove(), PULSE_MS);
      }

      window.clearTimeout(pressTimer);
      pressTimer = window.setTimeout(() => {
        root.setAttribute("data-press", "on");
      }, LONG_PRESS_MS);
    };

    const endPress = () => {
      window.clearTimeout(pressTimer);
      root.removeAttribute("data-press");
    };

    /* ---- 3: parallax against scroll ---- */
    let raf = 0;
    const onScroll = (e: Event) => {
      if (quiet || raf) return;
      const el = e.target as HTMLElement | Document;
      const top =
        el instanceof HTMLElement ? el.scrollTop : (window.scrollY || 0);
      raf = requestAnimationFrame(() => {
        raf = 0;
        // Deliberately shallow: a few pixels of counter-drift, capped, so long
        // feeds never turn the background into a moving distraction.
        const offset = Math.min(24, Math.max(0, top * 0.04));
        root.style.setProperty("--bd-scroll", `${offset.toFixed(2)}px`);
      });
    };

    /* ---- 4a: idle dim ---- */
    let idleTimer: number | undefined;
    const wake = () => {
      root.removeAttribute("data-idle");
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => root.setAttribute("data-idle", "on"), IDLE_MS);
    };

    /* ---- 4b: depth of field behind overlays ----
       Radix locks body scroll while a dialog/sheet is open, which is the one
       honest signal that something is layered above the room. */
    const syncOverlay = () => {
      const locked =
        document.body.hasAttribute("data-scroll-locked") ||
        document.body.style.pointerEvents === "none";
      if (locked) root.setAttribute("data-overlay", "on");
      else root.removeAttribute("data-overlay");
    };
    const overlayObserver = new MutationObserver(syncOverlay);
    overlayObserver.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked", "style"] });
    syncOverlay();

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", endPress, true);
    document.addEventListener("pointercancel", endPress, true);
    document.addEventListener("scroll", onScroll, true);
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) =>
      document.addEventListener(ev, wake, { passive: true }),
    );
    wake();

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", endPress, true);
      document.removeEventListener("pointercancel", endPress, true);
      document.removeEventListener("scroll", onScroll, true);
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) =>
        document.removeEventListener(ev, wake),
      );
      overlayObserver.disconnect();
      window.clearTimeout(pressTimer);
      window.clearTimeout(idleTimer);
      if (raf) cancelAnimationFrame(raf);
      root.removeAttribute("data-press");
      root.removeAttribute("data-idle");
      root.removeAttribute("data-overlay");
    };
  }, []);
}
