// radar — how Today talks about what Echo is keeping an eye on.
//
// Pure: watches in, one card model out. Three honest shapes only —
//   empty:     nothing is being watched, so the card teaches how things land here.
//   quiet:     watches are open and none need you. Silence is a valid answer.
//   attention: something needs you, failed recently, or fell behind on checks.
// A failed or stalled check is never dressed up as "nothing changed".
import { OPEN_WATCH_STATES, WATCH_LABEL, type Watch } from "@/lib/watch";

/** A check more than this far overdue reads as behind, never as quiet. */
export const RADAR_BEHIND_MS = 60 * 60_000;
/** A failure stays news on the card for a day, then ages off. */
export const RADAR_FAILED_NEWS_MS = 24 * 3_600_000;

export type RadarRow = {
  id: string;
  goal: string;
  state: Watch["state"];
  stateLabel: string;
  /** "Checked 2 h ago · next in ~4 h" — honest when never checked or paused. */
  check: string;
  /** The headline Echo actually saw on the last read, when there was one. */
  latest: string | null;
  needsAttention: boolean;
};

export type RadarModel =
  | { kind: "empty" }
  | { kind: "quiet"; openCount: number; rows: RadarRow[] }
  | { kind: "attention"; headline: string; rows: RadarRow[] };

function isOpen(w: Watch): boolean {
  return (OPEN_WATCH_STATES as string[]).includes(w.state);
}

/** "3 h" / "45 min" / "2 d" — rough spans, never false precision. */
export function spanWords(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 90) return `${Math.max(mins, 1)} min`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 36) return `${hours} h`;
  return `${Math.round(ms / 86_400_000)} d`;
}

/**
 * One line of recorded-check truth: when it was last checked, and when the
 * next check is expected. Unknowns stay unknown — a watch that has never been
 * checked says so instead of pretending a time.
 */
export function checkWords(w: Watch, now: number = Date.now()): string {
  const last = w.last_check_at ? Date.parse(w.last_check_at) : NaN;
  const head = Number.isFinite(last) ? `Checked ${spanWords(now - last)} ago` : "Not checked yet";
  if (w.state === "paused") return `${head} · paused`;
  const next = Date.parse(w.next_check_at);
  if (!Number.isFinite(next)) return head;
  const tail = next <= now ? "next check due now" : `next in ~${spanWords(next - now)}`;
  return `${head} · ${tail}`;
}

/** Does this watch deserve a raised hand on the card? */
export function needsAttention(w: Watch, now: number = Date.now()): boolean {
  if (w.state === "needs_you") return true;
  if (w.state === "couldnt_finish") {
    const at = Date.parse(w.updated_at ?? w.created_at);
    return Number.isFinite(at) && now - at < RADAR_FAILED_NEWS_MS;
  }
  if (isOpen(w)) {
    const next = Date.parse(w.next_check_at);
    return Number.isFinite(next) && now - next > RADAR_BEHIND_MS;
  }
  return false;
}

function headline(needsYou: number, failed: number, behind: number): string {
  const parts: string[] = [];
  if (needsYou === 1) parts.push("1 watch needs you");
  if (needsYou > 1) parts.push(`${needsYou} watches need you`);
  if (failed === 1) parts.push("1 watch couldn't finish");
  if (failed > 1) parts.push(`${failed} watches couldn't finish`);
  if (behind === 1) parts.push("1 watch is behind on checks");
  if (behind > 1) parts.push(`${behind} watches are behind on checks`);
  return parts.join(" · ");
}

/**
 * The card model. Rows are the watches worth a line today: everything open,
 * anything paused, and failures still fresh enough to be news — attention
 * first, then by which check comes due soonest.
 */
export function radarModel(watches: Watch[], now: number = Date.now()): RadarModel {
  const shown = watches.filter((w) => isOpen(w) || w.state === "paused" || needsAttention(w, now));
  if (shown.length === 0) return { kind: "empty" };

  const rows: RadarRow[] = shown
    .map((w) => ({
      id: w.id,
      goal: w.goal,
      state: w.state,
      stateLabel: WATCH_LABEL[w.state],
      check: checkWords(w, now),
      latest: w.last_read ?? null,
      needsAttention: needsAttention(w, now),
    }))
    .sort((a, b) => {
      if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
      return 0;
    });

  const needsYou = shown.filter((w) => w.state === "needs_you").length;
  const failed = shown.filter((w) => w.state === "couldnt_finish" && needsAttention(w, now)).length;
  const behind = shown.filter((w) => isOpen(w) && w.state !== "needs_you" && needsAttention(w, now)).length;

  if (needsYou + failed + behind === 0) {
    return { kind: "quiet", openCount: shown.filter(isOpen).length, rows };
  }
  return { kind: "attention", headline: headline(needsYou, failed, behind), rows };
}

/** The quiet headline: silence is a valid answer, said plainly. */
export function quietHeadline(openCount: number): string {
  return openCount === 1
    ? "Watching 1 thing — nothing has moved."
    : `Watching ${openCount} things — nothing has moved.`;
}

/**
 * The question a radar row hands to Echo when you tap Ask Echo. Watch goals
 * are written for the board ("Watch the web for “X”"), not for a conversation,
 * so the prompt folds them back into how a person would ask.
 */
export function debriefPrompt(goal: string): string {
  const g = goal.trim();
  const stop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  const topic = /^Watch the web for [“"]([\s\S]+)[”"]$/.exec(g);
  if (topic) return `Catch me up on ${stop(topic[1])}`;
  const pageWhy = /^Watch (\S+) — ([\s\S]+)$/.exec(g);
  if (pageWhy) return `Catch me up on ${pageWhy[2]} (${pageWhy[1]}).`;
  const page = /^Watch (\S+) for changes$/.exec(g);
  if (page) return `What's new on ${page[1]}?`;
  return `Catch me up on this: ${g}`;
}
