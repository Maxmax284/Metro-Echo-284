// CardMeta — the one line every important card carries.
//
// It answers three questions and nothing else: what is this, what state is it
// in, where does it open. One line, truncating, no new badges. If a surface
// wants a fourth fact it belongs in the card body, not here.
import { cardMetaLine, type VantaObject } from "@/lib/vantaNouns";
import { cn } from "@/lib/utils";

export function CardMeta({
  object,
  state,
  destination,
  opensIn = true,
  source,
  className,
}: {
  object: VantaObject;
  /** Plain-English state, already read off a real record. */
  state?: string | null;
  /** Override the destination label when the card opens somewhere unusual. */
  destination?: string | null;
  /** false for cards that unfold in place. */
  opensIn?: boolean;
  /** Optional provenance fragment, appended as the one source marker. */
  source?: string | null;
  className?: string;
}) {
  const line = cardMetaLine({ object, state, destination, opensIn });
  return (
    <p
      className={cn(
        "vanta-machine truncate text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
    >
      {source ? `${line} · ${source}` : line}
    </p>
  );
}
