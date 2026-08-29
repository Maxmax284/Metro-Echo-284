// calendarSync — how a calendar check is reported to a person.
//
// Doctrine: "Synchronized" is not news. A sync report has to answer three
// things or it should not speak at all:
//   1. Which calendar was checked, and when.
//   2. What changed — added, moved, cancelled — not merely that it ran.
//   3. If nothing came back, WHY that might be, in words you can act on.
//
// Pure module: no IO, no toasts. The surfaces borrow the sentences.

export type FeedSyncResult = {
  feed: string;
  ok: boolean;
  label?: string;
  events?: number;
  added?: number;
  moved?: number;
  cancelled?: number;
  error?: string;
};

export type FeedStatus = {
  label: string;
  active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  event_count: number;
  last_added?: number | null;
  last_moved?: number | null;
  last_cancelled?: number | null;
};

const MIN = 60_000;
const HOUR = 60 * MIN;

/** "checked 4 min ago" — the honest age of the last look. */
export function checkedLabel(iso: string | null, now = Date.now()): string {
  if (!iso) return "never checked";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "never checked";
  const mins = Math.round(ms / MIN);
  if (mins < 1) return "checked just now";
  if (mins < 60) return `checked ${mins} min ago`;
  const hrs = Math.round(ms / HOUR);
  if (hrs < 24) return `checked ${hrs}h ago`;
  return `checked ${Math.round(hrs / 24)}d ago`;
}

/** A calendar goes stale before it goes wrong. Say which one it is. */
export type FeedState = "broken" | "off" | "stale" | "empty" | "live";

export function feedState(f: FeedStatus, now = Date.now()): FeedState {
  if (f.last_error) return "broken";
  if (!f.active) return "off";
  if (!f.last_synced_at) return "stale";
  if (now - new Date(f.last_synced_at).getTime() > 3 * HOUR) return "stale";
  if (f.event_count === 0) return "empty";
  return "live";
}

export const FEED_STATE_WORD: Record<FeedState, string> = {
  broken: "Not answering",
  off: "Paused",
  stale: "Not checked lately",
  empty: "Nothing on it",
  live: "Reading fine",
};

/**
 * The one line under a calendar's name: what it holds, what changed, when it
 * was looked at. Never jargon, never a status code.
 */
export function feedStateLine(f: FeedStatus, now = Date.now()): string {
  const state = feedState(f, now);
  if (state === "broken") return `${f.last_error} · ${checkedLabel(f.last_synced_at, now)}`;
  if (state === "off") return "Paused, so nothing from it reaches Vanta.";
  if (state === "empty") {
    return `No upcoming entries · ${checkedLabel(f.last_synced_at, now)}`;
  }
  const entries = `${f.event_count} ${f.event_count === 1 ? "entry" : "entries"}`;
  const change = changePhrase(f);
  return `${entries}${change ? ` · ${change}` : ""} · ${checkedLabel(f.last_synced_at, now)}`;
}

/** "3 new, 1 moved" from the last pass, or empty when the last pass was quiet. */
export function changePhrase(f: Pick<FeedStatus, "last_added" | "last_moved" | "last_cancelled">): string {
  const parts: string[] = [];
  if (f.last_added) parts.push(`${f.last_added} new`);
  if (f.last_moved) parts.push(`${f.last_moved} moved`);
  if (f.last_cancelled) parts.push(`${f.last_cancelled} cancelled`);
  return parts.join(", ");
}

/**
 * What to say when a calendar came back with nothing. The usual cause by a wide
 * margin is the share page pasted instead of the private iCal address.
 */
export const EMPTY_FEED_ADVICE =
  "Either the calendar genuinely has nothing in the next 30 days, or the link is the share page rather than the private iCal address. In Google Calendar that is Settings for my calendars → Secret address in iCal format.";

/** Vanta checks calendars on its own; a person should be told that once. */
export const SYNC_CADENCE_NOTE = "Vanta checks every calendar on its own about every 20 minutes. You never have to press this.";

/** The toast after a manual check: a diff, or an honest nothing. */
export function syncSummary(results: FeedSyncResult[]): { title: string; description: string } {
  if (results.length === 0) {
    return {
      title: "No calendars to check",
      description: "Add a calendar link and Vanta starts reading the shape of your days.",
    };
  }

  const failed = results.filter((r) => !r.ok);
  const ok = results.filter((r) => r.ok);
  const added = ok.reduce((n, r) => n + (r.added ?? 0), 0);
  const moved = ok.reduce((n, r) => n + (r.moved ?? 0), 0);
  const cancelled = ok.reduce((n, r) => n + (r.cancelled ?? 0), 0);
  const entries = ok.reduce((n, r) => n + (r.events ?? 0), 0);

  if (failed.length && !ok.length) {
    const one = failed[0];
    return {
      title: failed.length === 1 ? `${one.label ?? "That calendar"} did not answer` : `${failed.length} calendars did not answer`,
      description: one.error ?? "The link needs a fresh copy.",
    };
  }

  const changes = changePhrase({ last_added: added, last_moved: moved, last_cancelled: cancelled });
  const tail = failed.length ? ` ${failed.length} calendar${failed.length === 1 ? "" : "s"} did not answer.` : "";

  if (changes) {
    return { title: `Checked · ${changes}`, description: `What changed is listed in Schedule.${tail}` };
  }
  if (entries === 0) {
    return { title: "Checked · nothing came back", description: `${EMPTY_FEED_ADVICE}${tail}` };
  }
  return {
    title: "Checked · nothing changed",
    description: `${entries} ${entries === 1 ? "entry" : "entries"} on the next 30 days, same as before.${tail}`,
  };
}

/** One entry's change, said plainly. */
export function changeLine(c: {
  change: string;
  title: string | null;
  old_starts_at: string | null;
  new_starts_at: string | null;
}): string {
  const name = c.title?.trim() || "An untitled entry";
  const when = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "an unknown time";
  if (c.change === "cancelled") return `${name} is off — it was ${when(c.old_starts_at)}.`;
  if (c.change === "moved") return `${name} moved from ${when(c.old_starts_at)} to ${when(c.new_starts_at)}.`;
  return `${name} was added for ${when(c.new_starts_at)}.`;
}

// ---------------------------------------------------------------------------
// Diff view — "did it sync, and what exactly changed?"
//
// The panel says how many. This part says which, in before → after form, and
// groups the rows by the check that found them, so a person can see the run
// itself. Still pure: no IO, no formatting opinions beyond words and times.

export type CalendarChangeRow = {
  id: string;
  feed_id: string | null;
  title: string | null;
  change: string;
  old_starts_at: string | null;
  new_starts_at: string | null;
  was_filed: boolean;
  detected_at: string;
};

export type CalendarCheckRun = {
  /** The detected_at of the newest row in the run — the time of the check. */
  at: string;
  rows: CalendarChangeRow[];
  added: number;
  moved: number;
  cancelled: number;
};

/** A calendar-sync pass writes its rows within seconds of each other. */
const RUN_GAP_MS = 2 * MIN;

/**
 * Buckets changes into the checks that found them. Rows must arrive newest
 * first; the returned runs keep that order.
 */
export function groupChangesByCheck(
  rows: CalendarChangeRow[],
  gapMs = RUN_GAP_MS,
): CalendarCheckRun[] {
  const runs: CalendarCheckRun[] = [];
  for (const row of rows) {
    const t = new Date(row.detected_at).getTime();
    const open = runs[runs.length - 1];
    const openT = open ? new Date(open.at).getTime() : NaN;
    if (open && Number.isFinite(t) && Number.isFinite(openT) && openT - t <= gapMs) {
      open.rows.push(row);
    } else {
      runs.push({ at: row.detected_at, rows: [row], added: 0, moved: 0, cancelled: 0 });
    }
  }
  for (const run of runs) {
    run.added = run.rows.filter((r) => r.change === "added").length;
    run.moved = run.rows.filter((r) => r.change === "moved").length;
    run.cancelled = run.rows.filter((r) => r.change === "cancelled").length;
  }
  return runs;
}

/** "2 added · 1 moved" — what one check actually found. Never "synchronized". */
export function runHeadline(run: Pick<CalendarCheckRun, "added" | "moved" | "cancelled">): string {
  const parts: string[] = [];
  if (run.added) parts.push(`${run.added} added`);
  if (run.moved) parts.push(`${run.moved} moved`);
  if (run.cancelled) parts.push(`${run.cancelled} came off`);
  return parts.length ? parts.join(" · ") : "nothing changed";
}

export const CHANGE_VERB: Record<string, string> = {
  added: "Added",
  moved: "Moved",
  cancelled: "Came off",
};

/** The two sides of one change, for a before → after row. */
export function changeDiff(
  c: Pick<CalendarChangeRow, "change" | "old_starts_at" | "new_starts_at">,
  fmt: (iso: string) => string = (iso) =>
    new Date(iso).toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }),
): { verb: string; before: string | null; after: string | null } {
  const at = (iso: string | null) => (iso ? fmt(iso) : null);
  if (c.change === "cancelled") return { verb: CHANGE_VERB.cancelled, before: at(c.old_starts_at), after: null };
  if (c.change === "moved") return { verb: CHANGE_VERB.moved, before: at(c.old_starts_at), after: at(c.new_starts_at) };
  return { verb: CHANGE_VERB.added, before: null, after: at(c.new_starts_at) };
}
