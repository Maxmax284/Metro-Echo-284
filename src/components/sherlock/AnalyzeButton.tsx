import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSherlock, SherlockScope } from "./SherlockContext";
import { cn } from "@/lib/utils";

export function AnalyzeButton({
  scope,
  className,
  variant = "ghost",
  size = "icon",
}: {
  scope: SherlockScope;
  className?: string;
  variant?: "ghost" | "outline";
  size?: "icon" | "sm";
}) {
  const { openSherlock } = useSherlock();
  return (
    <Button
      variant={variant}
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        openSherlock(scope);
      }}
      className={cn(
        "text-muted-foreground hover:text-primary",
        size === "icon" ? "h-7 w-7" : "h-7 gap-1 px-2 text-[10px]",
        className
      )}
      aria-label="Analyze with Sherlock"
      title="Analyze with Sherlock"
    >
      <Sparkles className={size === "icon" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      {size !== "icon" && <span>Analyze</span>}
    </Button>
  );
}
