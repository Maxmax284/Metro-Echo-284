// AftermathFooter — the shared "Next:" line every major card uses.
//
// Doctrine: this footer NEVER executes. Tapping it opens a draft, a detail
// view, a source trail, or a review screen. Plan → Approve → Execute always
// happens on the destination surface, never from this footer.
import { ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NextMove = {
  /** Short verb-led label. e.g. "Open this capture", "Review in Sherlock" */
  label: string;
  /** Click handler. MUST only navigate / open UI, never execute work. */
  onClick: () => void;
  /** Optional one-line hint shown under the Next line. */
  hint?: string;
};

export function AftermathFooter({
  next,
  more,
  whatHappensIfTap,
  className,
  children,
}: {
  next: NextMove;
  /** Optional secondary moves, hidden behind a tap. Also non-executing. */
  more?: NextMove[];
  /** Tiny "what happens if I tap" hint. Defaults to "Opens — nothing runs." */
  whatHappensIfTap?: string;
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tapHint = whatHappensIfTap ?? "Opens — nothing runs.";
  return (
    <div className={cn("mt-2 border-t border-border/40 pt-2 text-[11.5px]", className)}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={next.onClick}
          className="group inline-flex min-w-0 items-center gap-1.5 text-left text-foreground/85 hover:text-foreground"
        >
          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
            Next
          </span>
          <span className="truncate font-medium">{next.label}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
        {more && more.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            {open ? "Less" : "More"}
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
      </div>
      {next.hint && (
        <p className="mt-0.5 text-[10.5px] text-muted-foreground">{next.hint}</p>
      )}
      {!next.hint && (
        <p className="mt-0.5 text-[10px] italic text-muted-foreground/70">{tapHint}</p>
      )}
      {open && more && more.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {more.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={m.onClick}
              className="rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground hover:border-border"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
