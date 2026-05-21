// EmbeddedSherlockFindings — drop-in slot that surfaces durable pending
// Sherlock findings for a specific source object (commitment, note, action,
// file, etc.). Renders nothing when there are no pending findings, so it
// stays out of the way until Sherlock has something to say.
//
// Doctrine: read-only of `sherlock_findings`. Never triggers AI. Accept/edit/
// dismiss flow through `SherlockFindingCard` which uses lifecycle helpers.
import { useSherlockFindings } from "@/hooks/useSherlockFindings";
import { SherlockFindingCard } from "./SherlockFindingCard";
import { MarkSensitiveButton } from "./MarkSensitiveButton";
import type { SherlockSourceType } from "@/lib/sherlock/types";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function EmbeddedSherlockFindings({
  sourceType,
  sourceId,
  className,
  max = 3,
  compact = true,
  allowMarkSensitive = true,
}: {
  sourceType: SherlockSourceType | string;
  sourceId: string | null | undefined;
  className?: string;
  max?: number;
  compact?: boolean;
  allowMarkSensitive?: boolean;
}) {
  const { user } = useAuth();
  const { findings, refresh } = useSherlockFindings(sourceType, sourceId, { status: "pending" });
  if (!sourceId || findings.length === 0) return null;

  const anySensitive = findings.some((f) => f.sensitive_flag);

  return (
    <div className={cn("mt-2 space-y-1.5", className)}>
      {findings.slice(0, max).map((f) => (
        <SherlockFindingCard key={f.id} finding={f} onChanged={refresh} compact={compact} />
      ))}
      <div className="flex items-center justify-between gap-2">
        {findings.length > max ? (
          <p className="text-[10.5px] text-muted-foreground">
            +{findings.length - max} more in Sherlock
          </p>
        ) : <span />}
        {allowMarkSensitive && user?.id && (
          <MarkSensitiveButton
            userId={user.id}
            sourceObjectType={sourceType}
            sourceObjectId={sourceId}
            sensitive={anySensitive}
            onChanged={refresh}
          />
        )}
      </div>
    </div>
  );
}
