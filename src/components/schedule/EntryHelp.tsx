// EntryHelp — the expandable layer under an arrival-card guide.
//
// Doctrine:
//   - Street knowledge is field wisdom, not law: the things that go wrong when
//     you fill a government form in a boarding queue.
//   - The troubleshooter gives sourced practical steps and promises nothing.
//     Echo never fills in or submits a government form, and never claims to
//     know why a website disabled a field.
import { useState } from "react";
import { ChevronDown, LifeBuoy, Lightbulb } from "lucide-react";
import { ENTRY_FIXES, STREET_KNOWLEDGE } from "@/lib/entryReadiness";
import { cn } from "@/lib/utils";

function Fold({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="vanta-focus flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/90">
          {icon}
          {label}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="space-y-2 border-t border-border/40 px-3 py-2">{children}</div> : null}
    </div>
  );
}

export function EntryHelp() {
  return (
    <div className="space-y-1.5">
      <Fold label="Street knowledge" icon={<Lightbulb className="h-3.5 w-3.5 text-primary" aria-hidden />}>
        <ul className="space-y-1.5 text-[11.5px] leading-snug text-foreground/85">
          {STREET_KNOWLEDGE.map((line) => (
            <li key={line} className="flex gap-1.5">
              <span className="text-primary" aria-hidden>
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Fold>
      <Fold
        label="If the form fights you"
        icon={<LifeBuoy className="h-3.5 w-3.5 text-primary" aria-hidden />}
      >
        <div className="space-y-2.5">
          {ENTRY_FIXES.map((fix) => (
            <div key={fix.problem} className="space-y-1">
              <p className="text-[12px] font-medium text-foreground">{fix.problem}</p>
              <ul className="space-y-1 text-[11.5px] leading-snug text-muted-foreground">
                {fix.steps.map((step) => (
                  <li key={step}>— {step}</li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-[11px] leading-snug text-muted-foreground/90">
            Echo fills in nothing and submits nothing. Anything you mark done here is your own word, not a
            government confirmation.
          </p>
        </div>
      </Fold>
    </div>
  );
}
