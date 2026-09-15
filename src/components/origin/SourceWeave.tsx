// SourceWeave — tap a source, see what it actually contributes, then watch the
// separate facts collapse into one conclusion. Keyboard reachable; no motion
// required to read it.
import { useState } from "react";
import { cn } from "@/lib/utils";

const SOURCES = [
  { id: "calendar", label: "Calendar", fact: "Appointment moved from 2:00 to 4:00.", live: true },
  { id: "mail", label: "Mail", fact: "The clinic emailed a new address — 2nd floor, different block.", live: true },
  { id: "drive", label: "Drive", fact: "Your intake form is the newest file in that folder.", live: true },
  { id: "place", label: "Location", fact: "You are 16 km out; traffic makes it 24 minutes, not 17.", live: true },
  { id: "body", label: "Body", fact: "You slept 5h 20m and trained this morning.", live: false },
];

export function SourceWeave() {
  const [open, setOpen] = useState<string[]>([]);
  const toggle = (id: string) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const all = open.length >= 3;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            aria-pressed={open.includes(s.id)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-[12px] font-medium transition-colors",
              open.includes(s.id)
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border/70 bg-card/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
            {!s.live && <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">soon</span>}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {SOURCES.filter((s) => open.includes(s.id)).map((s) => (
          <li key={s.id} className="rounded-lg border border-border/60 bg-card/70 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">{s.label}</p>
            <p className="text-[13px] text-foreground/90">{s.fact}</p>
          </li>
        ))}
      </ul>

      <div
        className={cn(
          "rounded-xl border p-4 transition-all duration-500",
          all ? "border-primary/50 bg-primary/10 opacity-100" : "border-dashed border-border/60 opacity-60",
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Echo</p>
        <p className="mt-1 text-[15px] leading-relaxed">
          {all
            ? "Your appointment is now 4:00 at the new address, your form is ready, and you should leave by 3:20."
            : "Pick a few sources. Echo does not read them out one by one — it answers once."}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">Conclusion first. “Why this?” is one tap behind it.</p>
      </div>
    </div>
  );
}
