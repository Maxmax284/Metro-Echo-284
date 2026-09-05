// DraftOrigin — where the drafts on the Actions desk actually come from.
//
// Doctrine: the approval rule was stated but the mechanism was invisible, so an
// empty Actions desk read as dead air. This makes the loop visible in three
// steps and names the kinds of step Echo can prepare today. It reads nothing
// and runs nothing; each step is a link to the desk that owns it.
import { ArrowRight, Inbox, PenLine, ShieldCheck } from "lucide-react";
import { DRAFT_KINDS, DRAFT_ORIGIN } from "@/lib/deskTeaching";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

const STEP_ICON = [Inbox, PenLine, ShieldCheck] as const;

export function DraftOrigin({
  onOpenInbox,
  className,
}: {
  onOpenInbox?: () => void;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border/60 bg-surface-elevated/40 p-3", className)}>
      <p className="vanta-machine-label text-foreground/70">Where drafts come from</p>

      <ol className="mt-2 space-y-1.5">
        {DRAFT_ORIGIN.map((s, i) => {
          const Icon = STEP_ICON[i] ?? Inbox;
          const isInbox = s.desk === "inbox";
          const Wrapper = isInbox && onOpenInbox ? "button" : "div";
          return (
            <li key={s.step}>
              <Wrapper
                {...(isInbox && onOpenInbox
                  ? { type: "button" as const, onClick: onOpenInbox }
                  : {})}
                className={cn(
                  "flex w-full items-start gap-2 rounded-[2px] border border-border/50 bg-background/40 p-2 text-left",
                  isInbox && onOpenInbox && cn("hover:border-primary/40", MOTION_FOCUS),
                )}
              >
                <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary/40 text-[9px] font-mono text-primary">
                  {i + 1}
                </span>
                <Icon className="mt-[2px] h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium leading-snug text-foreground">
                    {s.step}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {s.line}
                  </span>
                </span>
                {isInbox && onOpenInbox && (
                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
              </Wrapper>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 vanta-machine-label text-foreground/70">What Echo may draft for you</p>
      <ul className="mt-1.5 space-y-1">
        {DRAFT_KINDS.map((k) => (
          <li key={k} className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
            <span>
              {k}
              <span className="text-muted-foreground/70"> — waits for your approval.</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
