// GlossaryPanel — the plain-English meaning of every noun the UI uses.
//
// Doctrine: written, not generated. The hard part isn't defining "Action", it's
// saying how it differs from the noun next to it, which is why each entry can
// carry a "not the same as" line. Nothing here reads state.
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { GLOSSARY } from "@/lib/vantaNouns";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function GlossaryPanel({
  className,
  /** Hide the filter when the panel is short or embedded somewhere tight. */
  filterable = true,
}: {
  className?: string;
  filterable?: boolean;
}) {
  const [q, setQ] = useState("");
  const entries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return GLOSSARY;
    return GLOSSARY.filter((e) =>
      `${e.term} ${e.means} ${e.notThe ?? ""}`.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <div className={cn("space-y-2.5", className)}>
      {filterable && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a word"
            aria-label="Filter the glossary"
            className="h-9 pl-8 text-[13px] placeholder:text-muted-foreground"
          />
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No word matches that. Every noun Echo uses is in this list — try a shorter search.
        </p>
      ) : (
        <dl className="space-y-2.5">
          {entries.map((e) => (
            <div key={e.term} className="border-l-2 border-border/60 pl-2.5">
              <dt className="text-[12.5px] font-medium text-foreground">{e.term}</dt>
              <dd className="text-[12px] leading-relaxed text-muted-foreground">
                {e.means}
                {e.notThe && (
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground/80">
                    {e.notThe}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
