// CaptureEventGroup — one row for a run of identical bridge events.
//
// Three "booking state changed" arrivals for the same booking are one fact
// with three receipts, not three things to read. The group states the count,
// the booking and the strongest status; expanding shows each capture in full
// with all its normal actions. Nothing is hidden and nothing executes here.
import { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  bangkokTime, dispositionChipClass, dispositionLabel,
  type EventDisposition,
} from "@/lib/campEvents";
import type { IntakeRow } from "./useIntakeFeed";
import type { ReactNode } from "react";

export type CaptureUnit =
  | { kind: "single"; item: IntakeRow }
  | { kind: "group"; key: string; label: string; items: IntakeRow[] };

const WEIGHT: Record<EventDisposition, number> = {
  error: 5, missing_data: 4, action_suggested: 3, needs_review: 2, no_action: 1, synced: 0,
};

/** Collapse repeated bridge events (same platform + event type + booking). */
export function groupCaptures(items: IntakeRow[]): CaptureUnit[] {
  const counts = new Map<string, IntakeRow[]>();
  for (const i of items) {
    const key = i.event?.groupKey;
    if (!key) continue;
    const list = counts.get(key);
    if (list) list.push(i);
    else counts.set(key, [i]);
  }
  const emitted = new Set<string>();
  const units: CaptureUnit[] = [];
  for (const i of items) {
    const key = i.event?.groupKey;
    if (!key || (counts.get(key)?.length ?? 0) < 2) {
      units.push({ kind: "single", item: i });
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    const group = counts.get(key)!;
    units.push({ kind: "group", key, label: i.event!.groupLabel, items: group });
  }
  return units;
}

/**
 * Plain-English names for grouped bridge events. Machine names pluralized
 * naively produced "16 guest message receiveds" — a headline nobody would
 * write. Known kinds get real English; anything unknown pluralizes the noun at
 * the front of the phrase, never the verb at the end.
 */
const EVENT_PHRASE: Record<string, { one: string; many: string }> = {
  "booking.state_changed": { one: "booking update", many: "booking updates" },
  "booking.created": { one: "new booking", many: "new bookings" },
  "booking.cancelled": { one: "cancelled booking", many: "cancelled bookings" },
  "guest.message_received": { one: "guest message", many: "guest messages" },
  "guest_message.received": { one: "guest message", many: "guest messages" },
  "guest_message.sent": { one: "guest reply", many: "guest replies" },

  "payment.received": { one: "payment", many: "payments" },
  "payment.failed": { one: "failed payment", many: "failed payments" },
  "waiver.signed": { one: "signed waiver", many: "signed waivers" },
};

export function eventPhrase(eventType: string, n: number) {
  const known = EVENT_PHRASE[eventType];
  if (known) return `${n} ${n === 1 ? known.one : known.many}`;
  const words = eventType.replace(/[._]/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return `${n} updates`;
  const head = n === 1 ? words[0] : `${words[0]}s`;
  return `${n} ${[head, ...words.slice(1)].join(" ")}`;
}


export function CaptureEventGroup({
  label,
  items,
  renderItem,
}: {
  label: string;
  items: IntakeRow[];
  renderItem: (item: IntakeRow) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const first = items[0].event!;
  const worst = items.reduce<EventDisposition>(
    (acc, i) => (WEIGHT[i.event!.disposition] > WEIGHT[acc] ? i.event!.disposition : acc),
    "synced",
  );
  const headline = eventPhrase(first.eventType, items.length);

  return (
    <div className="rounded-lg border border-border/60 bg-surface-elevated/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">{headline}</p>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] ring-1", dispositionChipClass(worst))}>
              {dispositionLabel(worst)}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-snug text-foreground/80">{first.summary}</p>
          <p className="mt-1 text-[10.5px] text-muted-foreground">
            {label} · latest {bangkokTime(items[0].ts)}
          </p>
        </div>
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/50 p-2">
          {items.map((i) => (
            <div key={i.id}>{renderItem(i)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
