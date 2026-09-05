import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { agoPhrase, type Shelf, type ShelfLine } from "@/lib/awarenessShelves";

type Props = {
  shelves: Shelf[];
  onOpenSection: (section: string) => void;
  className?: string;
};

/**
 * Four shelves, fixed order, at most three lines each. Presentation only —
 * every word was decided in awarenessShelves.
 */
export function AwarenessShelves({ shelves, onOpenSection, className }: Props) {
  return (
    <div className={cn("space-y-3", className)}>
      {shelves.map((shelf) => (
        <section key={shelf.key} className="vanta-card rounded-xl p-3">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {shelf.label}
          </div>
          {shelf.lines.length === 0 ? (
            <p className="text-[12px] leading-snug text-muted-foreground">{shelf.quiet}</p>
          ) : (
            <ul className="space-y-1.5">
              {shelf.lines.map((line) => (
                <li key={line.key}>
                  <Line line={line} onOpenSection={onOpenSection} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function Line({ line, onOpenSection }: { line: ShelfLine; onOpenSection: (s: string) => void }) {
  const body = (
    <>
      <div className="flex min-w-0 items-start gap-1.5">
        {line.tone === "warn" && <AlertTriangle className="mt-[2px] h-3.5 w-3.5 shrink-0 text-warn" />}
        <span className={cn("text-[12.5px] font-medium leading-snug", line.tone === "warn" ? "text-warn" : "text-foreground/90")}>
          {line.text}
        </span>
        {line.section && <ChevronRight className="ml-auto mt-[2px] h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      </div>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{line.detail}</p>
      {line.at && (
        <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-muted-foreground/80">
          {agoPhrase(line.at)}
        </p>
      )}
    </>
  );
  if (!line.section) return <div className="rounded-lg px-0.5 py-0.5">{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpenSection(line.section!)}
      className="w-full rounded-lg px-0.5 py-1 text-left transition-colors hover:bg-surface-elevated/60"
    >
      {body}
    </button>
  );
}
