import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ActionButtonProps extends ButtonProps {
  pending?: boolean;
  pendingLabel?: string;
}

/** Button that shows immediate action feedback. Tap → "…ing" + small spinner. */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton({ pending, pendingLabel, children, disabled, className, ...rest }, ref) {
    return (
      <Button
        ref={ref}
        disabled={pending || disabled}
        aria-busy={pending || undefined}
        className={cn("transition-colors", className)}
        {...rest}
      >
        {pending ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {pendingLabel ?? "Working…"}
          </span>
        ) : (
          children
        )}
      </Button>
    );
  },
);
