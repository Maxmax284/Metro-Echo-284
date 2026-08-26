// PostureGlyph — Vanta's face in the chrome.
//
// One element, many moods. It always breathes (the app is awake), it leans
// toward the room you're in, it contracts once when something executes, and it
// dims itself during quiet hours. Never a mascot, never a face — just a mark
// that behaves like something paying attention.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { OperationalState } from "@/lib/operationalState";
import { feelMs } from "@/lib/motion";

/** Fire once when a real state change deserves a tell (execute, capture land). */
export function pulseGlyph(kind: "commit" | "notice" = "commit") {
  try {
    window.dispatchEvent(new CustomEvent("vanta:glyph-pulse", { detail: { kind } }));
  } catch {
    /* noop */
  }
}

/** Quiet hours: 22:00–06:00 local. The glyph rests, it does not sleep. */
function isQuietHour(d = new Date()) {
  const h = d.getHours();
  return h >= 22 || h < 6;
}

/** Where the eye leans, per room. Purely visual — no data reads here. */
const lean: Record<string, string> = {
  today: "translateX(0px)",
  work: "translateX(1.5px)",
  ask: "translateX(-1.5px)",
  receipts: "translateY(1.5px)",
};

export function PostureGlyph({
  state,
  room,
  className,
}: {
  state: OperationalState;
  /** Active room id — the glyph leans toward it. */
  room?: string;
  className?: string;
}) {
  const [pulse, setPulse] = useState<null | "commit" | "notice">(null);
  const [quiet, setQuiet] = useState(() => isQuietHour());
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onPulse = (e: Event) => {
      const kind = (e as CustomEvent).detail?.kind === "notice" ? "notice" : "commit";
      setPulse(kind);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPulse(null), feelMs(520, { min: 120 }));
    };
    window.addEventListener("vanta:glyph-pulse", onPulse);
    return () => {
      window.removeEventListener("vanta:glyph-pulse", onPulse);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  // Re-check quiet hours every five minutes. Cheap, and the room should get
  // calmer on its own without a reload.
  useEffect(() => {
    const id = window.setInterval(() => setQuiet(isQuietHour()), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  // Anything mid-flight reads as focus: the iris tightens and holds.
  const working = state === "executing" || state === "planning" || state === "capturing";

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-3.5 w-3.5 items-center justify-center",
        "transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
        className,
      )}
      style={{ transform: lean[room ?? "today"] ?? "none" }}
    >
      {/* Outer ring — the body. Breathes unless reduced motion. */}
      <span
        className={cn(
          "absolute inset-0 rounded-full border",
          working ? "border-primary/70" : "border-primary/40",
          quiet ? "opacity-55" : "opacity-100",
          "vanta-glyph-breath motion-reduce:animate-none",
          "transition-[opacity,border-color] duration-[var(--motion-slow)] ease-[var(--ease-out)]",
        )}
      />
      {/* Iris — tightens under load, contracts hard on commit. */}
      <span
        className={cn(
          "block rounded-full bg-primary",
          "transition-[width,height,background-color] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
          working ? "h-[3px] w-[3px]" : "h-[5px] w-[5px]",
          pulse === "notice" && "bg-accent",
          quiet && "opacity-70",
        )}
      />
      {/* Event ring — one expanding hairline when something actually happened. */}
      {pulse && (
        <span
          key={pulse}
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full border",
            pulse === "notice" ? "border-accent/70" : "border-primary/70",
            "vanta-glyph-ping motion-reduce:animate-none",
          )}
        />
      )}
    </span>
  );
}
