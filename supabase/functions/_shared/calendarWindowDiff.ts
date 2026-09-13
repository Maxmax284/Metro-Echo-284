// What actually changed between two pictures of one calendar window.
//
// Pure module: no IO, no Deno globals, so the sync and the tests read exactly
// one definition of "moved". "Synced" is not news; "your Tuesday moved" is.

const DAY_MS = 86_400_000;

/** A row as it stood before this pass — the before-picture for the diff. */
export type PriorRow = { uid: string; starts_at: string; title: string | null; project_id: string | null };

export type ParsedEvent = { uid: string; title: string | null; startsAt: string };

export type CalendarChange = {
  uid: string;
  title: string | null;
  change: "added" | "moved" | "cancelled";
  oldStartsAt: string | null;
  newStartsAt: string | null;
  /** The entry was filed under a project, so the user planned around it. */
  wasFiled: boolean;
};

/** An addition is only news while it is close enough to affect the week. */
export const ADDED_HORIZON_DAYS = 7;

/**
 * Recurring entries share one uid, so the comparison works on the set of start
 * times per uid: a start that disappeared alongside one that appeared is the
 * same entry moving, not a cancellation plus an addition.
 *
 * A first sync (nothing held before) is a baseline, never a wall of "added".
 */
export function diffWindow(prior: PriorRow[], events: ParsedEvent[], now: number): CalendarChange[] {
  if (prior.length === 0) return [];

  // The stored copy and the freshly parsed copy write the same instant
  // differently ("2026-09-14 20:00:00+00" vs "2026-09-14T20:00:00.000Z").
  // Compare instants, never strings, or every sync invents a move.
  const at = (v: string) => {
    const ms = new Date(v).getTime();
    return Number.isFinite(ms) ? String(ms) : v;
  };

  const before = new Map<string, PriorRow[]>();
  for (const r of prior) {
    const list = before.get(r.uid) ?? [];
    list.push(r);
    before.set(r.uid, list);
  }
  const after = new Map<string, ParsedEvent[]>();
  for (const e of events) {
    const list = after.get(e.uid) ?? [];
    list.push(e);
    after.set(e.uid, list);
  }

  const out: CalendarChange[] = [];
  const addedCutoff = now + ADDED_HORIZON_DAYS * DAY_MS;

  for (const uid of new Set([...before.keys(), ...after.keys()])) {
    const wasList = before.get(uid) ?? [];
    const isList = after.get(uid) ?? [];
    const isStarts = new Set(isList.map((e) => at(e.startsAt)));
    const wasStarts = new Set(wasList.map((r) => at(r.starts_at)));

    const gone = wasList
      .filter((r) => !isStarts.has(at(r.starts_at)))
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const fresh = isList
      .filter((e) => !wasStarts.has(at(e.startsAt)))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const wasFiled = wasList.some((r) => !!r.project_id);
    const title = isList[0]?.title ?? wasList[0]?.title ?? null;

    const paired = Math.min(gone.length, fresh.length);
    for (let i = 0; i < paired; i++) {
      if (at(gone[i].starts_at) === at(fresh[i].startsAt)) continue;
      out.push({ uid, title, change: "moved", oldStartsAt: gone[i].starts_at, newStartsAt: fresh[i].startsAt, wasFiled });
    }
    for (const r of gone.slice(paired)) {
      out.push({ uid, title: r.title ?? title, change: "cancelled", oldStartsAt: r.starts_at, newStartsAt: null, wasFiled });
    }
    for (const e of fresh.slice(paired)) {
      const startMs = new Date(e.startsAt).getTime();
      if (!Number.isFinite(startMs) || startMs > addedCutoff) continue;
      out.push({ uid, title: e.title ?? title, change: "added", oldStartsAt: null, newStartsAt: e.startsAt, wasFiled });
    }
  }

  return out;
}
