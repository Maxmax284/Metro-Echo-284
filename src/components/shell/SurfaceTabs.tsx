import { useState } from "react";
import {
  MessageSquare,
  Notebook,
  ListChecks,
  Compass,
  CheckSquare,
  Search,
  ScrollText,
  LayoutDashboard,
  MoreHorizontal,
  CalendarClock,
  Inbox,
  FolderKanban,
  FileText,
  Receipt,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";

export type SurfaceKey =
  | "today"
  | "command"
  | "inbox"
  | "projects"
  | "briefs"
  | "receipts"
  // legacy / advanced — still reachable via "More" and deep links
  | "schedule"
  | "conversation"
  | "memory"
  | "commitments"
  | "actions"
  | "awareness"
  | "sherlock";

const items: { key: SurfaceKey; label: string; Icon: typeof MessageSquare }[] = [
  // Primary
  { key: "today", label: "Today", Icon: Sun },
  { key: "command", label: "Cockpit", Icon: LayoutDashboard },
  { key: "inbox", label: "Inbox", Icon: Inbox },
  { key: "projects", label: "Projects", Icon: FolderKanban },
  { key: "briefs", label: "Briefs", Icon: FileText },
  { key: "receipts", label: "Receipts", Icon: Receipt },
  // Advanced (overflow)
  { key: "schedule", label: "Today", Icon: CalendarClock },
  { key: "conversation", label: "Capture chat", Icon: MessageSquare },
  { key: "memory", label: "Memory", Icon: Notebook },
  { key: "commitments", label: "Commitments", Icon: CheckSquare },
  { key: "actions", label: "Actions", Icon: ListChecks },
  { key: "sherlock", label: "Sherlock", Icon: Search },
  { key: "awareness", label: "Aware", Icon: Compass },
];

// Five primary surfaces — the daily desk.
const PRIMARY: SurfaceKey[] = ["today", "inbox", "projects", "briefs", "receipts"];

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

  const primaryItems = items.filter((i) => PRIMARY.includes(i.key));
  const overflowItems = items.filter((i) => !PRIMARY.includes(i.key));
  const activeInOverflow = overflowItems.some((i) => i.key === active);

  const MoreSheet = (
    <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
      <SheetTrigger asChild>
        <button
          className={cn(
            variant === "bottom"
              ? "flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors duration-200 ease-out"
              : "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200 ease-out",
            activeInOverflow
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
          )}
          aria-label="More surfaces"
          title="More surfaces"
        >
          <MoreHorizontal
            className={cn(
              variant === "bottom" ? "h-5 w-5" : "h-5 w-5",
              activeInOverflow && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
            )}
          />
          {variant === "bottom" && <span className="tracking-wide">More</span>}
        </button>
      </SheetTrigger>
      <SheetContent side={variant === "bottom" ? "bottom" : "left"} className={variant === "bottom" ? "rounded-t-2xl pb-8" : "w-[300px]"}>
        <SheetHeader>
          <SheetTitle className="text-sm">Advanced surfaces</SheetTitle>
          <SheetDescription className="text-xs">
            These also live inside Projects and Cockpit. You usually won't need to open them on their own.
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
                  "flex items-center gap-2 rounded-xl border border-border/60 px-3 py-3 text-left text-sm transition-colors",
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
      <nav className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border/60 px-2 pt-1.5 md:hidden">
        {primaryItems.map(({ key, label, Icon }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] transition-colors duration-[var(--motion-base)] ease-[var(--ease-out)]",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
              aria-label={label}
            >
              {/* Sliding lift on active: tiny bar grows up under the icon. */}
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
    <nav className="hidden md:flex md:w-16 md:flex-col md:items-center md:gap-2 md:py-4">
      {primaryItems.map(({ key, label, Icon }) => {
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
      <div className="mt-1">{MoreSheet}</div>
    </nav>
  );
}
