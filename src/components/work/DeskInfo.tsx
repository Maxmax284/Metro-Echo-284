// DeskInfo — the "what the hell is this desk" answer, written not generated.
//
// Doctrine: no AI call, no tour, no modal. One tap, four plain lines, done.
//
// Accessibility contract:
//  - The trigger is a real button with an accessible name that says what it
//    does ("What is Inbox?"), plus aria-expanded so a screen reader knows the
//    panel state.
//  - The panel is labelled by its own heading, so opening it announces the
//    desk name rather than "dialog".
//  - Pointer AND keyboard events are stopped at the trigger: this control sits
//    next to a desk tile that navigates, and Enter/Space must never fall
//    through and move the user somewhere.
//  - Touch gets a 44x44 target; pointer devices get the quieter 28px one.
//  - Escape closes and focus returns to the trigger (Radix), so nobody gets
//    stranded inside the panel.
import { useId, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DESK_ROLES, type DeskKey } from "@/lib/deskRoles";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

export function DeskInfo({
  deskKey,
  className,
  open: controlledOpen,
  onOpenChange,
  recommended,
}: {
  deskKey: DeskKey;
  className?: string;
  /** Controlled mode, so a long press on the desk tile can open this panel. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * The next step worth taking, derived from counts the room already loaded.
   * Omitted when there is nothing honest to recommend.
   */
  recommended?: string | null;
}) {
  const role = DESK_ROLES[deskKey];
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (v: boolean) => {
    setUncontrolled(v);
    onOpenChange?.(v);
  };
  const titleId = useId();

  /* Labelled rows instead of a bare list: each line says which question it is
     answering, which is what makes it readable out of context. */
  const rows: { term: string; detail: string }[] = [
    { term: "What it is", detail: role.is },
    { term: "Use me when", detail: role.useWhen },
    { term: "How things get here", detail: role.lands },
    { term: "What you do", detail: role.you },
    { term: "For example", detail: role.example },
    { term: "If it's empty", detail: role.emptyWhy },
  ];




  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What can I do in ${role.label}?`}
          /* Keep the tap contained: the neighbouring tile navigates. */
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          className={cn(
            "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px]",
            "text-muted-foreground hover:text-foreground",
            /* Pointer devices don't need a thumb-sized target. */
            "md:h-7 md:w-7",
            MOTION_FOCUS,
            open && "text-foreground",
            className,
          )}
        >
          <HelpCircle className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        aria-labelledby={titleId}
        /* Narrow enough to survive a 384px viewport without clipping. */
        className="w-[min(18rem,calc(100vw-2rem))] p-3 text-[12px] leading-relaxed"
        onClick={(e) => e.stopPropagation()}
      >
        <p id={titleId} className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {role.label}
        </p>
        <dl className="mt-1.5 space-y-1.5">
          {rows.map((r) => (
            <div key={r.term}>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                {r.term}
              </dt>
              <dd className="text-foreground/90">{r.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 border-t border-border/40 pt-1.5 text-[10px] italic text-muted-foreground/70">
          Reading only. Opening the desk is the tile next to this.
        </p>
      </PopoverContent>
    </Popover>
  );
}
