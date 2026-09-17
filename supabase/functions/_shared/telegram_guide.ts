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
  { cmd: "/queue", does: "Calendar edits and where each one stands: waiting on your yes, approved but not written to Google yet, already written. Retry the write from here." },
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

/**
 * What actually goes through the chat, type by type. Written from the real
 * intake path — photos and image files get looked at, PDFs/Word/plain text and
 * voice notes get read, everything else is named and refused honestly.
 * Telegram itself will not hand a bot a file over 20 MB, so that is the ceiling
 * on every row.
 */
export type FileRule = {
  what: string;
  /** "yes" = read here, "no" = not read yet. */
  works: "yes" | "no";
  /** Plain-English detail: how it's handled, or why it isn't. */
  detail: string;
  limit: string;
};

export const TELEGRAM_FILE_RULES: FileRule[] = [
  {
    what: "Photos and screenshots (jpg, png, webp, heic)",
    works: "yes",
    detail: "Looked at properly — what's in the picture, not just the words on it. Add a question as the caption and it steers the look.",
    limit: "Up to 20 MB. Too blurry or dark to make out gets said plainly.",
  },
  {
    what: "PDF",
    works: "yes",
    detail: "Read as text and kept as a file. Scans off your phone count.",
    limit: "Up to 20 MB. A pure-image PDF is read as a picture, not as text.",
  },
  {
    what: "Word documents (.docx)",
    works: "yes",
    detail: "Read as text and kept as a file.",
    limit: "Up to 20 MB. Older .doc files are not read.",
  },
  {
    what: "Plain text and markdown (.txt, .md)",
    works: "yes",
    detail: "Read straight through.",
    limit: "Up to 20 MB.",
  },
  {
    what: "Voice notes and audio files",
    works: "yes",
    detail: "Written out, then treated like anything you typed.",
    limit: "Up to 20 MB — roughly a long voice note, not an hour of recording.",
  },
  {
    what: "Video and video notes",
    works: "no",
    detail: "Not read yet. It gets named and said out loud instead of guessed at.",
    limit: "Send a screenshot of the moment that matters instead.",
  },
  {
    what: "Spreadsheets, slides, zips, .doc, anything else",
    works: "no",
    detail: "Not read yet. The reply names the file and the limitation.",
    limit: "Export a PDF or paste the part that matters.",
  },
];

/** Things that can be read but never written from anywhere, chat included. */
export const TELEGRAM_READ_ONLY: string[] = [
  "Calendars added by a secret link (iCal) — read only, always. Echo says so instead of pretending it moved something.",
  "Anything Echo reads for you — your day, your week, a file, a photo. Reading never stages a change.",
  "Receipts and past events. They can be read back, never edited.",
];

/** Things that deliberately finish inside the app, not in a chat window. */
export const TELEGRAM_APP_ONLY: string[] = [
  "High-stakes or messy changes — several events at once, anything with money or travel riding on it.",
  "Deleting stored records, and undoing something already executed. A staged calendar cancellation can be approved here.",
  "Exports: PDFs, Word files, briefings.",
  "Sending anything to another person, booking, or paying.",
  "Connecting a calendar or an account, and every setting.",
  "Filing at scale — linking a pile of captures to projects.",
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
      "Look at photos and screenshots properly — what's in them, not just the text on them.",
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
      "Big or messy changes get finished in the app. A calendar change that reaches other people needs a second explicit confirmation here.",
      "Calendars you added by link are read-only. It'll say so instead of pretending.",
      "Video isn't read yet, and neither are odd file types. It names the file and says so.",
    ],
  },
  {
    title: "What you can send it",
    lines: [
      "A photo of anything — a receipt, a whiteboard, a sign, a parking spot, a picture you just want read. It says what it's looking at, in plain words.",
      "A photo with a question on it: \"what is this?\", \"how much?\", \"anything off here?\", \"read what it says\". The question steers the look.",
      "A screenshot of a message or a booking, and it pulls out the date, the name and the ask.",
      "A document — PDF, Word, plain text, a scan straight off your phone. It reads it and keeps the file.",
      "A voice note. It writes it out and treats it like anything you typed.",
      "A forwarded message from someone else. It'll say what changed before it drafts anything.",
      "A link or an address. It keeps it attached to the right project or place.",
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

/** The Telegram answer to "how do I use you". Detailed, plain English, no tables. */
export function renderTelegramHelp(): string {
  const commands = TELEGRAM_COMMANDS.map((c) => `${c.cmd}\n   ${c.does}`).join("\n");
  const say = TELEGRAM_PHRASEBOOK.map((p) => `• “${p}”`).join("\n");
  const send = (TELEGRAM_GUIDE.find((s) => s.title === "What you can send it")?.lines ?? [])
    .map((l) => `• ${l}`)
    .join("\n");
  return [
    "Here's the honest rundown, in detail.",
    "",
    "Same Echo as the app — same memory, same calendar, same rules. This is just the field door: quick, one-handed, wherever you are.",
    "",
    "SHORTCUTS",
    commands,
    "",
    "WHAT YOU CAN SEND ME",
    send,
    "",
    "FILES, EXACTLY",
    TELEGRAM_FILE_RULES.map(
      (r) => `${r.works === "yes" ? "✓" : "✗"} ${r.what}\n   ${r.detail}\n   ${r.limit}`,
    ).join("\n"),
    "",
    "READ ONLY, ALWAYS",
    TELEGRAM_READ_ONLY.map((l) => `• ${l}`).join("\n"),
    "",
    "FINISHED IN THE APP, NOT HERE",
    TELEGRAM_APP_ONLY.map((l) => `• ${l}`).join("\n"),
    "",
    "TALKING NORMAL",
    "No keywords, no syntax. Rough voice-to-text is fine. If I'm not sure what you mean, I ask one question instead of guessing. Say “no” or “not that” and I fix the same draft instead of starting over.",
    say,
    "",
    "WHERE IT LANDS",
    "• Notes and files go to memory, attached to the right project or place.",
    "• Promises you make out loud go on the board so they don't get lost.",
    "• Calendar changes wait as a draft with buttons — nothing moves until you tap yes.",
    "• Everything leaves a receipt you can read later in the app.",
    "",
    "WHAT I WON'T DO",
    "• Change anything outside Metro Echo without your yes.",
    "• Guess when two sources disagree — I show you the contradiction first.",
    "• Pretend a calendar you added by link can be edited. It's read-only, and I'll say so.",
    "• Finish big or messy changes from a chat window. Calendar changes that reach other people get a second confirmation here.",
    "• Read video, or file types I don't handle yet. I'll name the file and say so instead of bluffing.",
    "Reading never stages anything. Looking is just looking.",
    "",
    "Full rundown lives in Settings → Telegram, and you can save a copy there.",
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
  out.push("", "## Files, exactly", "");
  out.push("| What you send | Read here? | How it's handled | Limit |", "| --- | --- | --- | --- |");
  for (const r of TELEGRAM_FILE_RULES) {
    out.push(`| ${r.what} | ${r.works === "yes" ? "Yes" : "No"} | ${r.detail} | ${r.limit} |`);
  }
  out.push("", "Telegram will not hand a bot any file over 20 MB, so that is the ceiling on every row.");
  out.push("", "## Read only, always", "");
  for (const l of TELEGRAM_READ_ONLY) out.push(`- ${l}`);
  out.push("", "## Finished in the app, not in the chat", "");
  for (const l of TELEGRAM_APP_ONLY) out.push(`- ${l}`);
  out.push(
    "",
    "## The one rule that never bends",
    "",
    "Capture never executes. Anything that touches the world outside Metro Echo waits for your",
    "approval — in Metro Echo, or for an exact calendar proposal in its linked Telegram chat — and leaves a receipt once it's done.",
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
