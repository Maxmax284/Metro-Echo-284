import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { MOTION_FOCUS } from "@/lib/motion";

/** Broadcast event every CollapsibleSection obeys. */
export const PANELS_SET_EVENT = "vanta:panels-set";

/** Fold or unfold every panel on the current surface at once. */
export function setAllPanels(open: boolean) {
  window.dispatchEvent(new CustomEvent(PANELS_SET_EVENT, { detail: { open } }));
}

/**
 * CollapsibleSection — a panel that can be folded away.
 *
 * The rail itself is the control: tap the label to fold the panel down to a
 * single line. State is remembered per panel so a room you tidied stays tidy.
 * Actions (See all, Details) stay live in the rail and never toggle the fold.
 */
export function CollapsibleSection({
  title,
  storageKey,
  icon,
  reading,
  action,
  defaultOpen = true,
  summary,
  children,
  className,
}: {
  title: string;
  /** Stable key so the fold state survives reloads. */
  storageKey: string;
  icon?: ReactNode;
  reading?: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  /** One quiet line shown while folded, so a closed panel still says something. */
  summary?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const key = `vanta.panel.${storageKey}`;
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const saved = window.localStorage.getItem(key);
    return saved === null ? defaultOpen : saved === "1";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, open ? "1" : "0");
    } catch {
      /* private mode: fold state is a nicety, not a requirement */
    }
  }, [key, open]);

  /* Room-level sweep: "Expand all" / "Collapse all" broadcasts one event and
     every panel follows. Each panel still remembers the result as its own
     saved state, so the tidy-up survives reloads. */
  useEffect(() => {
    const onSetAll = (e: Event) => {
      const detail = (e as CustomEvent<{ open?: boolean }>).detail;
      if (typeof detail?.open === "boolean") setOpen(detail.open);
    };
    window.addEventListener(PANELS_SET_EVENT, onSetAll);
    return () => window.removeEventListener(PANELS_SET_EVENT, onSetAll);
  }, []);

  return (
    <section
      className={cn(
        "vanta-focus-card vanta-card border border-transparent",
        open ? "p-4" : "px-4 py-2.5",
        "transition-[padding] duration-200",
        className,
      )}
      data-open={open ? "true" : "false"}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "vanta-rail min-h-[36px] min-w-0 flex-1 text-left hover:text-foreground",
            MOTION_FOCUS,
          )}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
          {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
          <MachineLabel className="shrink-0 text-foreground/70">{title}</MachineLabel>
          {reading ? (
            <MachineText className="shrink-0 text-[10px] text-muted-foreground">{reading}</MachineText>
          ) : null}
        </button>
        {action && open ? <div className="shrink-0">{action}</div> : null}
      </div>

      {open ? (
        <div className="mt-3">{children}</div>
      ) : summary ? (
        <p className="mt-1 truncate text-[11.5px] leading-snug text-muted-foreground">{summary}</p>
      ) : null}
    </section>
  );
}
