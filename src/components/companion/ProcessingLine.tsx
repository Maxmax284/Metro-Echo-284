// ProcessingLine — what Vanta is actually doing right now.
//
// Only two states are real from the client's point of view: the request is out
// and no tokens have come back yet ("reading"), or tokens are arriving
// ("writing"). No invented reasoning stages, no fake delay, no orb.
import { cn } from "@/lib/utils";

export function ProcessingLine({
  phase,
  className,
}: {
  /** reading = request sent, nothing back yet. writing = tokens arriving. */
  phase: "reading" | "writing";
  className?: string;
}) {
  const label = phase === "reading" ? "Reading your context" : "Writing";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[12px] text-muted-foreground", className)}
      aria-live="polite"
    >
      <span aria-hidden className="flex items-center gap-0.5">
        <Dot delay="0ms" />
        <Dot delay="160ms" />
        <Dot delay="320ms" />
      </span>
      {label}…
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1 w-1 rounded-full bg-primary/70 motion-breath motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  );
}
