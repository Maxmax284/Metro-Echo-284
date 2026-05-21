// SherlockSuggestionChip — a small, dismissible chip surfacing one Sherlock
// finding (suggest/observe/extract/relate) on a card. Tapping opens the
// overlay. Confidence is always visible. Never executes.
import { Sparkles, X } from "lucide-react";
import { StatusDot, confidenceTone } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";
import { vantaSay } from "@/lib/vantaVoice";
import type { SherlockOperation } from "@/hooks/useSherlockCache";

export function SherlockSuggestionChip({
  operation,
  label,
  confidence,
  onOpen,
  onDismiss,
  className,
  title,
}: {
  operation: SherlockOperation;
  label: string;
  confidence?: string | null;
  onOpen?: () => void;
  onDismiss?: () => void;
  className?: string;
  title?: string;
}) {
  const opLabel = vantaSay.sherlock.operation[operation as keyof typeof vantaSay.sherlock.operation] ?? operation;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary/8 px-2 py-0.5 text-[10.5px] text-primary/90 ring-1 ring-primary/25",
        onOpen && "cursor-pointer hover:bg-primary/15",
        className,
      )}
      title={title ?? `${opLabel} — ${vantaSay.sherlock.chipHint()}`}
      role={onOpen ? "button" : undefined}
      onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(); } : undefined}
    >
      <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden />
      {confidence && (
        <StatusDot tone={confidenceTone(confidence)} title={`${confidence} confidence`} />
      )}
      <span className="truncate max-w-[14rem]">{label}</span>
      <span className="hidden text-[9px] uppercase tracking-wider opacity-70 sm:inline">
        {opLabel}
      </span>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss suggestion"
          className="-mr-1 ml-0.5 rounded-full p-0.5 opacity-70 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
