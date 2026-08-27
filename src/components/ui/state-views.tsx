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
import { MOTION_SCAN } from "@/lib/motion";
import { FIX_ROUTE, readError } from "@/lib/errorCopy";

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
 *   flow  — the real path something travels to land here, drawn as a hairline
 *           diagram. Empty screens are the most-seen screens on a fresh scope,
 *           so this is where the "custom rig" read is earned.
 */
export function EmptyState({
  title,
  hint,
  icon,
  flow,
  actionLabel,
  onAction,
  className,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  /** e.g. ["Telegram", "Email", "Voice"] → "Inbox". Rendered in mono. */
  flow?: string[];
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        /* One slow scanline pass: an empty surface should read as watched,
           not as broken. Removed entirely under reduced motion. */
        `vanta-card vanta-grain ${MOTION_SCAN} flex flex-col items-center px-4 py-7 text-center`,
        className,
      )}
    >

      {icon ? <div className="mb-2 text-muted-foreground">{icon}</div> : null}
      <div className="vanta-machine-label text-foreground/70">{title}</div>
      {hint ? (
        <p className="mt-2 max-w-[36ch] text-[11.5px] leading-relaxed text-muted-foreground">{hint}</p>
      ) : null}
      {flow && flow.length > 0 ? <FlowDiagram steps={flow} /> : null}
      {actionLabel && onAction ? (
        <Button size="sm" variant="outline" className="mt-4 h-9 text-[11.5px]" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Hairline path showing where records come from. Mono nodes, 1px connectors. */
function FlowDiagram({ steps }: { steps: string[] }) {
  return (
    <div aria-hidden className="mt-4 flex w-full max-w-[30ch] items-center justify-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s} className="flex min-w-0 items-center gap-1.5">
          {i > 0 ? <span className="h-px w-3 shrink-0 bg-border" /> : null}
          <span className="vanta-machine truncate rounded-[2px] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground ring-1 ring-border/70">
            {s}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Plain-English failure with an optional retry. Never shows a stack trace. */
/**
 * ErrorState — says what broke, whether the user has to act, and offers one
 * move. Pass `error` (anything thrown) and `doing` and the copy is read from
 * `readError()`, so no surface has to invent its own wording or leak a status
 * code. `detail` still works for hand-written copy.
 */
export function ErrorState({
  title = "That didn't load",
  detail,
  error,
  doing,
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  /** The raw failure. When given, the plain-language reading wins. */
  error?: unknown;
  /** Short gerund phrase: "reading recent activity". */
  doing?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const reading = error !== undefined ? readError(error, { doing }) : null;
  const body = reading?.what ?? detail;
  const fixRoute = reading ? FIX_ROUTE[reading.fix.kind] : null;
  const retryLabel = reading?.fix.kind === "retry" ? reading.fix.label ?? "Try again" : "Try again";

  return (
    <div
      className={cn("vanta-card px-4 py-4 ring-1 ring-danger/40", className)}
      role="alert"
    >
      <div className="text-[12.5px] font-medium text-danger">{title}</div>
      {body ? (
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{body}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onRetry ? (
          <Button size="sm" variant="outline" className="h-9 text-[11.5px]" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
        {/* One fix, named. Never a status code. */}
        {reading && fixRoute && reading.fix.label ? (
          <Button asChild size="sm" variant="ghost" className="h-9 text-[11.5px]">
            <a href={fixRoute}>{reading.fix.label}</a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
