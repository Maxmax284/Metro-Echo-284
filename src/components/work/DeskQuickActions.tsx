// DeskQuickActions — the "do this" strip under a desk tile.
//
// Doctrine: every label is verb-first and every tap only opens the desk. No
// approval, no execution, no writes. When a countable desk is empty the strip
// collapses to the reason it is empty plus the one tap that would fill it.
import { ArrowRight } from "lucide-react";
import { DESK_ROLES, type DeskKey } from "@/lib/deskRoles";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

export function DeskQuickActions({
  deskKey,
  count,
  onOpen,
  className,
}: {
  deskKey: DeskKey;
  /** Only passed for countable desks. */
  count?: number;
  onOpen: () => void;
  className?: string;
}) {
  const role = DESK_ROLES[deskKey];
  const isEmpty = typeof count === "number" && count === 0;

  /* An empty desk gets one honest tap, not a menu of dead ends. */
  const labels = isEmpty
    ? [role.emptyAction]
    : role.actions.map((a) =>
        typeof count === "number" && count > 0 && a.startsWith("Review")
          ? `Review ${count} waiting`
          : a,
      );

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {labels.map((label) => (
        <button
          key={label}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className={cn(
            "inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60",
            "bg-surface-elevated/40 px-2 py-1 text-[10.5px] text-foreground/85",
            "hover:border-primary/40 hover:text-foreground",
            MOTION_FOCUS,
          )}
        >
          {label}
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
