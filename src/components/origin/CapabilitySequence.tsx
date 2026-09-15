// CapabilitySequence — See → Understand → Prepare → Act → Watch → Report.
// A progression, not a feature grid. Act stops at the approval gate on purpose.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, useReveal } from "./useReveal";

const STEPS = [
  { k: "See", d: "A message, a file, a calendar change, a photo of a receipt." },
  { k: "Understand", d: "It joins what Echo already knows instead of starting a new pile." },
  { k: "Prepare", d: "A draft, a reply, an entry, a plan — staged, not fired." },
  { k: "Act", d: "Only after you approve it. That gate never moves.", gate: true },
  { k: "Watch", d: "It keeps the thread while you sleep, train, fly." },
  { k: "Report", d: "A receipt lands: what happened, when, and why." },
];

export function CapabilitySequence() {
  const { ref, shown } = useReveal(0.3);
  const [n, setN] = useState(prefersReducedMotion() ? STEPS.length : 0);

  useEffect(() => {
    if (!shown || prefersReducedMotion()) return;
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= STEPS.length) window.clearInterval(t);
    }, 420);
    return () => window.clearInterval(t);
  }, [shown]);

  return (
    <ol ref={ref} className="space-y-2">
      {STEPS.map((s, i) => (
        <li
          key={s.k}
          className={cn(
            "flex gap-3 rounded-lg border border-border/60 bg-card/70 p-3 transition-all duration-500",
            i < n ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0",
          )}
        >
          <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-primary">{i + 1}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {s.k}
              {s.gate && (
                <span className="ml-2 rounded-full border border-warn/50 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-warn">
                  needs your approval
                </span>
              )}
            </p>
            <p className="text-[13px] text-muted-foreground">{s.d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
