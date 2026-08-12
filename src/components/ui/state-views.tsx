// state-views — one vocabulary for loading, empty, and error states.
//
// Why this exists: 65 files hand-rolled a spinner, 2 used skeletons, and every
// surface wrote its own "No X yet" string. That drift is what makes an app feel
// like a collection of features instead of one product.
//
// Doctrine:
//  - Loading uses skeletons, never a bare spinner, so layout does not jump.
//  - Loading announces itself (aria-busy) so screen readers know to wait.
//  - Empty states teach: they say what lands here and how to make it land.
//  - Errors are plain English and always offer a retry when one is possible.
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Skeleton rows sized like list content. Use inside the container it replaces. */
export function LoadingState({
  rows = 3,
  label = "Loading",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="vanta-card p-3">
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Empty state that explains rather than reports.
 *
 *   title — what is not here yet
 *   hint  — how something gets here (this is the part that teaches)
 */
export function EmptyState({
  title,
  hint,
  icon,
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("vanta-card flex flex-col items-center px-4 py-6 text-center", className)}>
      {icon ? <div className="mb-2 text-muted-foreground">{icon}</div> : null}
      <div className="text-[12.5px] font-medium">{title}</div>
      {hint ? (
        <p className="mt-1 max-w-[36ch] text-[11.5px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button size="sm" variant="outline" className="mt-3 h-9 text-[11.5px]" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Plain-English failure with an optional retry. Never shows a stack trace. */
export function ErrorState({
  title = "That didn't load",
  detail,
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("vanta-card px-4 py-4 ring-danger/30", className)}
      role="alert"
    >
      <div className="text-[12.5px] font-medium text-danger">{title}</div>
      {detail ? (
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{detail}</p>
      ) : null}
      {onRetry ? (
        <Button size="sm" variant="outline" className="mt-3 h-9 text-[11.5px]" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
