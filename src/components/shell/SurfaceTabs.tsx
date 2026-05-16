import { useState } from "react";
import { MessageSquare, Notebook, ListChecks, Compass, CheckSquare, Search, ScrollText, LayoutDashboard, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type SurfaceKey = "command" | "conversation" | "memory" | "commitments" | "actions" | "awareness" | "sherlock" | "audit";

const items: { key: SurfaceKey; label: string; Icon: typeof MessageSquare }[] = [
  { key: "command", label: "Cockpit", Icon: LayoutDashboard },
  { key: "conversation", label: "Log", Icon: MessageSquare },
  { key: "memory", label: "Memory", Icon: Notebook },
  { key: "commitments", label: "Commit", Icon: CheckSquare },
  { key: "actions", label: "Actions", Icon: ListChecks },
  { key: "sherlock", label: "Sherlock", Icon: Search },
  { key: "awareness", label: "Aware", Icon: Compass },
  { key: "audit", label: "Audit", Icon: ScrollText },
];

// Mobile: 4 primary + overflow drawer for the rest. Keeps touch targets honest at 384px.
const PRIMARY: SurfaceKey[] = ["command", "conversation", "commitments", "actions"];

export function SurfaceTabs({
  active,
  onChange,
  variant = "rail",
}: {
  active: SurfaceKey;
  onChange: (k: SurfaceKey) => void;
  variant?: "rail" | "bottom";
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  if (variant === "bottom") {
    const primaryItems = items.filter((i) => PRIMARY.includes(i.key));
    const overflowItems = items.filter((i) => !PRIMARY.includes(i.key));
    const activeInOverflow = overflowItems.some((i) => i.key === active);

    return (
      <nav className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border/60 px-2 pt-1.5 md:hidden">
        {primaryItems.map(({ key, label, Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors duration-200 ease-out",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={label}
            >
              <Icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
              <span className="tracking-wide">{label}</span>
            </button>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors duration-200 ease-out",
                activeInOverflow ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label="More surfaces"
            >
              <MoreHorizontal className={cn("h-5 w-5", activeInOverflow && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")} />
              <span className="tracking-wide">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <SheetHeader><SheetTitle className="text-sm">Surfaces</SheetTitle></SheetHeader>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {overflowItems.map(({ key, label, Icon }) => {
                const isActive = key === active;
                return (
                  <button
                    key={key}
                    onClick={() => { onChange(key); setMoreOpen(false); }}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border border-border/60 px-3 py-3 text-left text-sm transition-colors",
                      isActive ? "bg-primary/15 text-primary border-primary/30" : "bg-surface-elevated text-foreground/90 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    );
  }

  return (
    <nav className="hidden md:flex md:w-16 md:flex-col md:items-center md:gap-2 md:py-4">
      {items.map(({ key, label, Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            className={cn(
              "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200 ease-out",
              isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            {isActive && <span className="absolute -left-0.5 h-6 w-0.5 rounded-r-full bg-primary" />}
          </button>
        );
      })}
    </nav>
  );
}
