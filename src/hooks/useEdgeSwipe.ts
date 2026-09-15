// useEdgeSwipe — pull in from the left edge to reach the thread list.
//
// The decision itself lives in threadShelf.edgeSwipeOpens; this only watches
// touches. Ordinary scrolling and vertical drags never trigger it.
import { useEffect, useRef } from "react";
import { edgeSwipeOpens } from "@/lib/threadShelf";

export function useEdgeSwipe(onOpen: () => void, enabled = true) {
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    };
    const up = (e: TouchEvent) => {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      if (edgeSwipeOpens({ startX: s.x, dx: t.clientX - s.x, dy: t.clientY - s.y })) onOpen();
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchend", up, { passive: true });
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchend", up);
    };
  }, [onOpen, enabled]);
}
