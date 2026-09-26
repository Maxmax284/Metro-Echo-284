// objectLife — the short story of how one object got here.
//
// Doctrine: Receipts stays the full evidence layer. This is the summary line a
// user reads without leaving the card:
//
//   Captured from Telegram → filed to project → moved once → due Fri
//
// Every step comes from a recorded audit event. Nothing is inferred, nothing is
// invented, and an object with no recorded history says so plainly.

export type LifeEvent = {
  /** The audit event name as recorded, e.g. "note.created", "action.executed". */
  event: string;
  /** ISO timestamp of the record. */
  at: string;
  /** Optional recorded source: "telegram", "email", "you"… */
  source?: string | null;
  /** Optional label of what it moved to, when the record carried one. */
  target?: string | null;
};

export type LifeStep = {
  /** Plain-English fragment, lowercase except a leading proper noun. */
  text: string;
  at: string;
};

const SOURCE_WORD: Record<string, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  email: "email",
  email_inbound: "email",
  calendar: "the calendar",
  upload: "an upload",
  website: "a form",
  ask: "Echo",
  sherlock: "Sherlock",
  you: "you",
  vanta: "Echo",
};

function sourceWord(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  return SOURCE_WORD[k] ?? null;
}

/** Verbs we can say honestly. Anything else is collapsed into "recorded". */
const VERB: Array<{ match: RegExp; text: (e: LifeEvent) => string }> = [
  {
    match: /\.(created|captured|ingested|received)$/,
    text: (e) => {
      const src = sourceWord(e.source);
      return src ? `Captured from ${src}` : "Created";
    },
  },
  { match: /\.(linked|filed|attached|routed)$/, text: (e) => (e.target ? `filed to ${e.target}` : "filed") },
  { match: /\.(moved|rescheduled)$/, text: () => "moved" },
  { match: /\.(updated|revised|edited)$/, text: () => "updated" },
  { match: /\.(staged|prepared|drafted|proposed)$/, text: () => "prepared" },
  { match: /\.(reviewed|read|audited)$/, text: () => "reviewed" },

  { match: /\.(approved)$/, text: () => "approved" },
  { match: /\.(executed|sent|delivered)$/, text: () => "executed" },
  { match: /\.(rolled_back|reversed|undone)$/, text: () => "reversed" },
  { match: /\.(completed|closed|done)$/, text: () => "completed" },
  { match: /\.(cancelled|canceled|discarded|dismissed)$/, text: () => "discarded" },
];

function stepText(e: LifeEvent): string {
  for (const v of VERB) if (v.match.test(e.event)) return v.text(e);
  return "recorded";
}

/** Repeats collapse: three moves read as "moved 3 times", not three steps. */
function collapse(steps: LifeStep[]): LifeStep[] {
  const out: LifeStep[] = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last.text === s.text) {
      const n = /(\d+) times$/.exec(last.text);
      last.text = n ? `${s.text} ${Number(n[1]) + 1} times` : `${s.text} twice`;
      last.at = s.at;
      continue;
    }
    if (last && last.text.startsWith(`${s.text} `) && /(twice|\d+ times)$/.test(last.text)) {
      const n = /(\d+) times$/.exec(last.text);
      last.text = `${s.text} ${n ? Number(n[1]) + 1 : 3} times`;
      last.at = s.at;
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

export const MAX_LIFE_STEPS = 4;

export type ObjectLife = {
  steps: LifeStep[];
  /** The joined line, ready to render. Empty string when there is no history. */
  line: string;
  /** True when more happened than the line shows. */
  truncated: boolean;
};

/**
 * Build the life line from recorded events, oldest first. A trailing state
 * fragment ("due Fri", "still open") may be appended by the caller — it is the
 * only part that reads current state rather than history.
 */
export function buildObjectLife(events: LifeEvent[], tail?: string | null): ObjectLife {
  const ordered = [...events]
    .filter((e) => Boolean(e.event) && Boolean(e.at))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const collapsed = collapse(ordered.map((e) => ({ text: stepText(e), at: e.at })));

  let steps = collapsed;
  let truncated = false;
  if (collapsed.length > MAX_LIFE_STEPS) {
    // Keep the origin and the most recent moves — the middle is what Receipts is for.
    steps = [collapsed[0], ...collapsed.slice(-(MAX_LIFE_STEPS - 1))];
    truncated = true;
  }

  const parts = steps.map((s) => s.text);
  if (tail) parts.push(tail);
  return { steps, line: parts.join(" → "), truncated };
}

/** What to show when nothing has been recorded. Never a fake history. */
export const NO_LIFE_LINE = "No recorded history yet.";
