import { useState } from "react";
import {
  MessageSquare,
  Notebook,
  ListChecks,
  Compass,
  CheckSquare,
  Search,
  LayoutDashboard,
  MoreHorizontal,
  CalendarClock,
  Inbox,
  FolderKanban,
  FileText,
  Receipt,
  Sun,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_MICRO, MOTION_ROW } from "@/lib/motion";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { PRIMARY_ROOMS, roomForSurface, type SurfaceId } from "@/lib/navigation";

export type SurfaceKey = SurfaceId;

const items: { key: SurfaceKey; label: string; Icon: typeof MessageSquare }[] = [
  // Primary rooms
  { key: "today", label: "Today", Icon: Sun },
  { key: "work", label: "Work", Icon: Briefcase },
  { key: "ask", label: "Ask", Icon: Sparkles },
  { key: "receipts", label: "Receipts", Icon: Receipt },
  // Specialist desks (reachable through Work, Today drill-downs and More)
  { key: "projects", label: "Projects", Icon: FolderKanban },
  { key: "inbox", label: "Inbox", Icon: Inbox },
  { key: "briefs", label: "Briefs", Icon: FileText },
  { key: "memory", label: "Memory", Icon: Notebook },
  { key: "commitments", label: "Commitments", Icon: CheckSquare },
  { key: "schedule", label: "Schedule", Icon: CalendarClock },
  { key: "actions", label: "Actions", Icon: ListChecks },
  { key: "sherlock", label: "Sherlock", Icon: Search },
  { key: "awareness", label: "Aware", Icon: Compass },
  { key: "command", label: "Cockpit", Icon: LayoutDashboard },
  { key: "conversation", label: "Capture chat", Icon: MessageSquare },
];

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

  const primaryItems = PRIMARY_ROOMS.map((k) => items.find((i) => i.key === k)!).filter(Boolean);
  const overflowItems = items.filter((i) => !(PRIMARY_ROOMS as string[]).includes(i.key));
  const activeRoom = roomForSurface(active);
  const activeInOverflow = overflowItems.some((i) => i.key === active);

  const MoreSheet = (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <SheetTrigger asChild>
        <button
          className={cn(
            variant === "bottom"
              ? "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-[11px]"
              : "group relative flex h-11 w-11 items-center justify-center rounded-xl",
            MOTION_ROW,
            activeInOverflow
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
          )}

          aria-label="More tools"
          title="More tools"
        >
          <MoreHorizontal
            className={cn("h-5 w-5", activeInOverflow && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]")}
          />
          {variant === "bottom" && <span className="tracking-wide">More</span>}
        </button>
      </SheetTrigger>
      <SheetContent side={variant === "bottom" ? "bottom" : "left"} className={variant === "bottom" ? "rounded-t-2xl pb-8" : "w-[300px]"}>
        <SheetHeader>
          <SheetTitle className="text-sm">Specialist desks</SheetTitle>
          <SheetDescription className="text-xs">
            These all live inside Work or open from Today. Come here when you want one on its own.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {overflowItems.map(({ key, label, Icon }) => {
            const isActive = key === active;
            return (
              <button
                key={key}
                onClick={() => {
                  onChange(key);
                  setMoreOpen(false);
                }}
                className={cn(
                  "flex min-h-[44px] items-center gap-2 rounded-xl border border-border/60 px-3 py-3 text-left text-sm transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-surface-elevated text-foreground/90 hover:text-foreground"
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
  );

  if (variant === "bottom") {
    return (
      <nav
        aria-label="Primary"
        className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border/60 px-2 pt-1.5 md:hidden"
      >
        {primaryItems.map(({ key, label, Icon }) => {
          const isActive = activeRoom === key && !activeInOverflow;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={cn(
                "relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors duration-[var(--motion-base)] ease-[var(--ease-out)]",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute -top-0.5 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-primary transition-[width,opacity] duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
                  isActive ? "w-6 opacity-100" : "w-0 opacity-0",
                )}
              />
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform duration-[var(--motion-base)] ease-[var(--ease-out)] motion-reduce:transition-none",
                  isActive && "-translate-y-0.5 drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]",
                )}
              />
              <span className="tracking-wide">{label}</span>
            </button>
          );
        })}
        {MoreSheet}
      </nav>
    );
  }

  return (
    <nav aria-label="Primary" className="hidden md:flex md:w-16 md:flex-col md:items-center md:gap-2 md:py-4">
      {primaryItems.map(({ key, label, Icon }) => {
        const isActive = activeRoom === key && !activeInOverflow;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            title={label}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "group relative flex h-11 w-11 flex-col items-center justify-center rounded-xl transition-colors duration-200 ease-out",
              isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[9px] leading-tight tracking-wide">{label}</span>
            {isActive && <span className="absolute -left-0.5 h-6 w-0.5 rounded-r-full bg-primary" />}
          </button>
        );
      })}
      <div className="mt-1">{MoreSheet}</div>
    </nav>
  );
}
