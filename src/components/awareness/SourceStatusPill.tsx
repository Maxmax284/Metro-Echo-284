import { cn } from "@/lib/utils";
import { computeSourceStatus } from "@/lib/awarenessPlainTalk";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useSystemControls } from "@/hooks/useSystemControls";
import { Radio } from "lucide-react";

const TONE: Record<string, string> = {
  active:        "bg-primary/15 text-primary ring-primary/40",
  cached:        "bg-accent/15 text-accent ring-accent/40",
  on_not_called: "bg-muted/40 text-muted-foreground ring-border/60",
  failed:        "bg-warn/15 text-warn ring-warn/40",
  off:           "bg-muted/30 text-muted-foreground ring-border/60",
};

/**
 * SourceStatusPill — honest one-line view of external search state.
 * Shared by Awareness surface + Command Center mini-radar so both tell
 * the user the same truth.
 */
export function SourceStatusPill({ className }: { className?: string }) {
  const { controls } = useSystemControls();
  const { snapshot } = useAwareness();
  const status = computeSourceStatus({
    enabled: controls?.serpapi_enabled,
    sourcesUsed: snapshot?.sources_used,
    generatedAt: snapshot?.generated_at,
    hasError: !!(snapshot?.full_data && (snapshot.full_data as any)?.errors?.serpapi),
  });
  return (
    <span
      title={status.label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] ring-1",
        TONE[status.kind],
        className,
      )}
    >
      <Radio className="h-2.5 w-2.5" />
      {status.label}
    </span>
  );
}
