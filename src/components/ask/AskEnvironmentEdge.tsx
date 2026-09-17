// AskEnvironmentEdge — where you are, the clock there, what is next. At most.
//
// When none of the three is known, this renders nothing at all. A contested
// place shows both readings instead of picking one.
import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { MachineLabel } from "@/components/ui/instrument";
import { useEnvironmentEdge } from "@/hooks/useEnvironmentEdge";
import { Button } from "@/components/ui/button";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { setAskDraft } from "@/lib/askSession";
import { MOTION_FADE, MOTION_FOCUS } from "@/lib/motion";

export function AskEnvironmentEdge({ className }: { className?: string }) {
  const { edge, sources, suggestions } = useEnvironmentEdge();
  const { activeId } = useAskThreads();
  const [open, setOpen] = useState(false);
  if (edge.empty) return null;

  const useSuggestion = (question: string) => {
    setAskDraft(activeId ?? "_none", question);
    setOpen(false);
    document.querySelector<HTMLElement>("[data-ask-composer]")?.focus();
  };

  return (
    <div
      id="ask-environment-edge"
      className={cn(
        "border-b border-border/40 bg-surface-elevated/15 px-3 py-1.5 text-[11px]",
        className,
      )}
      aria-label="Where you are and what is next"
    >
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cn("flex min-h-[32px] w-full flex-wrap items-center gap-x-2 gap-y-1 text-left", MOTION_FOCUS)}>
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_7px_hsl(var(--primary)/0.5)]" />
        {edge.where && <MachineLabel className="shrink-0 text-foreground/70">{edge.where}</MachineLabel>}
        {edge.clock && <><span className="text-muted-foreground/50">·</span><span className="shrink-0 text-muted-foreground">{edge.clock}</span></>}
        {edge.next && <><span className="text-muted-foreground/40">|</span><span className="min-w-0 flex-1 truncate text-foreground/85">{edge.next}</span></>}
        <ChevronDown className={cn("ml-auto h-3 w-3 shrink-0 text-primary transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      {edge.conflict && (
        <span className="w-full text-[11px] leading-snug text-warning">{edge.conflict}</span>
      )}
      {open && (
        <div className={cn("mt-1.5 border-l-2 border-primary/35 py-1 pl-2.5", MOTION_FADE)}>
          <MachineLabel className="text-primary/80">Echo is using</MachineLabel>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            {sources.join(", ")}. {sources.includes("your recorded place") ? "No live device location was requested." : "No location source was used."}
          </p>
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="w-full text-[10.5px] text-muted-foreground">What can I ask here?</span>
              {suggestions.slice(0, 3).map((suggestion) => (
                <Button key={suggestion.id} type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-[11px] text-primary" onClick={() => useSuggestion(suggestion.question)}>
                  <Search className="h-3 w-3" />{suggestion.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
