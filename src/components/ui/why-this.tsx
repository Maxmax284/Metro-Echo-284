// WhyThis — the stored reason, on demand.
//
// Doctrine: Vanta never invents an explanation. This renders the reason the
// system already wrote down when it surfaced the item. No reason recorded means
// no button at all.
import { useState } from "react";
import { MOTION_FOCUS, MOTION_MICRO } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function WhyThis({
  reason,
  className,
  label = "Why am I seeing this?",
}: {
  /** The reason as stored. Null or empty renders nothing. */
  reason: string | null | undefined;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!reason || !reason.trim()) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground",
          MOTION_MICRO,
          MOTION_FOCUS,
        )}
      >
        {open ? "Hide why" : label}
      </button>
      {open ? (
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{reason}</p>
      ) : null}
    </div>
  );
}
