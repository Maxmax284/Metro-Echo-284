// SituationRead — the first thing a person reads in Today.
//
// One situational read instead of five separate source reports: a headline,
// at most three lines ranked by consequence, and one honest sentence about the
// sources that were quiet or unreadable. Every line says where it came from,
// how fresh it is, and — on tap — why it is here at all.
//
// It renders recorded state only. It never executes, never scores, and never
// turns missing data into a zero.
import { useState } from "react";
import { ChevronDown, Radio } from "lucide-react";
import { MachineLabel } from "@/components/ui/instrument";
import { ProvenanceStrip } from "@/components/ui/provenance";
import { Button } from "@/components/ui/button";
import { SOURCE_LABEL, quietLine, unknownLine, type SituationLine, type SituationRead as Read } from "@/lib/situation";
import { MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { cn } from "@/lib/utils";

const OPEN_LABEL: Record<SituationLine["kind"], string> = {
  overdue: "Open commitment",
  waiting_on_you: "Review changes",
  meeting_soon: "Open schedule",
  due_soon: "Open commitment",
  noticed: "See what Vanta noticed",
  went_unusually_quiet: "Open project",
  arrived: "Open inbox",
};

function Line({
  line,
  onOpen,
}: {
  line: SituationLine;
  onOpen?: (line: SituationLine) => void;
}) {
  const [why, setWhy] = useState(false);

  return (
    <li className={cn("border-t border-border/40 py-2.5 first:border-t-0 first:pt-0", MOTION_ROW)}>
      <p className="text-sm leading-snug text-foreground">{line.text}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ProvenanceStrip source={line.source} at={line.at} />
        <button
          type="button"
          onClick={() => setWhy((v) => !v)}
          aria-expanded={why}
          className={cn(
            "vanta-machine inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 hover:text-foreground",
            MOTION_FOCUS,
          )}
        >
          Why this?
          <ChevronDown className={cn("h-3 w-3 transition-transform", why && "rotate-180")} aria-hidden />
        </button>
        {onOpen ? (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-[11px]"
            onClick={() => onOpen(line)}
          >
            {OPEN_LABEL[line.kind]}
          </Button>
        ) : null}
      </div>

      {why ? (
        <div className="mt-1.5 space-y-1 border-l border-border/60 pl-2.5 text-[11.5px] leading-snug text-muted-foreground">
          <p>{line.reason}</p>
          <p>Read from {SOURCE_LABEL[line.source]}.</p>
          {line.baseline?.line ? <p>{line.baseline.line}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

export function SituationRead({
  read,
  loading,
  onOpen,
  className,
}: {
  read: Read | null;
  loading?: boolean;
  onOpen?: (line: SituationLine) => void;
  className?: string;
}) {
  if (loading && !read) {
    return (
      <p className={cn("vanta-machine text-[11px] tracking-[0.08em] text-muted-foreground/80", className)}>
        Reading your day…
      </p>
    );
  }
  if (!read) return null;

  const quiet = quietLine(read.quietSources);
  const unknown = unknownLine(read.unknownSources);

  return (
    <section className={cn("space-y-2", className)} aria-label="What matters right now">
      <div className="flex items-center gap-1.5">
        <Radio className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <MachineLabel className="text-foreground/70">What matters right now</MachineLabel>
      </div>

      <p className="text-[15px] font-medium leading-snug text-foreground">{read.headline}</p>

      {read.lines.length > 0 ? (
        <ul className="mt-1">
          {read.lines.map((line) => (
            <Line key={`${line.kind}-${line.entity?.id ?? line.source}`} line={line} onOpen={onOpen} />
          ))}
        </ul>
      ) : null}

      {quiet || unknown ? (
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          {[quiet, unknown].filter(Boolean).join(" ")}
        </p>
      ) : null}
    </section>
  );
}
