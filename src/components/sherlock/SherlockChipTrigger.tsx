// SherlockChipTrigger — drop-in chip that surfaces a Sherlock operation on a
// card. If a cached result exists, the chip shows a short summary derived
// from it. If not, it shows the operation name as an "Analyze" affordance.
// Tapping opens the overlay (which fetches on demand). No automatic AI calls.
import { useSherlockCache, type SherlockOperation } from "@/hooks/useSherlockCache";
import { useSherlock } from "./SherlockContext";
import { SherlockSuggestionChip } from "./SherlockSuggestionChip";
import { vantaSay } from "@/lib/vantaVoice";

type EntityType = "message" | "note" | "action" | "commitment" | "briefing" | "file" | "freeform";

export function SherlockChipTrigger({
  operation,
  entityType,
  entityId,
  text,
  title,
  className,
  showWhenEmpty = true,
}: {
  operation: SherlockOperation;
  entityType: EntityType;
  entityId?: string | null;
  text: string;
  title?: string;
  className?: string;
  /** If false, render nothing when there's no cached finding. */
  showWhenEmpty?: boolean;
}) {
  const { openSherlock } = useSherlock();
  const { cached } = useSherlockCache(operation, entityType, entityId);

  const f: any = cached?.findings ?? null;
  const confidence = cached?.confidence ?? f?.confidence ?? null;

  let label: string = vantaSay.sherlock.operation[operation as keyof typeof vantaSay.sherlock.operation];
  if (f) {
    if (operation === "suggest" && f.suggested_route) label = `→ ${f.suggested_route}`;
    else if (operation === "observe" && f.kind) label = String(f.kind);
    else if (operation === "extract" && (f.document_type || f.summary)) label = String(f.document_type ?? "Extracted");
    else if (operation === "relate") label = vantaSay.sherlock.relatedCount(f.related?.length ?? 0);
  } else if (!showWhenEmpty) {
    return null;
  }

  return (
    <SherlockSuggestionChip
      operation={operation}
      label={label}
      confidence={confidence}
      className={className}
      onOpen={() =>
        openSherlock(
          { entity_type: entityType, entity_id: entityId ?? null, text, title, operation },
          f ?? undefined,
        )
      }
    />
  );
}
