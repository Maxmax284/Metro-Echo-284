// AmbientBackdrop — one fixed layer behind the whole app.
//
// Every skin is the same five layers with different weights, so there is one
// ambient system rather than five backgrounds. Layers are decorative and inert:
// pointer-events none, aria-hidden, no data, no interaction.
import { useEffect, useRef, useState } from "react";
import { THROW_EVENT } from "@/lib/skins";
// One painted wall per room, all five now real artwork on the CDN.
// index.css owns every visual consequence — this only hands over the URLs.
import todayWall from "@/assets/wall-today-dawn.jpg.asset.json";
import workWall from "@/assets/wall-work-railyard.jpg.asset.json";
import askWall from "@/assets/wall-ask-alley.jpg.asset.json";
import receiptsWall from "@/assets/wall-receipts-pasteup.jpg.asset.json";
import settingsWall from "@/assets/wall-settings-door.jpg.asset.json";

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
    <div
      ref={rootRef}
      className="vanta-backdrop"
      aria-hidden
      style={
        {
          "--bd-wall-today": `url(${todayWall.url})`,
          "--bd-wall-work": `url(${workWall.url})`,
          "--bd-wall-ask": `url(${askWall.url})`,
          "--bd-wall-receipts": `url(${receiptsWall.url})`,
          "--bd-wall-settings": `url(${settingsWall.url})`,
        } as React.CSSProperties
      }
    >
      <div className="vanta-bd-wash" />
      {/* One painted wall per room — static, edge-weighted, behind everything. */}
      <div className="vanta-bd-wall" />
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
