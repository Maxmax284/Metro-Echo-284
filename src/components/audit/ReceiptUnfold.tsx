// ReceiptUnfold — the receipt opening in place.
//
// Doctrine: Receipts is evidence, not another list. A receipt answers four
// things and nothing more: what changed, before and after, who or what did it,
// and whether it was reversed. Everything shown here comes off the recorded
// payload — nothing is inferred, and unknown fields simply do not appear.
import { MachineText } from "@/components/ui/instrument";
import { Button } from "@/components/ui/button";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";

export type ReceiptFacts = {
  /** Short plain-English read of what changed. */
  what: string;
  before?: string | null;
  after?: string | null;
  actor?: string | null;
  source?: string | null;
  reversed: boolean;
};

const REVERSAL = /(rollback|rolled_back|reversed|undo|undone|reverted)/i;

function pick(payload: unknown, keys: string[]): string | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
  }
  return null;
}

/** Read the four facts off an audit row. Missing facts stay missing. */
export function receiptFacts(row: {
  event: string;
  entity_type: string;
  payload?: unknown;
}, what: string): ReceiptFacts {
  const p = row.payload;
  return {
    what,
    before: pick(p, ["before", "from", "from_status", "previous", "old"]),
    after: pick(p, ["after", "to", "to_status", "next", "new", "status"]),
    actor: pick(p, ["actor", "by", "user", "requested_by"]),
    source: pick(p, ["source", "channel", "origin", "via"]),
    reversed: REVERSAL.test(row.event) || pick(p, ["reversed", "rolled_back"]) === "true",
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="vanta-machine-label w-[4.5rem] shrink-0 text-muted-foreground/70">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[12px] text-foreground/90">{value}</span>
    </div>
  );
}

export function ReceiptUnfold({
  facts,
  at,
  timezone,
  onOpenFull,
  className,
}: {
  facts: ReceiptFacts;
  at: string;
  timezone: string;
  onOpenFull: () => void;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-border/50 px-3 py-2.5", className)}>
      <div className="space-y-1.5">
        <Fact label="Changed" value={facts.what} />
        {facts.before || facts.after ? (
          <Fact
            label="Before → after"
            value={`${facts.before ?? "—"} → ${facts.after ?? "—"}`}
          />
        ) : null}
        {facts.actor ? <Fact label="Who" value={facts.actor} /> : null}
        {facts.source ? <Fact label="Source" value={facts.source} /> : null}
        <div className="flex gap-2">
          <span className="vanta-machine-label w-[4.5rem] shrink-0 text-muted-foreground/70">When</span>
          <MachineText className="text-[11px] text-muted-foreground">
            {formatInTimeZone(new Date(at), timezone, "d MMM HH:mm:ss")} · {timezone}
          </MachineText>
        </div>
        {facts.reversed ? (
          <p className="text-[11px] text-warn">This change was reversed. The reversal has its own receipt.</p>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="mt-2 h-8 px-2 text-[11px] text-muted-foreground"
        onClick={onOpenFull}
      >
        Full detail
      </Button>
    </div>
  );
}
