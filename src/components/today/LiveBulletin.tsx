// LiveBulletin — the board that moves while you watch it.
//
// One line per real change, newest on top, each one naming what happened and
// where it landed so "6 things changed" is never the whole story. Rows arrive
// with a single one-shot animation and then go still. If nothing has landed
// since you opened Vanta, this renders nothing at all — silence is valid.
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Radio } from "lucide-react";
import { MachineText } from "@/components/ui/instrument";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { eventWhere, humanizeEvent } from "@/lib/plainLabels";
import type { LiveEvent } from "@/hooks/useLiveFeed";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import { LEAD_BAR, MOTION_ARRIVE, MOTION_FOCUS, MOTION_ROW, MOTION_TIME_LOCK } from "@/lib/motion";
import { SectionNote } from "@/components/ui/section-note";
import { sectionNote } from "@/lib/roomCopy";
import { cn } from "@/lib/utils";


export function LiveBulletin({
  live,
  seed = [],
  connected,
  onNavigate,
}: {
  live: LiveEvent[];
  /** Already-recorded changes, so the board reads as a board even before
      anything new lands. Live arrivals get pushed on top of these. */
  seed?: LiveEvent[];
  connected: boolean;
  onNavigate: (k: SurfaceKey) => void;
}) {
  const liveIds = new Set(live.map((e) => e.id));
  const rows = [...live, ...seed.filter((e) => !liveIds.has(e.id))].slice(0, 6);
  if (rows.length === 0) return null;

  return (
    <CollapsibleSection
      title="Happening now"
      storageKey="today.live"
      className="vanta-notch"
      icon={<Radio className={cn("h-3.5 w-3.5 text-primary", connected && "vanta-live-dot")} />}
      reading={connected ? "live" : "reconnecting"}
      summary={`${rows.length} recent ${rows.length === 1 ? "change" : "changes"} — ${humanizeEvent(rows[0].event).toLowerCase()}`}
    >
      <SectionNote sectionKey="today.live">{sectionNote("today.live")}</SectionNote>

      <ul className="mt-3 space-y-1.5">

        {rows.map((e, i) => {
          /* Burst control: only the first few genuinely new rows animate. A
             flood of arrivals settles instantly rather than staggering. */
          const isNew = liveIds.has(e.id);
          const animates = isNew && i < 3;
          const where = eventWhere(e.entity_type);
          return (
            <li key={e.id}>
              <button
                onClick={() => onNavigate(where.surface as SurfaceKey)}
                className={cn(
                  "flex w-full min-h-[44px] items-center gap-2 vanta-inset px-3 py-2 text-left hover:bg-surface-elevated/70",
                  animates && MOTION_ARRIVE,
                  MOTION_ROW,
                  MOTION_FOCUS,
                  LEAD_BAR,
                  "text-primary/60",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/90">
                  {humanizeEvent(e.event)}
                  <span className="text-muted-foreground"> — filed in {where.label}</span>
                </span>
                {isNew ? (
                  <MachineText className="shrink-0 rounded-full bg-primary/15 px-1.5 text-[9px] text-primary">
                    new
                  </MachineText>
                ) : null}
                <MachineText className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </MachineText>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </CollapsibleSection>
  );
}
