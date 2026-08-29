// SherlockBriefing — "What Vanta noticed" at the top of the Sherlock room.
//
// Doctrine: opens with where things stand, promotes exactly one thing, and
// files nothing on its own. Every button here either scrolls you to the queue
// or opens the finding you already chose.
import { Radar, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { SherlockFindingCard } from "./SherlockFindingCard";
import type { SherlockBriefing as Briefing } from "@/lib/sherlockBriefing";
import { formatDistanceToNow } from "date-fns";

export function SherlockBriefingPanel({
  briefing,
  lastScanAt,
  scanning,
  onScan,
  onChanged,
}: {
  briefing: Briefing;
  lastScanAt?: string | null;
  scanning?: boolean;
  onScan: () => void;
  onChanged?: () => void;
}) {
  return (
    <section className="vanta-card p-3" aria-label="What Vanta noticed">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Radar className="h-3.5 w-3.5" /> What Vanta noticed
          </p>
          <p className="mt-1 text-[12.5px] leading-snug text-foreground">{briefing.headline}</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            {lastScanAt
              ? `Last look ${formatDistanceToNow(new Date(lastScanAt), { addSuffix: true })}.`
              : "No look recorded yet."}
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]" onClick={onScan} disabled={scanning}>
          {scanning ? "Looking…" : "Look again"}
        </Button>
      </div>

      {briefing.groups.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {briefing.groups.map((g) => (
            <li key={g.key} className="flex items-baseline gap-2 text-[11.5px]">
              <span className="font-medium text-foreground">{g.count}</span>
              <span className="text-muted-foreground">{g.label}</span>
              {g.example && (
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground/70">
                  e.g. {g.example}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {briefing.startHere && (
        <div className="mt-3 border-t border-border/40 pt-2.5">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> Start here
          </p>
          {briefing.startHereReason && (
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">{briefing.startHereReason}</p>
          )}
          <div className="mt-1.5">
            <SherlockFindingCard finding={briefing.startHere} onChanged={onChanged} compact />
          </div>
        </div>
      )}

      <AftermathHint text="Accepting files the link and writes a receipt · dismissing keeps it out of your way" />
    </section>
  );
}
