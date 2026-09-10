// askSuggestions — live questions derived only from current state.
//
// Doctrine: Ask never shows static chatbot prompts. A suggestion exists only
// because a real record makes it answerable, and it disappears the moment that
// record is gone. Pure function: no queries, no side effects, no clutter.

export type AskSuggestionState = {
  /** Recorded events since the start of the local day. */
  changesToday: number;
  /** Actions staged or proposed and waiting on the user. */
  waitingOnYou: number;
  /** Open commitments with a date on them. */
  openPromises: number;
  /** The next calendar entry, if one is known. */
  nextEvent: { title: string; startsAt: string } | null;
  /** Something Echo noticed and has not been read yet. */
  noticed: number;
  /** Calendar entries tomorrow that overlap each other. */
  overlapsTomorrow?: number;
};

export type AskSuggestion = {
  id: string;
  /** Short chip label. */
  label: string;
  /** The question actually sent to Echo. */
  question: string;
};

/** Up to three live questions, most consequential first. */
export function askSuggestions(state: AskSuggestionState): AskSuggestion[] {
  const out: AskSuggestion[] = [];

  if (state.waitingOnYou > 0) {
    out.push({
      id: "waiting",
      label: "Anything waiting on me?",
      question: "What is waiting on me right now, and what does approving it do?",
    });
  }

  if ((state.overlapsTomorrow ?? 0) > 0) {
    out.push({
      id: "conflicts",
      label: "Anything conflicting tomorrow?",
      question: "What conflicts tomorrow, and what would need to move?",
    });
  }

  if (state.nextEvent) {
    const title = state.nextEvent.title.trim();
    out.push({
      id: "prepare",
      label: `What do I need before ${shortTitle(title)}?`,
      question: `What do I need before ${title}? Use only what you already have on record.`,
    });
  }

  if (state.changesToday > 0) {
    out.push({
      id: "changed",
      label: "What changed since this morning?",
      question: "What changed since this morning, based on recorded events only?",
    });
  }

  if (state.noticed > 0) {
    out.push({
      id: "noticed",
      label: "Why is this on Today?",
      question: "Why is the thing you noticed on Today, and what evidence triggered it?",
    });
  }

  if (state.openPromises > 0) {
    out.push({
      id: "promises",
      label: "What did I promise?",
      question: "Which promises are still open, and which one is closest to its date?",
    });
  }

  if (state.nextEvent) {
    const title = state.nextEvent.title.trim();
    out.push({
      id: "move",
      label: `Move ${shortTitle(title)}?`,
      question: `I may need to move ${title}. Show me what changing it would look like before anything happens.`,
    });
  }

  return out.slice(0, 3);
}

function shortTitle(title: string): string {
  if (title.length <= 22) return title;
  return `${title.slice(0, 21).trimEnd()}…`;
}
