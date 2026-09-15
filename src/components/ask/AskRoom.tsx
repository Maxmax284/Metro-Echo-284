// AskRoom — the Ask room owns its own height.
//
// The app shell is `min-h-dvh`: it grows with its content, so the whole page
// scrolled and nothing inside Ask ever did. That quietly broke three things —
// the transcript's own scroller was never a scroller, so "Start" and "Newest"
// moved nothing, "Jump to latest" could never appear, and the thread list
// scrolled away the moment a long situation pushed the page down.
//
// So this wrapper measures where the room starts and claims the rest of the
// viewport. From there the room is a fixed frame: the thread list holds still,
// the transcript scrolls inside it, and the floating jump control has a bottom
// edge to sit on. Nothing else in the shell changes.
import { useEffect, useRef, useState, type ReactNode } from "react";

export function AskRoom({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      setTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener("resize", measure);
    const t = window.setTimeout(measure, 250); // after the room's own header settles
    return () => {
      window.removeEventListener("resize", measure);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="flex min-h-0 flex-1 overflow-hidden"
      style={top === null ? undefined : { height: `calc(100dvh - ${top}px)` }}
    >
      {children}
    </div>
  );
}
