// ReceiptSlip — receipts should look like receipts.
//
// A perforated slip in mono type. Lines stamp in one at a time (~40ms apart)
// like a thermal printer, then the verdict stamp lands slightly off-axis. It's
// the same audit facts as before, just presented as a printed artifact so the
// most trustworthy surface in Metro Echo is also the coolest one.
import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/brand";

export type SlipLine = { label: string; value: string; tone?: "default" | "muted" | "accent" };

export function ReceiptSlip({
  title,
  meta,
  lines,
  stamp,
  className,
}: {
  /** What happened, in plain English. */
  title: string;
  /** Secondary line under the title (exact time, timezone). */
  meta?: string;
  lines: SlipLine[];
  /** Short verdict word: EXECUTED, LOGGED, ROLLED BACK. */
  stamp?: string;
  className?: string;
}) {
  return (
    <div className={cn("vanta-slip relative rounded-md bg-muted/20 px-3 pb-3 pt-4", className)}>
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {PRODUCT_NAME} · receipt
      </div>
      <div className="mt-1 font-mono text-[12.5px] leading-snug text-foreground/95">{title}</div>
      {meta && <div className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">{meta}</div>}

      <div className="my-2.5 border-t border-dashed border-border/60" />

      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li
            key={`${l.label}-${i}`}
            className="vanta-slip-line flex items-baseline justify-between gap-3 font-mono text-[11px] motion-reduce:animate-none"
            style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
          >
            <span className="shrink-0 uppercase tracking-wider text-muted-foreground">{l.label}</span>
            <span className="min-w-0 flex-1 self-center border-b border-dotted border-border/50" aria-hidden />
            <span
              className={cn(
                "shrink-0 truncate text-right",
                l.tone === "accent" ? "text-primary" : l.tone === "muted" ? "text-muted-foreground" : "text-foreground/90",
              )}
            >
              {l.value}
            </span>
          </li>
        ))}
      </ul>

      {stamp && (
        <div className="mt-3 flex justify-end">
          <span className="vanta-slip-stamp inline-block rounded-sm border border-primary/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-primary motion-reduce:animate-none">
            {stamp}
          </span>
        </div>
      )}
    </div>
  );
}
