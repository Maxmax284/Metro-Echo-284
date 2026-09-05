// capabilityStatus — the one answer to "what can you see?"
//
// The app's senses list and the Telegram reply are the same facts in two
// shapes. Written once here so a switch can never read on in one place and off
// in another.
//
// Pure module: no IO, no React.

export type SenseRow = {
  label: string;
  /** true on, false off, null decided in the moment by the person. */
  on: boolean | null;
  /** Nothing set up yet — neither on nor a matter of consent. */
  unset?: boolean;
  /** What it helps with, in plain words. */
  helps: string;
  /** Recorded evidence for this row, when there is any. */
  detail?: string | null;
};

/** One sentence about the whole picture. Counted from the rows, never guessed. */
export function capabilityStatusLine(rows: SenseRow[]): string {
  const on = rows.filter((r) => r.on === true && !r.unset).map((r) => r.label);
  const off = rows.filter((r) => r.on === false || r.unset).map((r) => r.label);
  if (on.length === 0) {
    return "Nothing is feeding Echo yet, so it can only work from what you tell it.";
  }
  const onPart =
    on.length === rows.length
      ? "Everything is feeding Echo"
      : `${on.join(", ")} ${on.length === 1 ? "is" : "are"} feeding Echo`;
  if (off.length === 0) return `${onPart}. Nothing is switched off.`;
  return `${onPart}. ${off.join(", ")} ${off.length === 1 ? "isn't" : "aren't"}, so nothing comes from ${off.length === 1 ? "it" : "them"}.`;
}

function stateWord(r: SenseRow): string {
  if (r.unset) return "not set up yet";
  if (r.on === null) return "only when you ask";
  return r.on ? "on" : "off";
}

/** The chat-shaped answer: the sentence, then one line per sense. */
export function capabilityAnswer(rows: SenseRow[]): string {
  const lines = rows.map((r) => {
    const detail = r.detail ? ` ${r.detail}` : "";
    return `• ${r.label} — ${stateWord(r)}. ${r.helps}${detail}`;
  });
  return [
    capabilityStatusLine(rows),
    ...lines,
    "Change any of it in Metro Echo under what Echo may sense. Nothing here acts on its own.",
  ].join("\n");
}

const CAPABILITY_QUESTION =
  /(what (can|do) you (see|sense|access)|what (are|is) you (connected|hooked) (to|up)|what do you have access to|are you (connected|reading|watching)|what('s| is) (switched|turned) on|what can vanta see|status of (the )?(platform|system|senses)|platform status|what('s| is) connected)/i;

/** True when a message is asking what the platform can see or reach. */
export function matchCapabilityQuestion(text: string | null | undefined): boolean {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return CAPABILITY_QUESTION.test(t);
}
