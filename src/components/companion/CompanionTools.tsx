import { MapPin, Receipt, Link2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAwareness } from "@/providers/AwarenessProvider";
import { useCurrentContext } from "@/providers/CurrentContextProvider";

type Tool = { id: string; label: string; icon: typeof MapPin; build: (ctx: { placeLabel?: string; surface: string }) => string };

const TOOLS: Tool[] = [
  {
    id: "area",
    label: "Ask about area",
    icon: MapPin,
    build: ({ placeLabel }) =>
      placeLabel
        ? `Ask about ${placeLabel}: what should I know right now (transport, payments, etiquette, hazards)? Use the latest awareness briefings and snapshot.`
        : `Ask about my current area: what should I know right now? If no place is set, suggest capturing one first.`,
  },
  {
    id: "receipt",
    label: "Explain receipt",
    icon: Receipt,
    build: () =>
      `Explain the most recent receipt/file I uploaded — what was bought, totals, anomalies, and whether anything needs follow-up. Stage a draft action only if needed.`,
  },
  {
    id: "related",
    label: "Find related",
    icon: Link2,
    build: ({ surface }) =>
      `Find notes, commitments, and actions related to what I'm currently looking at on the ${surface} surface. Surface links — don't execute anything.`,
  },
  {
    id: "draft",
    label: "Explain draft",
    icon: FileText,
    build: () =>
      `Explain the latest proposed action: what it does, what it touches, the risk level, and what to check before approving. Do not execute.`,
  },
];

export function CompanionTools({ onPick, className }: { onPick: (prompt: string) => void; className?: string }) {
  const { place } = useAwareness();
  const { context } = useCurrentContext();

  return (
    <div className={cn("flex flex-wrap gap-1.5 border-b border-border/40 px-3 py-2", className)}>
      {TOOLS.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.build({ placeLabel: place?.label, surface: context.surface }))}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface-elevated/60",
              "px-2 py-1 text-[11px] text-foreground/85 hover:bg-surface-elevated hover:text-foreground transition-colors"
            )}
            title={t.label}
          >
            <Icon className="h-3 w-3 text-primary/80" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
