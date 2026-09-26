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
import {
  ASK_OUTPUT,
  askDestination,
  CANONICAL_NOUN,
  type AskOutputKind,
} from "@/lib/vantaNouns";

/* The same table the confirmations use, so the promise up front and the
   confirmation afterwards can never disagree. */
const ROUTES = Object.keys(ASK_OUTPUT) as AskOutputKind[];

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
        Where things from Echo end up
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 pl-4">
          {ROUTES.map((kind) => (
            <li key={kind} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-foreground/85">{ASK_OUTPUT[kind].made}</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="text-foreground/70">
                {CANONICAL_NOUN[ASK_OUTPUT[kind].object]} in {askDestination(kind).label}
              </span>
            </li>
          ))}
          <li className="pt-0.5 text-[10px] italic text-muted-foreground/70">
            Echo only drafts. Approving and executing happens in Actions.
          </li>
        </ul>
      )}
    </div>
  );
}
