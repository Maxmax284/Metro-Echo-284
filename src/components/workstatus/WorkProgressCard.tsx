import { CheckCircle2, AlertCircle, Loader2, HandHelping } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { humanizeActionResult, humanizeWorkStep, type WorkItem } from "@/lib/workStatus";
import { StepTicker } from "./StepTicker";

export function WorkProgressCard({
  item,
  compact = false,
  onDismiss,
  className,
}: {
  item: WorkItem;
  compact?: boolean;
  onDismiss?: () => void;
  className?: string;
}) {
  const stepText =
    item.state === "complete" || item.state === "failed" || item.state === "waiting_for_user"
      ? humanizeActionResult(item)
      : humanizeWorkStep(item.steps[item.currentStep]);

  const Icon =
    item.state === "complete" ? CheckCircle2 :
    item.state === "failed" ? AlertCircle :
    item.state === "waiting_for_user" ? HandHelping :
    Loader2;

  const iconClass =
    item.state === "complete" ? "text-emerald-600" :
    item.state === "failed" ? "text-destructive" :
    item.state === "waiting_for_user" ? "text-amber-600" :
    "text-primary animate-spin";

  const tickerState =
    item.state === "complete" ? "complete" :
    item.state === "failed" ? "failed" :
    item.state === "waiting_for_user" ? "waiting" :
    "working";

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-background p-3 vanta-card-enter",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-medium leading-tight truncate">{item.title}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground leading-snug">
            {stepText}
          </div>
          {!compact && item.steps.length > 1 && item.state === "working" && (
            <div className="mt-2 flex items-center gap-2">
              <StepTicker total={item.steps.length} current={item.currentStep} state={tickerState} />
              <span className="text-[10.5px] text-muted-foreground">
                Step {Math.min(item.currentStep + 1, item.steps.length)} of {item.steps.length}
              </span>
            </div>
          )}
          {(item.primaryAction || onDismiss) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.primaryAction && (
                <Button
                  size="sm"
                  variant={item.state === "failed" ? "outline" : "default"}
                  className="h-7 px-2 text-[11.5px]"
                  onClick={() => void item.primaryAction!.onClick()}
                >
                  {item.primaryAction.label}
                </Button>
              )}
              {onDismiss && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11.5px] text-muted-foreground"
                  onClick={onDismiss}
                >
                  Dismiss
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
