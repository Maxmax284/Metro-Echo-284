// telegramWhy — the same trust reveal as the screen, in one chat line.
//
// Field and trip replies already say where the answer came from. Ordinary
// replies — captures, reminders, work answers — said nothing, so a person in a
// chat had to take Echo's word for it. This builds that line from recorded
// outcomes only: what routed, what was read, what is waiting. When nothing was
// recorded, it returns null rather than inventing a provenance.
import { compactWhy, whyFor, type WhySurfaced } from "./whySurfaced.ts";

export type ReplyFacts = {
  /** Lane the message was filed into, when it routed. */
  routedTo?: string | null;
  /** Classification the router recorded. */
  detectedType?: string | null;
  /** True when the answer was a read of existing records, nothing written. */
  readOnly?: boolean;
  /** True when it was filed but still needs a human look. */
  needsReview?: boolean;
  /** Plain-English names of the record sets the answer leaned on. */
  usedRecords?: string[];
  at?: string | null;
};

/** Lane names as a person would say them. */
const LANE: Record<string, string> = {
  commitments: "Commitments",
  actions: "Actions",
  memory: "Memory",
  inbox: "the Inbox",
  projects: "Projects",
  schedule: "Schedule",
  documents: "Documents",
  notes: "Notes",
};

export function laneLabel(route?: string | null): string | null {
  if (!route) return null;
  return LANE[route] ?? route.replace(/_/g, " ");
}

/** The structured reveal behind an ordinary chat reply, or null when unrecorded. */
export function replyWhy(facts: ReplyFacts): WhySurfaced | null {
  const lane = laneLabel(facts.routedTo);
  const at = facts.at ?? null;

  if (lane) {
    return whyFor({
      source: "This chat",
      whatChanged: `Your message was filed under ${lane}`,
      reason: facts.detectedType
        ? `Read as ${facts.detectedType.replace(/_/g, " ")}`
        : `Read as something that belongs in ${lane}`,
      whyItMatters: "It's on record now, so it can't fall through.",
      ifIgnored: facts.needsReview ? `It waits in ${lane} until you look at it.` : null,
      at,
    });
  }

  if (facts.readOnly) {
    const used = (facts.usedRecords ?? []).filter(Boolean);
    if (used.length === 0) return null;
    return whyFor({
      source: used.join(" and "),
      whatChanged: "Nothing — this was a read",
      reason: "You asked, so Echo looked at what's on record",
      whyItMatters: "Nothing was captured or changed by answering.",
      at,
    });
  }

  if (facts.needsReview) {
    return whyFor({
      source: "This chat",
      whatChanged: "Kept as a capture, unfiled",
      reason: "Echo wasn't confident enough to file it anywhere",
      whyItMatters: "It's waiting for you to say where it belongs.",
      ifIgnored: "It stays in captures until you do.",
      at,
    });
  }

  return null;
}

/** The chat line, or null. Never longer than the reply it explains. */
export function replyWhyLine(facts: ReplyFacts, now = Date.now()): string | null {
  const why = replyWhy(facts);
  if (!why) return null;
  return `Why this? ${compactWhy(why, now)}`;
}
