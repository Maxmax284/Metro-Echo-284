import { ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * CollapsibleSection — calm, consistent accordion for Cockpit/Inbox sections.
 *
 * Shows a header with title, optional count chip, and a short summary phrase
 * so the user can decide whether to expand without opening every drawer.
 *
 * Motion: 240ms ease-out, honors `prefers-reduced-motion` automatically
 * because we only animate `grid-template-rows` + opacity (no transforms).
 */
export interface CollapsibleSectionProps {
  title: ReactNode;
  count?: number | null;
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** Force-control open state (otherwise internal). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Subtle attention glow (e.g. "Needs you" > 0). One-time, no loop. */
  attention?: boolean;
  /** Drop the outer card chrome — use when children already render their own cards. */
  bare?: boolean;
  className?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  count,
  summary,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  attention,
  bare,
  className,
  children,
}: CollapsibleSectionProps) {
  const [internal, setInternal] = useState(defaultOpen);
  const open = controlled ?? internal;
  const toggle = () => {
    const next = !open;
    if (controlled === undefined) setInternal(next);
    onOpenChange?.(next);
  };

  // One-time pulse on the count chip when the number ticks up.
  const prevCount = useRef<number | null>(typeof count === "number" ? count : null);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (typeof count !== "number") return;
    if (prevCount.current !== null && count > prevCount.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      prevCount.current = count;
      return () => clearTimeout(t);
    }
    prevCount.current = count;
  }, [count]);

  return (
    <section
      className={cn(
        !bare && "rounded-2xl border border-border/60 bg-surface-elevated/60",
        attention && "ring-1 ring-primary/30 shadow-glow",
        className,
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 text-left min-h-[44px]",
          bare ? "px-1 py-2" : "px-4 py-3",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{title}</span>
            {typeof count === "number" && count > 0 && (
              <span
                className={cn(
                  "rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
                  pulse && "motion-count-pulse bg-primary/15 text-primary",
                )}
              >
                {count}
              </span>
            )}
          </div>
          {summary && (
            <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
              {summary}
            </div>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className={cn(bare ? "pt-2" : "border-t border-border/50 px-4 py-3")}>{children}</div>
        </div>
      </div>
    </section>
  );
}
