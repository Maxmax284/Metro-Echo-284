import { cn } from "@/lib/utils";

export function StepTicker({
  total,
  current,
  state = "working",
  className,
}: {
  total: number;
  current: number;
  state?: "working" | "complete" | "failed" | "waiting";
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(current + 1, total)}
    >
      {Array.from({ length: total }).map((_, i) => {
        const done = i < current || state === "complete";
        const active = i === current && state === "working";
        return (
          <span
            key={i}
            className={cn(
              "h-1 w-4 rounded-full transition-colors",
              done && "bg-emerald-500/70",
              active && "bg-primary",
              !done && !active && "bg-border/70",
              state === "failed" && i === current && "bg-destructive",
              state === "waiting" && i === current && "bg-amber-500",
            )}
            style={{ transitionDuration: "var(--motion-base, 220ms)" }}
          />
        );
      })}
    </div>
  );
}
