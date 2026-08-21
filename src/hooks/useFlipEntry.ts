// useFlipEntry — attach to an overlay's content so it grows out of the row the
// user just tapped (see src/lib/flip.ts). Reduced motion is handled inside.
import { useEffect, useRef } from "react";
import { flipFrom } from "@/lib/flip";

export function useFlipEntry<T extends HTMLElement = HTMLDivElement>(open: boolean, durationMs = 300) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    // Wait one frame so the overlay has its final rect before measuring.
    const raf = requestAnimationFrame(() => {
      flipFrom(ref.current, durationMs);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, durationMs]);

  return ref;
}
