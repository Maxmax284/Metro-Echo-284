// echoAbilities — the one answer to "what can you actually do?"
//
// Companion to capabilityStatus (which answers "what can you see?"). This file
// answers reach: what Echo is able to do right now, what is waiting on a
// connection, and what it genuinely cannot do yet. Written once so the app, Ask
// and Telegram can never advertise different powers.
//
// Pure module: no IO, no React. Every row's state comes from recorded facts
// handed in by the caller — nothing here guesses, and nothing here is aspirational.

export type AbilityState =
  /** Usable right now. */
  | "live"
  /** The ability exists; a source has to be connected first. */
  | "needs_connecting"
  /** Not built. Says so plainly rather than implying it might work. */
  | "not_yet";

export type Ability = {
  id: string;
  label: string;
  /** What it does, in the person's words. */
  plain: string;
  state: AbilityState;
  /** Why it is not live, when it is not. Recorded reason only. */
  because?: string;
  /** The law that limits it, when one applies. */
  limit?: string;
};

export type AbilityFacts = {
  /** This person's calendar is being read. */
  calendar: boolean;
  /** Mail is readable (read + drafts only, never sends). */
  mail: boolean;
  /** Files are readable (look only). */
  files: boolean;
  /** A Telegram chat is paired. */
  telegram: boolean;
  /** Public web search is configured. */
  web_search: boolean;
  /** How many things Echo is currently watching. */
  watching: number;
};

export function echoAbilities(f: AbilityFacts): Ability[] {
  return [
    {
      id: "board",
      label: "Tell you where you stand",
      plain: "One read of your promises, staged work and what moved — not a list of everything.",
      state: "live",
    },
    {
      id: "calendar",
      label: "Speak up before an appointment matters",
      plain: "Reads your calendar and says something the evening before and again on the day.",
      state: f.calendar ? "live" : "needs_connecting",
      because: f.calendar ? undefined : "No calendar is being read yet.",
    },
    {
      id: "mail",
      label: "Look in your mail",
      plain: "Finds the message behind a question and can write a reply for you to send.",
      state: f.mail ? "live" : "needs_connecting",
      because: f.mail ? undefined : "Mail is not connected yet.",
      limit: "Reads and drafts only. Echo never sends mail.",
    },
    {
      id: "files",
      label: "Look in your files",
      plain: "Finds the document you mean and reads it when the file allows it.",
      state: f.files ? "live" : "needs_connecting",
      because: f.files ? undefined : "Files are not connected yet.",
      limit: "Look only. Echo never edits or deletes a file.",
    },
    {
      id: "telegram",
      label: "Answer on your phone",
      plain: "Same Echo over Telegram — capture on the move, ask the same questions.",
      state: f.telegram ? "live" : "needs_connecting",
      because: f.telegram ? undefined : "No chat is paired yet.",
      limit: "Nothing runs from a message. Approval happens here.",
    },
    {
      id: "page",
      label: "Read a page you point at",
      plain: "Opens one public address and answers against your question.",
      state: "live",
      limit: "Public pages only. No sign-in, no forms.",
    },
    {
      id: "search",
      label: "Check the public web",
      plain: "Looks something up when your own records don't hold the answer.",
      state: f.web_search ? "live" : "needs_connecting",
      because: f.web_search ? undefined : "Web search has no key configured.",
    },
    {
      id: "watch",
      label: "Keep checking until something changes",
      plain:
        f.watching > 0
          ? `Re-reads a page or an event and stays quiet until it moves. ${f.watching} being watched now.`
          : "Re-reads a page or an event and stays quiet until it moves.",
      state: "live",
    },
    {
      id: "prepare",
      label: "Prepare something for your yes",
      plain: "Drafts the message, event or task and holds it until you approve it.",
      state: "live",
      limit: "Nothing consequential runs without your approval.",
    },
    {
      id: "world",
      label: "Make a foreign number mean something",
      plain: "Converts a measurement and, where there is a kept anchor, says whether it is small, normal or brutal.",
      state: "live",
      limit: "Exact factors only. No anchor written down means no opinion offered.",
    },
    {
      id: "facts",
      label: "Tell you how things work where you are",
      plain: "Plugs, voltage, driving side, date and clock format, dialling code, whether tax is in the price, tipping, how people pay, fuel, SIM.",
      state: "live",
      limit: "Kept notes with the day they were checked. A country with no notes gets no guess.",
    },
    {
      id: "trouble",
      label: "Line up the move when something goes wrong",
      plain:
        "Lost wallet or passport, card declined, ATM ate it, dead phone, missed connection, hotel or taxi trouble, locked out, missing package, outage, flat tyre, clinic or pharmacy, paperwork, government office, delayed bag, questionable fee — the first move, then the order.",
      state: "live",
      limit: "Echo prepares. It never phones anyone, cancels a card, files a claim, or calls for help on your behalf.",
    },
    {
      id: "friction",
      label: "Weigh the real cost of an option",
      plain: "Counts money, minutes, transfers and walking, then shows the tradeoff instead of hiding it.",
      state: "live",
      limit: "Only on numbers you give. The recommendation is labelled a judgement, never a fact.",
    },
    {
      id: "customs",
      label: "Say what is usual where you are",
      plain: "Bargaining, dress, religious spaces, queues, manners, timekeeping, tourist pricing, service, how people expect contact.",
      state: "live",
      limit: "Kept notes with the day they were checked. Nothing written means nothing said — no stereotypes.",
    },
    {
      id: "portal",
      label: "Sign in somewhere and book, pay or submit",
      plain: "Would need a browser that can hold a session on your behalf.",
      state: "not_yet",
      because: "There is no such browser here, so it is not pretended.",
    },
  ];
}

/** One honest sentence about reach. Counted from the rows. */
export function abilityLine(rows: Ability[]): string {
  const live = rows.filter((r) => r.state === "live").length;
  const waiting = rows.filter((r) => r.state === "needs_connecting").length;
  const head = `${live} ${live === 1 ? "thing" : "things"} Echo can do right now`;
  if (waiting === 0) return `${head}. Nothing is waiting on a connection.`;
  return `${head}, and ${waiting} more once you connect the source ${waiting === 1 ? "it" : "they"} need${waiting === 1 ? "s" : ""}.`;
}

function stateWord(state: AbilityState): string {
  if (state === "live") return "now";
  if (state === "needs_connecting") return "needs connecting";
  return "not yet";
}

/** The chat-shaped answer, for Ask and Telegram. */
export function abilityAnswer(rows: Ability[]): string {
  const lines = rows.map((r) => {
    const tail = [r.because, r.limit].filter(Boolean).join(" ");
    return `• ${r.label} — ${stateWord(r.state)}. ${r.plain}${tail ? ` ${tail}` : ""}`;
  });
  return [abilityLine(rows), ...lines, "Nothing on this list acts on its own."].join("\n");
}

/** Recorded fact for the prompt, so Echo answers reach in its own words. */
export function abilitiesBlock(rows: Ability[]): string {
  return [
    "What you can actually do right now (recorded fact — do not add to this list, do not promise anything marked not yet):",
    ...rows.map((r) => `- ${r.label}: ${stateWord(r.state)}. ${r.plain}${r.because ? ` ${r.because}` : ""}${r.limit ? ` ${r.limit}` : ""}`),
    "Answer in your own words, shortest useful form. Name at most three things you can do, then say plainly what is waiting on a connection and what you cannot do at all.",
  ].join("\n");
}

const ABILITY_QUESTION =
  /(what can you (do|help|handle)|what are you (able|capable) (to|of)|what can (echo|vanta) do|what do you do|what else can you do|how can you help|what are your (abilities|capabilities|powers)|can you do anything else)/i;

/** True when a message is asking about reach, not about senses. */
export function matchAbilityQuestion(text: string | null | undefined): boolean {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  return ABILITY_QUESTION.test(t);
}
