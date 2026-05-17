import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useCurrentContext } from "@/providers/CurrentContextProvider";
import { useMode } from "@/hooks/useMode";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSystemControls } from "@/hooks/useSystemControls";
import { useSherlock } from "@/components/sherlock/SherlockContext";
import { COMPANION_TOOLS, getToolAvailability } from "@/lib/companionTools";

type Props = {
  /** Called with a prompt string for prompt-style tools. */
  onPick: (prompt: string) => void;
  /** Optional: handler for direct-action tools that need parent UI (e.g. open research panel). */
  onAction?: (actionId: "open-research") => void;
  className?: string;
};

export function CompanionTools({ onPick, onAction, className }: Props) {
  const { place } = useAwareness();
  const { context } = useCurrentContext();
  const { mode } = useMode();
  const isOwner = useIsOwner();
  const { controls } = useSystemControls();
  const { openSherlock } = useSherlock();

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex flex-wrap gap-1.5 border-b border-border/40 px-3 py-2", className)}>
        {COMPANION_TOOLS.map((t) => {
          const avail = getToolAvailability(t, {
            surface: context.surface,
            mode,
            isOwner,
            controls,
          });
          const Icon = t.icon;
          const disabled = !avail.available;

          const handleClick = () => {
            if (disabled) return;
            if (t.directAction === "open-sherlock") {
              openSherlock({
                entity_type: "freeform",
                title: `From ${context.surface}`,
                text: place?.label ? `Current place: ${place.label}` : undefined,
              });
              return;
            }
            if (t.directAction === "open-research") {
              onAction?.("open-research");
              return;
            }
            if (t.buildPrompt) {
              onPick(t.buildPrompt({ surface: context.surface, placeLabel: place?.label }));
            }
          };

          const btn = (
            <button
              key={t.id}
              type="button"
              onClick={handleClick}
              disabled={disabled}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] transition-colors",
                disabled
                  ? "cursor-not-allowed border-border/40 bg-surface-elevated/30 text-muted-foreground/60"
                  : "border-border/60 bg-surface-elevated/60 text-foreground/85 hover:bg-surface-elevated hover:text-foreground"
              )}
              aria-label={t.label}
            >
              <Icon className={cn("h-3 w-3", disabled ? "text-muted-foreground/50" : "text-primary/80")} />
              {t.label}
            </button>
          );

          return (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-[11px]">
                {disabled ? (avail as { reason: string }).reason : t.description}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
