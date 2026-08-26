// SectionNote — the one-line explanation slot under a section header.
//
// Rule: two facts land, five blur. One short line, plain English, no jargon.
// After a few visits the line collapses to an info affordance so familiar users
// stop reading the same sentence forever.
import { Info } from "lucide-react";
import { useHelperFamiliarity } from "@/hooks/useHelperFamiliarity";
import { MOTION_FOCUS, MOTION_MICRO } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function SectionNote({
  sectionKey,
  children,
  className,
}: {
  /** Stable key. Drives the per-device familiarity count. */
  sectionKey: string;
  children: string;
  className?: string;
}) {
  const { expanded, familiar, reveal, revealed } = useHelperFamiliarity(sectionKey);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={reveal}
        aria-label="What is this section?"
        aria-expanded={false}
        className={cn(
          "mt-1.5 inline-flex min-h-[28px] items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground",
          MOTION_MICRO,
          MOTION_FOCUS,
          className,
        )}
      >
        <Info className="h-3 w-3" aria-hidden />
        <span className="sr-only">What is this section?</span>
      </button>
    );
  }

  return (
    <p
      className={cn("mt-2 text-[12px] leading-snug text-muted-foreground", className)}
      /* Familiar users only see this because they asked for it. */
      aria-live={familiar && revealed ? "polite" : undefined}
    >
      {children}
      {familiar ? (
        <button
          type="button"
          onClick={reveal}
          className={cn("ml-1.5 text-[11px] text-muted-foreground/70 hover:text-foreground", MOTION_MICRO, MOTION_FOCUS)}
        >
          hide
        </button>
      ) : null}
    </p>
  );
}
