// JumpStrip — one row of desk chips under the Today header.
//
// Doctrine: navigation only. No new data, no execution. Counts come from reads
// Today already did; a zero count shows no number rather than a loud "0".
import { Inbox, CheckSquare, ListChecks, FileText, Notebook, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { markFlipOriginFromEvent } from "@/lib/flip";
import { DESK_TILE_HINT, type DeskKey } from "@/lib/deskRoles";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

type Lane = {
  deskKey: DeskKey;
  label: string;
  Icon: typeof Inbox;
  surface?: SurfaceKey;
  href?: string;
  count?: number;
};

export function JumpStrip({
  onNavigate,
  counts,
}: {
  onNavigate: (k: SurfaceKey) => void;
  counts: { inbox?: number; commitments?: number; actions?: number };
}) {
  const lanes: Lane[] = [
    { deskKey: "inbox", label: "Inbox", Icon: Inbox, surface: "inbox", count: counts.inbox },
    { deskKey: "commitments", label: "Commitments", Icon: CheckSquare, surface: "commitments", count: counts.commitments },
    { deskKey: "actions", label: "Actions", Icon: ListChecks, surface: "actions", count: counts.actions },
    { deskKey: "documents", label: "Documents", Icon: FileText, href: "/documents" },
    { deskKey: "memory", label: "Memory", Icon: Notebook, surface: "memory" },
    { deskKey: "schedule", label: "Schedule", Icon: CalendarClock, surface: "schedule" },
  ];

  return (
    <nav aria-label="Jump to a desk" className="-mx-1 overflow-x-auto px-1 pb-0.5">
      <ul className="flex min-w-max items-center gap-1.5">
        {lanes.map((lane) => {
          const body = (
            <>
              <lane.Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate text-[11.5px] font-medium text-foreground">{lane.label}</span>
              {typeof lane.count === "number" && lane.count > 0 && (
                <span className="shrink-0 rounded-[2px] bg-primary/15 px-1 text-[10px] font-medium text-primary">
                  {lane.count}
                </span>
              )}
            </>
          );
          const className = cn(
            "flex min-h-[36px] items-center gap-1.5 vanta-inset px-2.5 py-1.5 text-left hover:bg-surface-elevated/70",
            MOTION_ROW,
            MOTION_FOCUS,
          );
          return (
            <li key={lane.deskKey}>
              {lane.href ? (
                <a href={lane.href} title={DESK_TILE_HINT[lane.deskKey]} className={className} onClick={markFlipOriginFromEvent}>
                  {body}
                </a>
              ) : (
                <button
                  type="button"
                  title={DESK_TILE_HINT[lane.deskKey]}
                  className={className}
                  onClick={(e) => {
                    markFlipOriginFromEvent(e);
                    if (lane.surface) onNavigate(lane.surface);
                  }}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
