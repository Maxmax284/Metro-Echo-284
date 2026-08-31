// ContextSourceLine — the visible half of honest time and place.
//
// It renders one quiet line saying where a time or place came from, and marks
// an inference as an inference. It reads nothing and decides nothing.
import { Clock, MapPin } from "lucide-react";
import {
  inferenceNote,
  placeSourceLine,
  timeSourceLine,
  type Confidence,
  type PlaceSource,
  type TimeSource,
} from "@/lib/honestContext";
import { cn } from "@/lib/utils";

export function TimeSourceLine({
  timezone,
  source,
  confidence,
  className,
}: {
  timezone: string | null | undefined;
  source: TimeSource;
  confidence?: Confidence;
  className?: string;
}) {
  const note = inferenceNote(source, confidence);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground", className)}>
      <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
      {timeSourceLine({ timezone, source, confidence })}
      {note && <span className="italic text-muted-foreground/70">{note}</span>}
    </span>
  );
}

export function PlaceSourceLine({
  label,
  source,
  confidence,
  className,
}: {
  label?: string | null;
  source: PlaceSource;
  confidence?: Confidence;
  className?: string;
}) {
  const note = inferenceNote(source, confidence);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1 text-[10.5px] text-muted-foreground", className)}>
      <MapPin className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
      {placeSourceLine({ label, source, confidence })}
      {note && <span className="italic text-muted-foreground/70">{note}</span>}
    </span>
  );
}
