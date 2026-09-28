// SprayReveal — the door gets tagged, once per device.
//
// The OS shows the static chrome M before JavaScript wakes; the first time
// this device reaches the logged-out door, the tag gets sprayed on for real:
// two shakes of the can, a base pass, a chrome pass, one drip, gone. Every
// motion is CSS on a single timeline (see index.css "Spray reveal"); this
// component only fires the street sounds on the same beats and gets out of
// the way. Any tap skips to the finished tag. Reduced motion never mounts
// this (the ceremony gate hands the door a static mark instead), and sound
// follows the device switch — a first-ever visit is usually silent because
// the browser hasn't seen a gesture yet; the visuals carry it.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { play } from "@/lib/streetSound";

export function SprayReveal({ onDone }: { onDone: () => void }) {
  const timers = useRef<number[]>([]);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    play("snap", { gain: 0.5 });
    timers.current.push(window.setTimeout(() => play("snap", { gain: 0.4 }), 220));
    timers.current.push(window.setTimeout(() => play("spray", { gain: 0.8 }), 500));
    timers.current.push(window.setTimeout(() => play("spray", { gain: 0.7 }), 1700));
    timers.current.push(window.setTimeout(() => play("tick", { gain: 0.35 }), 2620));
    timers.current.push(window.setTimeout(() => setLeaving(true), 3050));
    timers.current.push(window.setTimeout(onDone, 3350));
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, [onDone]);

  const skip = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setLeaving(true);
    timers.current.push(window.setTimeout(onDone, 220));
  };

  return (
    <div
      className={cn("spray-overlay", leaving && "spray-overlay-out")}
      role="status"
      aria-label="Metro Echo. Tap to skip."
      onClick={skip}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
      }}
      tabIndex={-1}
    >
      <div className="spray-stage">
        <div className="spray-emblem" aria-hidden>
          <img src="/icon-512.png" alt="" className="spray-emblem-img" draggable={false} />
          <span className="spray-drip" />
        </div>
        <div className="spray-can-run" aria-hidden>
          <div className="spray-can-rattle">
            <span className="spray-mist" />
            <svg className="spray-can" viewBox="0 0 48 80" fill="none" aria-hidden>
              <rect x="14" y="2" width="20" height="8" rx="2" fill="#3a4149" />
              <rect x="20" y="0" width="8" height="4" rx="1" fill="#565f6a" />
              <path d="M12 12h24v52a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8V12Z" fill="#20262d" />
              <path d="M12 12h24v10H12z" fill="#7ef0e2" opacity="0.9" />
              <path d="M12 30h24v18H12z" fill="#12161b" />
              <path d="M16 34h16v3H16zm0 6h10v2H16z" fill="#7ef0e2" opacity="0.55" />
              <path d="M12 12h24v4H12z" fill="#e8f4f2" opacity="0.85" />
            </svg>
          </div>
        </div>
        <p className="spray-skip">tap to skip</p>
      </div>
    </div>
  );
}
