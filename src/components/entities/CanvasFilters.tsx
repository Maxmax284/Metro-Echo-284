// Phase 7 — Canvas filter bar. Shared kind + time-window filters that apply
// across Cards / Timeline / Graph (Board is action-only and ignores kinds).
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CanvasWindow = 7 | 30 | 90;
export type CanvasKind = "person" | "place" | "org" | "topic" | "thing" | "event";

const KINDS: { key: CanvasKind; label: string }[] = [
  { key: "person", label: "People" },
  { key: "place", label: "Places" },
  { key: "org", label: "Orgs" },
  { key: "topic", label: "Topics" },
  { key: "thing", label: "Things" },
  { key: "event", label: "Events" },
];

const WINDOWS: { key: CanvasWindow; label: string }[] = [
  { key: 7, label: "7d" },
  { key: 30, label: "30d" },
  { key: 90, label: "90d" },
];

export function CanvasFilters({
  windowDays,
  setWindowDays,
  kinds,
  setKinds,
  showKinds = true,
}: {
  windowDays: CanvasWindow;
  setWindowDays: (w: CanvasWindow) => void;
  kinds: Set<CanvasKind>;
  setKinds: (k: Set<CanvasKind>) => void;
  showKinds?: boolean;
}) {
  const toggleKind = (k: CanvasKind) => {
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k); else next.add(k);
    setKinds(next);
  };
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-b border-border/40 bg-background/60">
      <div className="flex items-center gap-1">
        {WINDOWS.map((w) => (
          <Button
            key={w.key}
            size="sm"
            variant={windowDays === w.key ? "secondary" : "ghost"}
            className={cn("h-6 px-2 text-[10.5px]")}
            onClick={() => setWindowDays(w.key)}
          >
            {w.label}
          </Button>
        ))}
      </div>
      {showKinds && (
        <>
          <span className="mx-1 h-3 w-px bg-border" />
          <div className="flex flex-wrap items-center gap-1">
            {KINDS.map((k) => {
              const on = kinds.size === 0 || kinds.has(k.key);
              return (
                <button
                  key={k.key}
                  onClick={() => toggleKind(k.key)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] transition",
                    on
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-surface-elevated/40 text-muted-foreground border border-border/40",
                  )}
                  title={kinds.size === 0 ? "All kinds (tap to focus)" : on ? "Hide this kind" : "Show this kind"}
                >
                  {k.label}
                </button>
              );
            })}
            {kinds.size > 0 && (
              <button
                onClick={() => setKinds(new Set())}
                className="text-[10.5px] text-muted-foreground underline-offset-2 hover:underline ml-1"
              >
                clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
