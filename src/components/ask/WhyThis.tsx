// WhyThis — the honest footnote under an Echo answer.
//
// Doctrine: an answer that names its sources can be argued with. This renders
// ONLY the reads the server actually performed and reported back with the turn
// (`metadata.reads`). No reads, no button — Echo never claims a lookup it did
// not run, and this component cannot invent one because it has no other input.
import { useState } from "react";
import { Search } from "lucide-react";

export function WhyThis({ reads }: { reads?: string[] | null }) {
  const [open, setOpen] = useState(false);
  const lines = (reads ?? []).filter((l) => l && l.trim().length > 0);
  if (lines.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="vanta-focus inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="h-3 w-3 text-primary/70" />
        {open ? "Hide what Echo read" : "Why this?"}
      </button>
      {open && (
        <ul className="motion-fade mt-1.5 space-y-1 border-l-2 border-primary/30 pl-2.5">
          {lines.map((l, i) => (
            <li key={i} className="text-[11.5px] leading-relaxed text-muted-foreground">
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
