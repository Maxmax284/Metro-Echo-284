// sherlockWhy — the plain-English reason a finding exists.
//
// Doctrine: inference is visible, never hidden. Every line here names the
// record it was read from. If the scanner recorded nothing, this module says
// so instead of padding the list with plausible-sounding filler.
//
// Pure module. It reads only what is already on the finding row.
import type { SherlockFinding } from "@/lib/sherlock/types";

export type WhySignal = {
  /** The plain sentence. */
  text: string;
  /** Where it was read from: "your calendar", "the commitment". */
  from: string;
};

export type WhyExplanation = {
  signals: WhySignal[];
  /** Words, never a percentage. */
  confidenceLine: string;
  /** True when nothing beyond the summary was recorded. */
  thin: boolean;
  /** The closing honesty line. */
  closing: string;
};

const CONFIDENCE_LINE: Record<string, string> = {
  high: "Certain — the records say this directly.",
  medium: "Likely — the records point this way without proving it.",
  low: "Uncertain — this is a guess worth checking.",
};

function fmtDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function num(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Signals per detector. Each builder may return nothing — a missing field means
 * a missing line, never an invented one.
 */
function signalsFor(f: SherlockFinding): WhySignal[] {
  const d = (f.extracted_data ?? {}) as Record<string, unknown>;
  const out: WhySignal[] = [];
  const push = (text: string | null, from: string) => {
    if (text) out.push({ text, from });
  };

  switch (f.finding_type) {
    case "stale_commitment": {
      const due = fmtDate(d.due_at);
      push(due && `You promised this by ${due}, and it is still open.`, "the commitment");
      const touch = fmtDate(d.last_touch);
      push(touch && `Nothing has moved on it since ${touch}.`, "your own record of it");
      break;
    }
    case "promise_collides_with_meeting": {
      const due = fmtDate(d.due_at);
      push(due && `This promise comes due at ${due}.`, "the commitment");
      const meet = fmtDate(d.meeting_starts_at);
      push(meet && `You are already booked at ${meet}.`, "your calendar, read-only");
      break;
    }
    case "recurring_entity": {
      const n = num(d.mention_count);
      push(n && `It came up ${n} times in the last two weeks.`, "your captures");
      const kind = str(d.kind);
      push(kind && `Vanta has it filed as a ${kind}.`, "your memory");
      break;
    }
    case "entity_gone_quiet": {
      const n = num(d.mentions_before);
      push(n && `It came up ${n} times, then stopped.`, "your captures");
      push("Nothing has mentioned it since.", "your recent records");
      break;
    }
    case "obligation_untracked": {
      const what = str(d.what);
      push(what && `The document says: “${what}”.`, "the document review");
      const when = str(d.when_text);
      push(when && `Timing named in the document: ${when}.`, "the document review");
      const party = str(d.party);
      push(party && `Responsibility sits with ${party}.`, "the document review");
      push("No open commitment reads like this.", "your commitments");
      break;
    }
    case "unapproved_high_risk": {
      const clause = str(d.clause);
      push(clause && `Flagged clause: ${clause}.`, "the document review");
      push("The document has not been approved yet.", "the document's own status");
      break;
    }
    case "meeting_without_context": {
      const start = fmtDate(d.starts_at);
      push(start && `It starts ${start}.`, "your calendar, read-only");
      push("No note, commitment or project points at it.", "your own records");
      break;
    }
    case "near_duplicate_note":
    case "notes_disagree": {
      push("Two of your own notes are involved.", "your notes");
      break;
    }
    default:
      break;
  }
  return out;
}

export function explainFinding(f: SherlockFinding): WhyExplanation {
  const signals = signalsFor(f);
  // The rationale the scanner wrote is itself a recorded line, so it counts.
  if (!signals.length && f.rationale) {
    signals.push({ text: f.rationale, from: "the scan that found it" });
  }
  const thin = signals.length === 0;
  return {
    signals,
    confidenceLine: CONFIDENCE_LINE[f.confidence] ?? CONFIDENCE_LINE.low,
    thin,
    closing: thin
      ? "Nothing else was recorded, so there is nothing more to show. Open the items behind it to judge for yourself."
      : "Vanta read nothing else to decide this.",
  };
}
