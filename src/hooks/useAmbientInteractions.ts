// useAmbientInteractions — the platform reacts to being touched.
//
// Behaviours:
//   1. Tap pulse   — a square-cut pulse at the touch point on real controls.
//   2. Spray burst — submit / primary controls get a short aerosol mist instead.
//   3. Depth       — the world blurs 1px behind an open sheet or dialog.
//   4. Light       — the light on the wall leans toward the pointer / tilt.
//                    The wall itself never moves; only the light does.
//   5. Stamp sound — a receipt that genuinely lands (.motion-stamp) thuds once.
//
// Nothing here reads or writes app data. Reduced motion is handled in CSS and
// by skipping the visual work below. Sound is its own opt-in.
import { useEffect } from "react";
import { play } from "@/lib/streetSound";
import { playHaptic } from "@/lib/haptics";

const PULSE_MS = 320;
const SPRAY_MS = 520;

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

function spray(x: number, y: number) {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const dot = document.createElement("span");
    dot.className = "vanta-spray";
    const ang = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * 26;
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    dot.style.setProperty("--sx", `${Math.cos(ang) * dist}px`);
    dot.style.setProperty("--sy", `${Math.sin(ang) * dist}px`);
    dot.style.setProperty("--ss", `${2 + Math.random() * 3}px`);
    document.body.appendChild(dot);
    window.setTimeout(() => dot.remove(), SPRAY_MS);
  }
}

export function useAmbientInteractions() {
  useEffect(() => {
    const root = document.documentElement;
    const quiet = reducedMotion();

    /* ---- 1 + 2: tap pulse / spray ---- */
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const control = target.closest(
        'button, a, [role="button"], [role="tab"], [role="menuitem"], .vanta-card',
      ) as HTMLElement | null;
      if (!control) return;
      const isSpray =
        control.matches('button[type="submit"], [data-spray]') ||
        control.getAttribute("aria-label")?.toLowerCase().startsWith("capture") === true;

      if (isSpray) {
        play("spray");
        playHaptic("note");
      } else if (control.matches('[role="tab"]')) {
        play("snap");
      } else {
        play("tick");
      }
      if (quiet) return;

      if (isSpray) {
        spray(e.clientX, e.clientY);
        return;
      }
      const pulse = document.createElement("span");
      pulse.className = "vanta-pulse";
      pulse.style.left = `${e.clientX}px`;
      pulse.style.top = `${e.clientY}px`;
      document.body.appendChild(pulse);
      window.setTimeout(() => pulse.remove(), PULSE_MS);
    };

    /* ---- 3: depth of field behind overlays ---- */
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

    /* ---- 4: light leans with the pointer / device tilt ----
       Writes two variables at most once per frame; CSS eases them slowly so
       it reads as light drifting, never as the page moving. */
    let raf = 0;
    let lx = 0.5;
    let ly = 0.3;
    const push = () => {
      raf = 0;
      root.style.setProperty("--light-x", `${(lx * 100).toFixed(1)}%`);
      root.style.setProperty("--light-y", `${(ly * 100).toFixed(1)}%`);
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(push);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      lx = e.clientX / window.innerWidth;
      ly = e.clientY / window.innerHeight;
      queue();
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      lx = Math.min(1, Math.max(0, 0.5 + e.gamma / 60));
      ly = Math.min(1, Math.max(0, 0.3 + (e.beta - 45) / 90));
      queue();
    };
    if (!quiet) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("deviceorientation", onTilt, { passive: true });
    }

    /* ---- 5: a receipt landing thuds once ---- */
    const stampObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of Array.from(m.addedNodes)) {
          if (n instanceof HTMLElement && (n.matches(".motion-stamp, .arrival-stamp") || n.querySelector(".motion-stamp, .arrival-stamp"))) {
            play("stamp");
            return;
          }
        }
      }
    });
    stampObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
      if (raf) cancelAnimationFrame(raf);
      overlayObserver.disconnect();
      stampObserver.disconnect();
      root.removeAttribute("data-overlay");
    };
  }, []);
}
