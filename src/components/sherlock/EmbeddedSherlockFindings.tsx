// EmbeddedSherlockFindings — drop-in slot that surfaces durable pending
// Sherlock findings for a specific source object (commitment, note, action,
// file, etc.). Renders nothing when there are no pending findings, so it
// stays out of the way until Sherlock has something to say.
//
// Doctrine: read-only of `sherlock_findings`. Never triggers AI. Accept/edit/
// dismiss flow through `SherlockFindingCard` which uses lifecycle helpers.
import { useSherlockFindings } from "@/hooks/useSherlockFindings";
import { SherlockFindingCard } from "./SherlockFindingCard";
import type { SherlockSourceType } from "@/lib/sherlock/types";
import { cn } from "@/lib/utils";

export function EmbeddedSherlockFindings({
  sourceType,
  sourceId,
  className,
  max = 3,
  compact = true,
}: {
  sourceType: SherlockSourceType | string;
  sourceId: string | null | undefined;
  className?: string;
  max?: number;
  compact?: boolean;
}) {
  const { findings, refresh } = useSherlockFindings(sourceType, sourceId, { status: "pending" });
  if (!sourceId || findings.length === 0) return null;

  return (
    <div className={cn("mt-2 space-y-1.5", className)}>
      {findings.slice(0, max).map((f) => (
        <SherlockFindingCard key={f.id} finding={f} onChanged={refresh} compact={compact} />
      ))}
      {findings.length > max && (
        <p className="text-[10.5px] text-muted-foreground">
          +{findings.length - max} more in Sherlock
        </p>
      )}
    </div>
  );
}
