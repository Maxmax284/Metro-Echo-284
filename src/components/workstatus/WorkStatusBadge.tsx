import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { humanizeWorkState, type WorkState } from "@/lib/workStatus";

const TONE: Record<WorkState, string> = {
  queued: "bg-muted text-muted-foreground border-border/60",
  working: "bg-primary/10 text-primary border-primary/30",
  waiting_for_user: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  complete: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  canceled: "bg-muted text-muted-foreground border-border/60",
};

export function WorkStatusBadge({ state, className }: { state: WorkState; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium border", TONE[state], className)}
    >
      {humanizeWorkState(state)}
    </Badge>
  );
}
