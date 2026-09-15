// ChaosField — the opening. Fragments of a real day drift on their own tracks,
// then settle into a straight column and compress into one sentence. Scroll
// drives the settling, so the reader causes the calm.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "./useReveal";

type Fragment = { text: string; kind: string; x: number; y: number; d: number };

const FRAGMENTS: Fragment[] = [
  { text: "ADHD appointment moved to 4:00", kind: "Calendar", x: 6, y: 4, d: 0 },
  { text: "Clinic: new address, 2nd floor", kind: "Mail", x: 54, y: 14, d: 0.6 },
  { text: "lease-thailand-final.pdf", kind: "Drive", x: 12, y: 30, d: 1.1 },
  { text: "Nikki: can you look at this today?", kind: "Message", x: 50, y: 42, d: 0.3 },
  { text: "BKK → JFK, gate change", kind: "Travel", x: 4, y: 56, d: 0.9 },
  { text: "You're 7 hours ahead of them", kind: "Time", x: 56, y: 66, d: 1.4 },
  { text: "Slept 5h 20m · trained hard", kind: "Body", x: 18, y: 78, d: 0.5 },
  { text: "Payment retry failed", kind: "Work", x: 52, y: 88, d: 1.7 },
];

export function ChaosField() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [p, setP] = useState(0); // 0 = chaos, 1 = compressed
  const still = prefersReducedMotion();

  useEffect(() => {
    if (still) {
      setP(1);
      return;
    }
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = wrap.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const travel = r.height - window.innerHeight;
        const done = travel > 0 ? Math.min(1, Math.max(0, -r.top / travel)) : 0;
        setP(done);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [still]);

  const settled = p > 0.62;

  return (
    <div ref={wrap} className="relative h-[200vh]">
      <div className="sticky top-0 flex h-dvh flex-col justify-center overflow-hidden px-5">
        {/* wet-pavement wash: art behind content, never moving on its own */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "var(--gradient-hero)", opacity: 0.9 }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "var(--noise)" }} />

        <div className="relative mx-auto w-full max-w-2xl">
          <div className="relative h-[46vh] sm:h-[44vh]">
            {FRAGMENTS.map((f, i) => {
              const restY = 6 + i * 11;
              const x = f.x + (48 - f.x) * p * 0.92;
              const y = f.y + (restY - f.y) * p;
              return (
                <div
                  key={f.text}
                  className={cn(
                    "absolute w-[62%] max-w-[280px] rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5 backdrop-blur-sm sm:w-[54%]",
                    settled && "opacity-40",
                  )}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: `translateY(${still ? 0 : Math.sin((Date.now() / 2600 + f.d) * 0) }px) scale(${1 - p * 0.12})`,
                    transition: still ? "none" : "opacity 500ms var(--ease-out)",
                  }}
                >
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-primary/80">{f.kind}</p>
                  <p className="truncate text-[12px] text-foreground/90">{f.text}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 space-y-3">
            <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Your life does not happen in one app.
            </h1>
            <p
              className="text-[15px] leading-relaxed text-muted-foreground transition-opacity duration-[var(--motion-slow)]"
              style={{ opacity: settled ? 1 : 0.25 }}
            >
              {settled
                ? "Your appointment moved, the new address is in your email, the file you need is ready, and you should leave earlier than planned."
                : "Calendar. Mail. Files. Messages. Travel. Time zones. Your own body. Eight tabs and one head."}
            </p>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70">
              {settled ? "One situation. One sentence." : "Scroll"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
