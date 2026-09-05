// SourceHealthStrip — proof of life, and it stays put.
//
// One line per feed Vanta reads, with the word first and the evidence under it.
// It persists until reality changes, so nothing important depends on catching a
// disappearing message. Nothing here connects, disconnects or runs anything.
import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import { MachineLabel } from "@/components/ui/instrument";
import { HEALTH_LABEL, HEALTH_LAMP, healthSummary, needsAttention, type SourceHealth } from "@/lib/sourceHealth";
import { MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function SourceHealthStrip({
  sources,
  loading,
  className,
}: {
  sources: SourceHealth[];
  loading?: boolean;
  className?: string;
}) {
  /* Opens itself only when something genuinely needs a look. */
  const [open, setOpen] = useState(() => needsAttention(sources));
  if (loading && sources.length === 0) return null;
  if (sources.length === 0) return null;

  return (
    <section className={cn("vanta-inset px-3 py-2", className)} aria-label="Feed health">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn("flex w-full items-center gap-1.5 text-left", MOTION_FOCUS)}
      >
        <Activity className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <MachineLabel className="text-foreground/70">Feeds</MachineLabel>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">{healthSummary(sources)}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <ul className="mt-2 space-y-1.5">
          {sources.map((s) => (
            <li key={s.key} className={cn("flex items-start gap-2", MOTION_ROW)}>
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", HEALTH_LAMP[s.state])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-snug text-foreground">
                  {s.label} · <span className="text-foreground/80">{HEALTH_LABEL[s.state]}</span>
                </p>
                <p className="text-[11px] leading-snug text-muted-foreground">{s.line}</p>
                <p className="vanta-machine text-[10px] tracking-[0.08em] text-muted-foreground/70">{s.proof}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
