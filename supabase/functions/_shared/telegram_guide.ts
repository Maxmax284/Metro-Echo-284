// telegramGuide — one honest answer to "what can I actually do in here?".
//
// Same text everywhere: the settings page prints it, the download hands it over,
// and Telegram says it when someone asks how to use Echo. One source, so the
// chat can never promise something the app doesn't do.
//
// Pure module (no Deno APIs, no URL imports) so the app, the tests and the edge
// functions all read the exact same words.

export type GuideSection = {
  title: string;
  /** One line each. Plain English, no markup — every surface renders them. */
  lines: string[];
};

/** What you type, and what it does. Keep this list exactly what the bot handles. */
export const TELEGRAM_COMMANDS: { cmd: string; does: string }[] = [
  { cmd: "/day", does: "Today's board — real calendar events, plus what you owe and anything waiting on your yes." },
  { cmd: "/week", does: "The week ahead, same board, empty days skipped." },
  { cmd: "/help", does: "This rundown." },
  { cmd: "/link", does: "Pair this chat to your account." },
  { cmd: "/unlink", does: "Cut this chat loose. Nothing else is deleted." },
];

/** Plain sentences that work. Not magic words — Echo reads normal talk. */
export const TELEGRAM_PHRASEBOOK: string[] = [
  "what's on my calendar tomorrow",
  "anything clashing on Friday",
  "what comes after my appointment",
  "remind me to call the landlord Thursday at 4",
  "note: the AC guy wants a key left downstairs",
  "move my 2pm to 4pm",
  "I told Nikki I'd send the invoice",
  "show me my week",
];

export const TELEGRAM_GUIDE: GuideSection[] = [
  {
    title: "What this chat is",
    lines: [
      "Same Echo as the app — same memory, same calendar, same rules. Different door.",
      "This is the field door: quick, one-handed, from wherever you are.",
      "Nothing here is a separate assistant, and nothing here has its own private brain.",
    ],
  },
  {
    title: "What it can do",
    lines: [
      "Read your real calendar: a day, the week, what's next, what collides.",
      "Take anything you throw at it — text, photos, files, voice notes — and file it.",
      "Set reminders and track promises you make out loud.",
      "Draft a calendar change and hold it until you say yes, right here in the chat.",
      "Answer from what it already knows about you — your places, your projects, your week.",
    ],
  },
  {
    title: "What it will not do",
    lines: [
      "It never changes anything outside Metro Echo without your explicit yes.",
      "Reading your calendar never stages a change. Looking is just looking.",
      "It won't guess when two sources disagree — it shows you the contradiction first.",
      "Big, messy or high-stakes changes get finished in the app, not from a chat window.",
      "Calendars you added by link are read-only. It'll say so instead of pretending.",
    ],
  },
  {
    title: "How to talk to it",
    lines: [
      "Talk normal. No keywords, no syntax, no shouting at it in caps.",
      "Rough voice-to-text is fine — it reads through the mess.",
      "Vague is allowed. If it's unsure, it asks one question instead of guessing.",
      "Say \"no\" or \"not that\" and it fixes the same draft instead of starting over.",
    ],
  },
  {
    title: "Where things land",
    lines: [
      "Notes go to memory. Promises go on the board. Changes wait as drafts.",
      "Everything that happens leaves a receipt you can read later in the app.",
      "If you'd rather see it laid out, every reply can hand you a link into Metro Echo.",
    ],
  },
];

/** The Telegram answer to "how do I use you". Short, no markdown tables. */
export function renderTelegramHelp(): string {
  const commands = TELEGRAM_COMMANDS.map((c) => `${c.cmd} — ${c.does}`).join("\n");
  const say = TELEGRAM_PHRASEBOOK.slice(0, 5).map((p) => `“${p}”`).join("\n");
  return [
    "Here's the honest rundown.",
    "",
    "Same Echo as the app — same memory, same calendar, same rules. This is just the field door.",
    "",
    "Shortcuts:",
    commands,
    "",
    "Or talk normal:",
    say,
    "",
    "What I won't do: change anything outside Metro Echo without your yes, guess when two sources disagree, or pretend a read-only calendar can be edited. Reading never stages anything.",
    "",
    "Full rundown lives in Settings → Telegram, and you can save it there.",
  ].join("\n");
}

/** The downloadable/printable version. Markdown, so it reads fine as a file. */
export function renderTelegramGuideMarkdown(botUsername?: string | null): string {
  const who = botUsername ? `@${botUsername}` : "your Echo bot";
  const out: string[] = [
    "# Echo on Telegram",
    "",
    `The chat with ${who} is the same Echo that lives in Metro Echo — same memory, same calendar,`,
    "same permissions, same receipts. It is a door, not a second assistant.",
    "",
  ];
  for (const s of TELEGRAM_GUIDE) {
    out.push(`## ${s.title}`, "");
    for (const l of s.lines) out.push(`- ${l}`);
    out.push("");
  }
  out.push("## Shortcuts", "");
  for (const c of TELEGRAM_COMMANDS) out.push(`- \`${c.cmd}\` — ${c.does}`);
  out.push("", "## Things you can just say", "");
  for (const p of TELEGRAM_PHRASEBOOK) out.push(`- “${p}”`);
  out.push(
    "",
    "## The one rule that never bends",
    "",
    "Capture never executes. Anything that touches the world outside Metro Echo waits for your",
    "approval, and leaves a receipt once it's done.",
    "",
  );
  return out.join("\n");
}

/**
 * "How do I use you?" in the shapes people actually type it. Narrow on purpose —
 * real work must never get swallowed by the help answer.
 */
export function matchHelpQuestion(raw: string | null | undefined): boolean {
  const t = (raw ?? "").trim().toLowerCase().replace(/[?!.]+$/g, "");
  if (!t || t.length > 140) return false;
  if (/^\/help\b/.test(t)) return true;
  if (/\b(how (do|can|would) i (use|talk to|work) (you|this)|how does this work|how do you work)\b/.test(t)) return true;
  if (/\b(what can (you|u) do|what else can you do|what are you good for|what can i ask you)\b/.test(t)) return true;
  if (/\b(what can'?t you do|what are your limits|what are you not able to)\b/.test(t)) return true;
  if (/^(help|help me out|commands|show me the commands|options)$/.test(t)) return true;
  return false;
}
