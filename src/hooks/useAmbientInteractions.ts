// useAmbientInteractions — the platform reacts to being touched.
//
// Deliberately small. Two behaviours only:
//   1. Tap pulse   — a square-cut pulse at the touch point on real controls.
//   2. Depth       — the world blurs 1px behind an open sheet or dialog.
//
// The idle dim, the long-press grid brighten, and the scroll parallax were
// removed: three full-screen layers repainting against each other read as
// flicker on mobile, and none of them carried information.
//
// Nothing here reads or writes app data. Reduced motion is handled in CSS.
import { useEffect } from "react";

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

    /* ---- 1: tap pulse ---- */
    const onPointerDown = (e: PointerEvent) => {
      if (quiet) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const control = target.closest(
        'button, a, [role="button"], [role="tab"], [role="menuitem"], .vanta-card',
      );
      if (!control) return;

      const pulse = document.createElement("span");
      pulse.className = "vanta-pulse";
      pulse.style.left = `${e.clientX}px`;
      pulse.style.top = `${e.clientY}px`;
      document.body.appendChild(pulse);
      window.setTimeout(() => pulse.remove(), PULSE_MS);
    };

    /* ---- 2: depth of field behind overlays ----
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
    overlayObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-scroll-locked", "style"],
    });
    syncOverlay();

    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      overlayObserver.disconnect();
      root.removeAttribute("data-overlay");
    };
  }, []);
}
