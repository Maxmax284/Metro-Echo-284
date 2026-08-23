// AmbientBackdrop — one fixed layer behind the whole app.
//
// Every skin is the same five layers with different weights, so there is one
// ambient system rather than five backgrounds. Layers are decorative and inert:
// pointer-events none, aria-hidden, no data, no interaction.
import { useEffect, useRef, useState } from "react";
import { THROW_EVENT } from "@/lib/skins";

export function AmbientBackdrop() {
  const [throwKey, setThrowKey] = useState(0);
  const [sweepKey, setSweepKey] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Nav press throws a light line across the world from the tapped point.
  useEffect(() => {
    const onThrow = (e: Event) => {
      const detail = (e as CustomEvent<{ x: number; y: number }>).detail;
      const el = rootRef.current;
      if (el && detail) {
        el.style.setProperty("--bd-throw-x", `${detail.x}px`);
        el.style.setProperty("--bd-throw-y", `${detail.y}px`);
      }
      setThrowKey((n) => n + 1);
    };
    window.addEventListener(THROW_EVENT, onThrow);
    return () => window.removeEventListener(THROW_EVENT, onThrow);
  }, []);

  // Room change: one scan pass across the background, then gone.
  useEffect(() => {
    const observer = new MutationObserver(() => setSweepKey((n) => n + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-room"] });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="vanta-backdrop" aria-hidden>
      <div className="vanta-bd-wash" />
      <div className="vanta-bd-grid" />
      <div className="vanta-bd-streaks" />
      <div className="vanta-bd-traces" />
      <div className="vanta-bd-sheen" />
      <div className="vanta-bd-grain" />
      {sweepKey > 0 && <div key={`scan-${sweepKey}`} className="vanta-bd-scan" />}
      {throwKey > 0 && <div key={`throw-${throwKey}`} className="vanta-bd-throw" />}
    </div>
  );
}
