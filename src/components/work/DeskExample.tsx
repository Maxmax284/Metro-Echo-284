// DeskExample — the greyed sample record shown while a desk is empty.
//
// Doctrine: an empty desk should teach the shape of a real record, not
// apologise. This card is built to look exactly like the real thing — same
// layout, same chips, same button row — and is unmistakably marked as an
// example. It is never written to the database, it never appears alongside real
// records, and every control on it is dead.
import { DESK_TEACHING } from "@/lib/deskTeaching";
import type { DeskKey } from "@/lib/deskRoles";
import { cn } from "@/lib/utils";

export function DeskExample({
  deskKey,
  className,
}: {
  deskKey: DeskKey;
  className?: string;
}) {
  const ex = DESK_TEACHING[deskKey].example;

  return (
    <div className={cn("mt-3", className)}>
      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-xl border border-dashed border-border/70 bg-surface-elevated/40 p-3 opacity-80"
      >
        <span className="absolute right-2 top-2 rounded-[2px] border border-border/60 bg-background/70 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
          Example · nothing is saved
        </span>

        <h4 className="pr-28 text-[13px] font-medium leading-snug text-foreground/90">
          {ex.title}
        </h4>

        {ex.lines.map((l) => (
          <p key={l} className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {l}
          </p>
        ))}

        {ex.chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {ex.chips.map((c) => (
              <span
                key={c}
                className="rounded-[2px] bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        {ex.buttons.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {ex.buttons.map((b) => (
              <span
                key={b}
                className="inline-flex min-h-[28px] items-center rounded-[2px] border border-border/50 px-2 text-[10.5px] text-muted-foreground/80"
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="mt-1.5 px-1 text-[11px] leading-snug text-muted-foreground">
        {ex.caption}
      </p>
    </div>
  );
}
