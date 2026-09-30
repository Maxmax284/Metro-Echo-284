// ProcessingLine — what Echo is actually doing right now.
//
// Only two states are real from the client's point of view: the request is out
// and no tokens have come back yet ("reading"), or tokens are arriving
// ("writing"). No invented reasoning stages, no fake delay, no orb.
//
// Visual: a thin purple signal track plus a restrained dot sequence. Both are
// alive only while the request is pending — the caller unmounts this the moment
// the request ends, so nothing keeps moving after the fact.
import { cn } from "@/lib/utils";

export function ProcessingLine({
  phase,
  label: labelOverride,
  className,
}: {
  /** reading = request sent, nothing back yet. writing = tokens arriving. */
  phase: "reading" | "writing";
  /** Plain-English override — what is genuinely being read this turn. */
  label?: string;
  className?: string;
}) {
  const label = labelOverride ?? (phase === "reading" ? "Processing" : "Writing");
  return (
    <span className={cn("inline-flex flex-col gap-1.5", className)}>
      <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground" aria-live="polite">
        <span aria-hidden className="flex items-center gap-0.5">
          <Dot delay="0ms" />
          <Dot delay="160ms" />
          <Dot delay="320ms" />
        </span>
        {label}…
      </span>
      {/* Signal track — purple because this is Echo thinking, not a status. */}
      <span
        aria-hidden
        className="relative block h-px w-28 overflow-hidden rounded-full bg-border/60"
      >
        <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent motion-signal-track motion-reduce:animate-none motion-reduce:w-full motion-reduce:opacity-60" />
      </span>
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1 w-1 rounded-full bg-accent/80 motion-breath motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  );
}
