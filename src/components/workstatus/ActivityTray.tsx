// ActivityTray — global, calm, mobile-aware activity surface.
// Collapsed: small pill ("N active" or "1 needs you"). Expanded: grouped sheet.
// Never steals focus; never blocks navigation; never spams toasts.
import { useMemo, useState } from "react";
import { Activity, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActivity } from "./ActivityStore";
import { WorkProgressCard } from "./WorkProgressCard";
import type { WorkItem, WorkState } from "@/lib/workStatus";

function groupBy(items: WorkItem[]) {
  const working: WorkItem[] = [];
  const needs: WorkItem[] = [];
  const failed: WorkItem[] = [];
  const recent: WorkItem[] = [];
  for (const i of items) {
    if (i.state === "working" || i.state === "queued") working.push(i);
    else if (i.state === "waiting_for_user") needs.push(i);
    else if (i.state === "failed") failed.push(i);
    else if (i.state === "complete") recent.push(i);
  }
  return { working, needs, failed, recent };
}

function pillTone(states: WorkState[]): string {
  if (states.includes("failed")) return "border-destructive/40 text-destructive";
  if (states.includes("waiting_for_user")) return "border-amber-500/40 text-amber-700";
  if (states.includes("working")) return "border-primary/40 text-primary";
  return "border-border/60 text-muted-foreground";
}

export function ActivityTray() {
  const { items, remove } = useActivity();
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => groupBy(items), [items]);
  const visible =
    groups.working.length + groups.needs.length + groups.failed.length + groups.recent.length;

  if (visible === 0) return null;

  const states = items.map((i) => i.state);
  const headline =
    groups.failed.length > 0
      ? `${groups.failed.length} needs attention`
      : groups.needs.length > 0
        ? `${groups.needs.length} needs you`
        : groups.working.length > 0
          ? `${groups.working.length} working`
          : `${groups.recent.length} just done`;

  return (
    <>
      {/* Floating pill — bottom-right desktop, bottom-center mobile, raised above any bottom nav */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed z-40 inline-flex h-11 items-center gap-2 rounded-full border bg-background/95 px-3 text-[12px] font-medium shadow-md backdrop-blur",
          "bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] right-3 sm:bottom-4 sm:right-4",
          "vanta-card-enter hover:bg-surface-elevated",
          pillTone(states),
        )}
        aria-label={`Activity: ${headline}`}
      >
        <Activity className="h-4 w-4" />
        <span className="truncate max-w-[160px]">{headline}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[min(420px,100vw)] p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Activity</div>
              <div className="text-[11px] text-muted-foreground">
                What Vanta is working on right now.
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen(false)}
              aria-label="Close activity"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="max-h-[calc(100vh-64px)] overflow-y-auto p-3 space-y-4">
            <Section title="Working" items={groups.working} onDismiss={remove} />
            <Section title="Needs you" items={groups.needs} onDismiss={remove} />
            <Section title="Needs attention" items={groups.failed} onDismiss={remove} />
            <Section title="Recently done" items={groups.recent} onDismiss={remove} muted />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({
  title,
  items,
  onDismiss,
  muted = false,
}: {
  title: string;
  items: WorkItem[];
  onDismiss: (id: string) => void;
  muted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <div
        className={cn(
          "text-[10.5px] font-semibold uppercase tracking-wider",
          muted ? "text-muted-foreground" : "text-foreground/80",
        )}
      >
        {title}
      </div>
      <div className="space-y-2">
        {items.map((i) => (
          <WorkProgressCard key={i.id} item={i} onDismiss={() => onDismiss(i.id)} />
        ))}
      </div>
    </section>
  );
}
