import { cn } from "@/lib/utils";

export type DotTone = "primary" | "accent" | "warn" | "muted" | "destructive";

const TONE: Record<DotTone, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  warn: "bg-warn",
  muted: "bg-muted-foreground/40",
  destructive: "bg-destructive",
};

/**
 * StatusDot — shared 6px dot used across Awareness, Sherlock, Memory, Intake
 * to communicate freshness / confidence / status uniformly.
 */
export function StatusDot({
  tone = "muted",
  pulse = false,
  className,
  title,
}: {
  tone?: DotTone;
  pulse?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      aria-hidden={!title}
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
        TONE[tone],
        pulse && "animate-pulse",
        className,
      )}
    />
  );
}

/** Map a 0-1 similarity score to a tone. */
export function similarityTone(sim: number): DotTone {
  if (sim >= 0.7) return "primary";
  if (sim >= 0.5) return "accent";
  return "warn";
}

/** Map a confidence label to a tone. */
export function confidenceTone(c?: string | null): DotTone {
  switch ((c ?? "").toLowerCase()) {
    case "high": return "primary";
    case "medium": case "med": return "accent";
    case "low": return "warn";
    default: return "muted";
  }
}

/** Map an ingestion/file status to a tone. */
export function ingestStatusTone(s: string): DotTone {
  switch (s) {
    case "done": case "ready": case "ingested": return "primary";
    case "pending": case "processing": case "queued": return "accent";
    case "failed": case "error": return "destructive";
    default: return "muted";
  }
}
