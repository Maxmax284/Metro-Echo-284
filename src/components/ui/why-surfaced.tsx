// WhySurfaced — the one reveal, everywhere.
//
// Any item Vanta put in front of you unasked uses this. Same seven answers,
// same order, same words as the chat and watch versions. It renders recorded
// facts only, so a thin reveal reads as thin instead of being padded out.
import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { hasReveal, whyLines, type WhySurfaced as Why } from "@/lib/whySurfaced";
import { MOTION_FOCUS, MOTION_MICRO } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function WhySurfacedBody({ why, className }: { why: Why; className?: string }) {
  const lines = whyLines(why);
  return (
    <dl className={cn("space-y-1", className)}>
      {lines.map((l) => (
        <div key={l.key} className="flex flex-wrap gap-x-1.5">
          <dt className="vanta-machine text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">{l.label}</dt>
          <dd className="min-w-0 flex-1 text-[11.5px] leading-snug text-foreground/85">{l.text}</dd>
        </div>
      ))}
    </dl>
  );
}

export function WhySurfaced({
  why,
  className,
  label = "Why this?",
}: {
  why: Why | null | undefined;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!hasReveal(why)) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "inline-flex min-h-[32px] items-center gap-1 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/80 hover:text-foreground",
          MOTION_MICRO,
          MOTION_FOCUS,
        )}
      >
        <HelpCircle className="h-3 w-3" aria-hidden />
        {label}
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="mt-1 border-l border-border/60 pl-2.5">
          <WhySurfacedBody why={why} />
        </div>
      ) : null}
    </div>
  );
}
