import { Lock, Eye, Sparkles, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AppMode, MODE_DESCRIPTION, MODE_LABEL, useMode } from "@/hooks/useMode";

const ICONS: Record<AppMode, typeof Lock> = {
  locked: Lock,
  observer: Eye,
  advisor: Sparkles,
  operator: Zap,
};

const TONE: Record<AppMode, string> = {
  locked: "bg-muted/40 text-muted-foreground ring-border/60",
  observer: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  advisor: "bg-primary/15 text-primary ring-primary/30",
  operator: "bg-signal/15 text-signal ring-signal/30",
};

const ORDER: AppMode[] = ["locked", "observer", "advisor", "operator"];

export function ModeBadge() {
  const { mode, setMode } = useMode();
  const Icon = ICONS[mode];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Mode: ${MODE_LABEL[mode]}`}
          title={`Mode: ${MODE_LABEL[mode]} — click to change`}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] uppercase tracking-wider ring-1 transition-colors",
            "hover:brightness-110",
            TONE[mode]
          )}
        >
          <Icon className="h-3 w-3" />
          {/* On a phone the icon carries it: the word pushed the cluster past
              384px. The label lives in aria-label, the title and the popover. */}
          <span className="hidden sm:inline">{MODE_LABEL[mode]}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-1">
        <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          Companion mode
        </div>
        <ul className="space-y-0.5">
          {ORDER.map((m) => {
            const MIcon = ICONS[m];
            const active = m === mode;
            return (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                    active ? "bg-surface-elevated ring-1 ring-border/60" : "hover:bg-surface-elevated/60"
                  )}
                >
                  <MIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground">{MODE_LABEL[m]}</div>
                    <div className="text-[11px] leading-snug text-muted-foreground">{MODE_DESCRIPTION[m]}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
