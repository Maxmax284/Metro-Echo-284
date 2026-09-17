// AskEnvironmentEdge — where you are, the clock there, what is next. At most.
//
// When none of the three is known, this renders nothing at all. A contested
// place shows both readings instead of picking one.
import { cn } from "@/lib/utils";
import { MachineLabel } from "@/components/ui/instrument";
import { useEnvironmentEdge } from "@/hooks/useEnvironmentEdge";

export function AskEnvironmentEdge({ className }: { className?: string }) {
  const { edge } = useEnvironmentEdge();
  if (edge.empty) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/40 bg-surface-elevated/15 px-3 py-1.5 text-[11px]",
        className,
      )}
      aria-label="Where you are and what is next"
    >
      {edge.where && <MachineLabel className="shrink-0 text-foreground/70">{edge.where}</MachineLabel>}
      {edge.clock && (
        <>
          {edge.where && <span className="text-muted-foreground/50">·</span>}
          <span className="shrink-0 text-muted-foreground">{edge.clock}</span>
        </>
      )}
      {edge.next && (
        <>
          {(edge.where || edge.clock) && <span className="text-muted-foreground/40">|</span>}
          <span className="min-w-0 truncate text-foreground/85">{edge.next}</span>
        </>
      )}
      {edge.conflict && (
        <span className="w-full text-[11px] leading-snug text-warning">{edge.conflict}</span>
      )}
    </div>
  );
}
