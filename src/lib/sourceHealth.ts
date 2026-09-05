// sourceHealth — proof of life, in words a person already knows.
//
// Doctrine: a source's state persists until reality changes. It is never a
// toast that vanishes, never a colour on its own, and never a zero standing in
// for a missing reading. "Late" means Echo expected something by now and it
// has not come. "Quiet" means the path works and there was simply nothing to
// report. Those are different sentences and Echo must not mix them.
//
// Built on the connection states Settings already computes, so there is one
// source of truth for "is this thing working".
import { CONN_LAMP, type ConnState } from "@/lib/connections";
import { agoPhrase } from "@/lib/whySurfaced";

export type HealthState =
  | "healthy"
  | "quiet"
  | "late"
  | "missing_data"
  | "attention"
  | "off"
  | "no_data";

export const HEALTH_LABEL: Record<HealthState, string> = {
  healthy: "Healthy",
  quiet: "Quiet",
  late: "Late",
  missing_data: "Missing data",
  attention: "Needs attention",
  off: "Off",
  no_data: "No data yet",
};

/** Tone only. The word is always shown beside it. */
export const HEALTH_LAMP: Record<HealthState, string> = {
  healthy: CONN_LAMP.connected,
  quiet: CONN_LAMP.partial,
  late: CONN_LAMP.needs_setup,
  missing_data: CONN_LAMP.no_data,
  attention: CONN_LAMP.attention,
  off: CONN_LAMP.off,
  no_data: CONN_LAMP.no_data,
};

export type SourceHealth = {
  key: string;
  label: string;
  state: HealthState;
  /** Evidence, always. "Last received 4m ago" or the honest absence. */
  proof: string;
  /** What it means and what to do, in one plain sentence. */
  line: string;
};

const HOUR = 3_600_000;

/**
 * Read one source's health from its connection state, its last real signal and
 * how often it is expected to speak.
 *
 * `expectEveryHours` null means the source has no schedule — silence from it is
 * "Quiet", not "Late".
 */
export function healthFor(input: {
  key: string;
  label: string;
  conn: ConnState;
  lastAt: string | null;
  expectEveryHours: number | null;
  /** What the source does, used for the plain sentence. */
  what: string;
  now?: number;
}): SourceHealth {
  const now = input.now ?? Date.now();
  const fresh = agoPhrase(input.lastAt, now);
  const proof = fresh ? `Last signal ${fresh}` : "No signal recorded";

  let state: HealthState;
  if (input.conn === "off") state = "off";
  else if (input.conn === "attention") state = "attention";
  else if (input.conn === "needs_setup") state = "no_data";
  else if (!input.lastAt) state = input.conn === "no_data" ? "no_data" : "missing_data";
  else {
    const ageHours = (now - new Date(input.lastAt).getTime()) / HOUR;
    if (input.expectEveryHours && ageHours > input.expectEveryHours * 2) state = "late";
    else if (input.conn === "partial") state = "quiet";
    else state = "healthy";
  }

  const LINE: Record<HealthState, string> = {
    healthy: `${input.what} — working.`,
    quiet: `${input.what} — the path works, there has just been nothing to report.`,
    late: `${input.what} — Echo expected something by now and it hasn't arrived.`,
    missing_data: `${input.what} — set up, but nothing has ever come through.`,
    attention: `${input.what} — the last attempt failed. Open Settings to see why.`,
    off: `${input.what} — switched off, so Echo isn't reading it.`,
    no_data: `${input.what} — not connected yet.`,
  };

  return { key: input.key, label: input.label, state, proof, line: LINE[state] };
}

/** True when at least one source is in a state a person should act on. */
export function needsAttention(list: SourceHealth[]): boolean {
  return list.some((s) => s.state === "attention" || s.state === "late");
}

/** One honest summary line for the strip header. Never a count of nothing. */
export function healthSummary(list: SourceHealth[]): string {
  if (list.length === 0) return "Nothing is connected yet.";
  const bad = list.filter((s) => s.state === "attention" || s.state === "late");
  if (bad.length > 0) {
    return bad.length === 1
      ? `${bad[0].label} needs a look.`
      : `${bad.map((s) => s.label).join(" and ")} need a look.`;
  }
  const live = list.filter((s) => s.state === "healthy" || s.state === "quiet");
  if (live.length === 0) return "Nothing is feeding Echo yet.";
  return live.length === list.length
    ? `All ${live.length} feeds are alive.`
    : `${live.length} of ${list.length} feeds are alive.`;
}
