// DeskInfo — the "what the hell is this desk" answer, written not generated.
//
// Doctrine: no AI call, no tour, no modal. One tap, four plain lines, done.
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DESK_ROLES, deskExplainLines, type DeskKey } from "@/lib/deskRoles";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

export function DeskInfo({ deskKey, className }: { deskKey: DeskKey; className?: string }) {
  const role = DESK_ROLES[deskKey];
  const lines = deskExplainLines(deskKey);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${role.label}?`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "shrink-0 rounded-[2px] p-1 text-muted-foreground/70 hover:text-foreground",
            MOTION_FOCUS,
            className,
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 text-[12px] leading-relaxed">
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{role.label}</p>
        <ul className="mt-1.5 space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className={i === 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
              {l}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
