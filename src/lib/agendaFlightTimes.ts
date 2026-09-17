// agendaFlightTimes — the day rail told the truth by the provider, not by the plan.
//
// Doctrine:
//   - A filed flight carries the hours the person wrote down. A provider reading
//     carries the hours the flight is actually keeping. When the provider spoke,
//     the rail follows the provider and says so.
//   - Nothing is invented. No estimate, no gate, no arrival unless the reading
//     carried one. A missing time leaves the planned time standing, unlabelled.
//   - A scheduled time is not news: only an actual or estimated time moves a
//     marker, and a move under a minute is not a move.
//   - Cancelled and diverted flights keep their hours. The reading says what
//     happened; it does not pretend a new departure exists.
//
// Pure module: no IO, no React.

import type { BoardEntry } from "@/lib/agendaBoard";

/** What a provider reading adds to one rail marker. */
export type EntryLive = {
  /** The provider's own word: scheduled, active, landed, cancelled, diverted. */
  status: string | null;
  gate: string | null;
  terminal: string | null;
  /** Minutes this marker moved against the filed time. Null when it did not. */
  movedMinutes: number | null;
  /** When the reading was taken — a status is always a reading with a time on it. */
  checkedAt: string | null;
};

export type LiveBoardEntry = BoardEntry & { live?: EntryLive | null };

type LiveEndish = {
  gate?: unknown;
  terminal?: unknown;
  scheduled?: unknown;
  estimated?: unknown;
  actual?: unknown;
};

type PlanLike = {
  event_ids?: unknown;
  live_status?: unknown;
  live_checked_at?: unknown;
};

function text(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
}

function instant(v: unknown): string | null {
  const iso = text(v);
  if (!iso) return null;
  return Number.isFinite(new Date(iso).getTime()) ? iso : null;
}

/** The hour the provider is actually keeping: what happened, else what it expects. */
function keptTime(raw: unknown): string | null {
  const end = (raw ?? {}) as LiveEndish;
  return instant(end.actual) ?? instant(end.estimated);
}

function movedMinutes(planned: string | null, kept: string | null): number | null {
  if (!planned || !kept) return null;
  const from = new Date(planned).getTime();
  const to = new Date(kept).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const mins = Math.round((to - from) / 60_000);
  return mins === 0 ? null : mins;
}

/**
 * Re-time the board entries a filed flight wrote, using its last provider
 * reading. Entries no flight owns come back untouched and unlabelled.
 */
export function applyLiveFlightTimes<T extends BoardEntry>(
  entries: T[],
  plans: readonly PlanLike[],
): Array<T & { live?: EntryLive | null }> {
  if (!plans.length) return entries;

  /* One pass over the flights: which entry belongs to which reading, and whether
     it is the leaving half or the landing half of that flight. */
  const owned = new Map<string, { plan: PlanLike; role: "depart" | "land" }>();
  for (const plan of plans) {
    if (!plan?.live_status) continue;
    const ids = Array.isArray(plan.event_ids) ? plan.event_ids.filter((id): id is string => typeof id === "string") : [];
    ids.forEach((id, index) => owned.set(id, { plan, role: index === 0 ? "depart" : "land" }));
  }
  if (!owned.size) return entries;

  return entries.map((entry) => {
    const match = owned.get(entry.id);
    if (!match) return entry;
    const live = (match.plan.live_status ?? {}) as { status?: unknown; departure?: unknown; arrival?: unknown };
    const checkedAt = instant(match.plan.live_checked_at) ?? instant((live as { checked_at?: unknown }).checked_at);
    const status = text(live.status);
    const departure = (live.departure ?? {}) as LiveEndish;
    const arrival = (live.arrival ?? {}) as LiveEndish;
    const keptDepart = keptTime(departure);
    const keptArrive = keptTime(arrival);

    const held = status === "cancelled" || status === "diverted";
    const anchorPlanned = match.role === "depart" ? entry.starts_at : entry.starts_at;
    const anchorKept = match.role === "depart" ? keptDepart : keptArrive;
    const moved = held ? null : movedMinutes(anchorPlanned, anchorKept);

    const stamp: EntryLive = {
      status,
      gate: text(match.role === "depart" ? departure.gate : arrival.gate),
      terminal: text(match.role === "depart" ? departure.terminal : arrival.terminal),
      movedMinutes: moved,
      checkedAt,
    };

    if (held || !anchorKept) return { ...entry, live: stamp };

    if (match.role === "depart") {
      return {
        ...entry,
        starts_at: keptDepart ?? entry.starts_at,
        ends_at: keptArrive ?? entry.ends_at,
        live: stamp,
      };
    }
    return { ...entry, starts_at: keptArrive ?? entry.starts_at, live: stamp };
  });
}

const STATUS_WORDS: Record<string, string> = {
  scheduled: "scheduled",
  active: "in the air",
  landed: "landed",
  cancelled: "cancelled",
  diverted: "diverted",
  incident: "flagged by the airline",
};

/** The short live line beside a marker. Empty when the reading said nothing new. */
export function liveMarkerWords(live: EntryLive | null | undefined): string {
  if (!live) return "";
  const bits: string[] = [];
  if (live.movedMinutes != null) {
    const mins = Math.abs(live.movedMinutes);
    bits.push(live.movedMinutes > 0 ? `${mins} min later` : `${mins} min earlier`);
  }
  if (live.gate) bits.push(`gate ${live.gate}`);
  else if (live.terminal) bits.push(`terminal ${live.terminal}`);
  if (!bits.length && live.status) bits.push(STATUS_WORDS[live.status] ?? live.status);
  return bits.join(" · ");
}
