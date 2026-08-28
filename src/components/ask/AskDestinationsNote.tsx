// AskDestinationsNote — the Ask → Work round trip, stated in advance.
//
// Doctrine: a user should never wonder where an Ask output went. Ask drafts;
// Work owns the record. This note names the destination for each kind of thing
// Ask can produce, using the canonical nouns and homes from `vantaNouns`, so
// the wording can never drift from the rest of the app.
//
// Presentation only. It reads no state and triggers nothing.
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CANONICAL_NOUN, OBJECT_HOME, type VantaObject } from "@/lib/vantaNouns";

/** What Ask can make, and which desk ends up owning it. */
const ROUTES: { object: VantaObject; made: string }[] = [
  { object: "action", made: "Draft something to send" },
  { object: "commitment", made: "Note a promise or deadline" },
  { object: "capture", made: "Log a thought or a file" },
  { object: "artifact", made: "Write a brief or document" },
  { object: "receipt", made: "Anything that actually ran" },
];

export function AskDestinationsNote({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("text-[11px] text-muted-foreground", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Where things from Ask end up
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 pl-4">
          {ROUTES.map((r) => (
            <li key={r.object} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-foreground/85">{r.made}</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="text-foreground/70">
                {CANONICAL_NOUN[r.object]} in {OBJECT_HOME[r.object].label}
              </span>
            </li>
          ))}
          <li className="pt-0.5 text-[10px] italic text-muted-foreground/70">
            Ask only drafts. Approving and executing happens in Actions.
          </li>
        </ul>
      )}
    </div>
  );
}
