// heldBack — what Echo decided not to interrupt you with, and why.
//
// The evaluator already records every candidate it killed and the reason it
// killed it. Until now nobody could read that. This module turns those recorded
// decisions into plain English. It infers nothing: a reason it does not
// recognise is shown as "held back" with the raw reason kept for the receipt.

export type HeldRecord = {
  signal_id?: string;
  type?: string;
  source?: string;
  suppressed?: boolean;
  suppression_reason?: string | null;
  escalated?: boolean;
  urgency?: string | null;
  score?: number | null;
};

export type HeldBackInput = {
  /** `awareness.evaluated` audit rows, newest first or not — order does not matter. */
  rows: { created_at: string; payload?: { records?: HeldRecord[] } | null }[];
  now?: number;
  /** Only decisions inside this window are read. Default 7 days. */
  windowMs?: number;
};

export type HeldBackGroup = {
  reason: string;
  /** What a person would say about it. */
  label: string;
  /** Why that rule exists, one line. */
  because: string;
  count: number;
  lastAt: string;
  /** Distinct signal types held for this reason, most recent first. */
  kinds: string[];
};

export type HeldBackRead = {
  total: number;
  groups: HeldBackGroup[];
  /** One sentence for the section head. Never claims silence when there was none. */
  sentence: string;
  empty: boolean;
};

const DAY = 86_400_000;

/* Reason wording. Every key here is a value the suppressor can actually emit. */
const REASON_COPY: Record<string, { label: string; because: string }> = {
  cooldown: {
    label: "already said recently",
    because: "Echo had raised the same thing in the last few days.",
  },
  quiet_hours: {
    label: "your quiet hours",
    because: "It arrived inside the hours you asked to be left alone.",
  },
  attention_budget: {
    label: "you'd heard enough today",
    because: "Enough had already been raised in the last day for it to wait.",
  },
  low_confidence: {
    label: "not sure enough",
    because: "Echo wasn't confident enough in the reading to raise it.",
  },
  ungrounded: {
    label: "nothing to point at",
    because: "There was no record behind it, so there was nothing to show you.",
  },
  duplicate: {
    label: "the same thing twice",
    because: "Another candidate said the same thing.",
  },
  resolved: {
    label: "sorted itself out",
    because: "It had already resolved before it reached you.",
  },
  acknowledged: {
    label: "you'd already seen it",
    because: "You had seen this one, so it wasn't raised again.",
  },
  not_important: {
    label: "you said it doesn't matter",
    because: "You marked this kind of thing as not important.",
  },
  snoozed: { label: "snoozed", because: "You asked for it later." },
  stale: { label: "too old to matter", because: "It sat unresolved long past being useful." },
  below_threshold: {
    label: "under your bar",
    because: "It didn't reach the level you set for being interrupted.",
  },
};

/** Plain-English name for a signal type, without inventing detail. */
export function kindLabel(type?: string | null): string {
  if (!type) return "something";
  return type.replace(/_/g, " ");
}

export function heldBackRead(input: HeldBackInput): HeldBackRead {
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? 7 * DAY;
  const byReason = new Map<string, HeldBackGroup>();
  let total = 0;

  for (const row of input.rows ?? []) {
    const at = new Date(row.created_at).getTime();
    if (!Number.isFinite(at) || now - at > windowMs) continue;
    for (const rec of row.payload?.records ?? []) {
      if (!rec?.suppressed) continue;
      const reason = rec.suppression_reason ?? "unknown";
      total++;
      const copy = REASON_COPY[reason];
      const existing = byReason.get(reason);
      const kind = kindLabel(rec.type);
      if (existing) {
        existing.count++;
        if (at > new Date(existing.lastAt).getTime()) existing.lastAt = row.created_at;
        if (!existing.kinds.includes(kind)) existing.kinds.push(kind);
      } else {
        byReason.set(reason, {
          reason,
          label: copy?.label ?? "held back",
          because: copy?.because ?? `Recorded reason: ${reason}.`,
          count: 1,
          lastAt: row.created_at,
          kinds: [kind],
        });
      }
    }
  }

  const groups = [...byReason.values()].sort(
    (a, b) => b.count - a.count || new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
  );

  const days = Math.round(windowMs / DAY);
  const sentence = total === 0
    ? `Nothing was held back in the last ${days} days — everything Echo noticed either reached you or never got that far.`
    : `${total} thing${total === 1 ? "" : "s"} Echo noticed in the last ${days} days but chose not to interrupt you with, ${
      groups.length === 1 ? "for one reason" : `across ${groups.length} reasons`
    }.`;

  return { total, groups, sentence, empty: total === 0 };
}
