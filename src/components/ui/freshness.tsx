// FreshnessLine — "Checked 4 min ago".
//
// This closes the gap between "nothing is happening" and "this might be
// broken". Section level only, never per row. It re-reads the clock on a slow
// tick so a room left open does not lie about how recent it is.
import { useEffect, useState } from "react";
import { freshnessLabel } from "@/lib/vantaNouns";
import { cn } from "@/lib/utils";

export function FreshnessLine({
  at,
  verb = "Checked",
  className,
}: {
  /** Epoch ms of the last real read. Null while nothing has been read yet. */
  at: number | null | undefined;
  verb?: "Checked" | "Updated" | "Synced";
  className?: string;
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!at) return;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [at]);

  const label = freshnessLabel(at, { verb });
  if (!label) return null;

  return (
    <span
      className={cn("vanta-machine shrink-0 text-[10px] tracking-[0.08em] text-muted-foreground/80", className)}
      title={new Date(at as number).toLocaleTimeString()}
    >
      {label}
    </span>
  );
}
