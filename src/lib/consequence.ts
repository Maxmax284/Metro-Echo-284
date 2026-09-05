// consequence.ts — what changes if you say yes, in plain English.
//
// Pure module. It reads recorded facts and produces the same six-part answer
// everywhere: Before / After / What changes / What does not change / What gets
// notified / What stays reversible — and it always ends with the same sentence:
// "Nothing has changed yet."
//
// This is a preview, never an execution path. Nothing in here writes anything.

export const NOTHING_YET = "Nothing has changed yet.";

export type Consequence = {
  /** What the thing is right now. */
  before: string;
  /** What it will be if you go ahead. */
  after: string;
  /** Each concrete change, one line each. */
  changes: string[];
  /** Things people expect to change that will not. */
  unchanged: string[];
  /** Who or what hears about it. Empty means nobody. */
  notified: string[];
  /** Plain sentence, or null when it can't be undone. */
  reversible: string | null;
};

export type ConsequenceRow = { label: string; lines: string[] };

/** Local date + time, no seconds, no timezone soup. */
export function whenPhrase(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function truncate(s: string, n = 90): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

/** Fixed order. Sections with nothing recorded are dropped, never faked. */
export function consequenceRows(c: Consequence): ConsequenceRow[] {
  const rows: ConsequenceRow[] = [
    { label: "Before", lines: [c.before] },
    { label: "After", lines: [c.after] },
    { label: "What changes", lines: c.changes },
    { label: "What does not change", lines: c.unchanged },
    {
      label: "What gets notified",
      lines: c.notified.length ? c.notified : ["Nobody. This stays inside Metro Echo."],
    },
    {
      label: "What stays reversible",
      lines: [c.reversible ?? "This one can't be undone from here."],
    },
  ];
  return rows.filter((r) => r.lines.filter(Boolean).length > 0);
}

/** One-line version for Telegram and the watch. */
export function compactConsequence(c: Consequence): string {
  const head = `${c.before} → ${c.after}`;
  return c.changes.length ? `${head}. ${c.changes[0]} ${NOTHING_YET}` : `${head}. ${NOTHING_YET}`;
}

// ── Closing a commitment ────────────────────────────────────────────────────

export function closeCommitmentConsequence(args: {
  title?: string | null;
  dueAt?: string | null;
  remindAt?: string | null;
  isReminder?: boolean;
}): Consequence {
  const name = args.title?.trim() || (args.isReminder ? "this reminder" : "this promise");
  const due = whenPhrase(args.dueAt ?? args.remindAt);
  return {
    before: due ? `Open — ${due}` : "Open, with no date recorded",
    after: "Done, closed today",
    changes: [
      `“${truncate(name)}” stops being something you owe.`,
      "It leaves your due list and the reminders for it stop.",
    ],
    unchanged: [
      "The note or message it came from stays exactly as it is.",
      "Nothing is sent to whoever it was for.",
    ],
    notified: [],
    reversible: "You can reopen it — closing is recorded, not final.",
  };
}

export function snoozeCommitmentConsequence(args: {
  title?: string | null;
  dueAt?: string | null;
  remindAt?: string | null;
  toIso: string;
  presetLabel: string;
}): Consequence {
  const name = args.title?.trim() || "this one";
  const from = whenPhrase(args.dueAt ?? args.remindAt);
  const to = whenPhrase(args.toIso) ?? args.presetLabel;
  const overdue = !!(args.dueAt && new Date(args.dueAt).getTime() < Date.now());
  return {
    before: from ? `Due ${from}` : "No date recorded",
    after: `Due ${to}`,
    changes: [
      `“${truncate(name)}” comes back at ${to}.`,
      overdue ? "Because it's already late, the due date moves too." : "The due date stays where it is.",
    ],
    unchanged: ["It stays open. Snoozing is not finishing."],
    notified: [],
    reversible: "You can move it again any time.",
  };
}

// ── Moving a booking ────────────────────────────────────────────────────────

export function moveBookingConsequence(args: {
  label?: string | null;
  fromIso?: string | null;
  toIso?: string | null;
  who?: string | null;
  notifies?: string[];
  reversible?: boolean;
}): Consequence {
  const name = args.label?.trim() || "this booking";
  const from = whenPhrase(args.fromIso);
  const to = whenPhrase(args.toIso);
  return {
    before: from ? `Booked for ${from}` : "Booked, time not recorded here",
    after: to ? `Booked for ${to}` : "Moved to the new time in the request",
    changes: [
      `“${truncate(name)}” sits at a different time.`,
      args.who ? `${args.who} is the person holding it.` : "The slot it leaves becomes free.",
    ],
    unchanged: [
      "Price, payment and who it's for stay as they are.",
      "No other booking is touched.",
    ],
    notified: args.notifies ?? [],
    reversible: args.reversible === false ? null : "You can move it back to the original time.",
  };
}

// ── Sending a reply ─────────────────────────────────────────────────────────

export function sendReplyConsequence(args: {
  channel: string;
  to?: string | null;
  text: string;
}): Consequence {
  return {
    before: `Written here, not sent`,
    after: `Delivered to ${args.to?.trim() || args.channel}`,
    changes: [
      `“${truncate(args.text, 120)}” arrives on ${args.channel}.`,
      "The message is recorded in the conversation with your name on it.",
    ],
    unchanged: [
      "Nothing is approved, filed or exported by sending this.",
      "No promise, booking or document changes.",
    ],
    notified: [args.to?.trim() ? `${args.to} on ${args.channel}` : `Whoever reads that ${args.channel} chat`],
    reversible: null,
  };
}

// ── Generic staged action ───────────────────────────────────────────────────

export function actionConsequence(args: {
  title: string;
  description?: string | null;
  risk: "low_reversible" | "standard" | "high";
  affectedCount?: number;
  rollback?: boolean | null;
  executorLabel?: string | null;
}): Consequence {
  const touched = args.affectedCount ?? 0;
  return {
    before: "Approved and waiting. Nothing has run.",
    after: args.executorLabel ? `Run through ${args.executorLabel}` : "Recorded as done by you",
    changes: [
      truncate(args.title, 120),
      touched > 0
        ? `${touched} ${touched === 1 ? "thing" : "things"} recorded against it get updated.`
        : "Only this one action moves.",
    ],
    unchanged: [
      "No other action runs, now or later.",
      "Your notes, projects and promises stay as they are.",
    ],
    notified: [],
    reversible: args.rollback ? "There's an undo for this one in Receipts." : null,
  };
}
