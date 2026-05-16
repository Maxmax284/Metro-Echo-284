import { MessageSquare, Notebook, ListChecks, Compass, CheckSquare, Search, ScrollText, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export type SurfaceKey = "command" | "conversation" | "memory" | "commitments" | "actions" | "awareness" | "sherlock" | "audit";

const items: { key: SurfaceKey; label: string; Icon: typeof MessageSquare }[] = [
  { key: "command", label: "Cockpit", Icon: LayoutDashboard },
  { key: "conversation", label: "Talk", Icon: MessageSquare },
  { key: "memory", label: "Memory", Icon: Notebook },
  { key: "commitments", label: "Commit", Icon: CheckSquare },
  { key: "actions", label: "Actions", Icon: ListChecks },
  { key: "sherlock", label: "Sherlock", Icon: Search },
  { key: "awareness", label: "Aware", Icon: Compass },
  { key: "audit", label: "Audit", Icon: ScrollText },
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
  if (variant === "bottom") {
    return (
      <nav className="glass safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border/60 px-2 pt-1.5 md:hidden">
        {items.map(({ key, label, Icon }) => {
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
