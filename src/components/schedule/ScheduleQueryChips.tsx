import { useState } from "react";
import { Clock, CalendarDays, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useIntentHandler } from "@/hooks/useIntentHandler";
import { cn } from "@/lib/utils";

/**
 * Doctrine: every card answers "what can I do / what happens if I tap".
 * These chips run `query_schedule` and post a tz-stamped block into the
 * active conversation. No silent execution; results land where the user
 * can see receipts.
 */
const CHIPS = [
  { id: "today",    label: "Today",    Icon: Clock },
  { id: "tomorrow", label: "Tomorrow", Icon: CalendarDays },
  { id: "overdue",  label: "Overdue",  Icon: AlertTriangle },
  { id: "next",     label: "Next",     Icon: ArrowRight },
] as const;

export function ScheduleQueryChips() {
  const handle = useIntentHandler();
  const [busy, setBusy] = useState<string | null>(null);

  const ask = async (window: typeof CHIPS[number]["id"]) => {
    setBusy(window);
    try { await handle("query_schedule", { window }); }
    finally { setBusy(null); }
  };

  return (
    <div className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1">
      {CHIPS.map(({ id, label, Icon }) => {
        const isBusy = busy === id;
        return (
          <button
            key={id}
            onClick={() => ask(id)}
            disabled={!!busy}
            className={cn(
              "inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors",
              "min-h-[28px] border-border/60 bg-surface-elevated/40 text-foreground/80",
              "hover:border-primary/40 hover:text-primary disabled:opacity-60",
            )}
            aria-label={`Ask: ${label}`}
          >
            {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3 text-primary" />}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
