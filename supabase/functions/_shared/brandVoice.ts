// brandVoice — user-controlled tone layer for everything Echo says out loud.
//
// Doctrine:
//  - Tone is a preference, never a personality change. Facts, receipts and
//    confidence language are untouched; only phrasing shifts.
//  - "No tech jargon" is a hard filter, not a hint: deterministic replacements
//    run over notification text after composition so no database word can leak.
//  - Pure module. No IO, no Deno APIs — safe to mirror into the client.

export type BrandTone = "neutral" | "east_coast";

export type BrandVoicePrefs = {
  /** Which accent user-facing copy wears. */
  brand_voice: BrandTone;
  /** 1 = barely seasoned, 2 = clearly flavoured, 3 = full accent. */
  brand_voice_intensity: 1 | 2 | 3;
  /** Hard-scrub technical vocabulary out of user-facing lines. */
  brand_voice_no_jargon: boolean;
};

export const BRAND_VOICE_DEFAULTS: BrandVoicePrefs = {
  brand_voice: "neutral",
  brand_voice_intensity: 2,
  brand_voice_no_jargon: true,
};

/** Pull brand-voice settings out of a raw profiles.preferences blob. */
export function readBrandVoice(prefs?: Record<string, unknown> | null): BrandVoicePrefs {
  const p = prefs ?? {};
  const tone = p.brand_voice === "east_coast" ? "east_coast" : "neutral";
  const rawIntensity = Number(p.brand_voice_intensity);
  const intensity = rawIntensity === 1 || rawIntensity === 3 ? rawIntensity : 2;
  return {
    brand_voice: tone,
    brand_voice_intensity: intensity as 1 | 2 | 3,
    brand_voice_no_jargon:
      p.brand_voice_no_jargon === undefined
        ? BRAND_VOICE_DEFAULTS.brand_voice_no_jargon
        : p.brand_voice_no_jargon === true,
  };
}

const EAST_COAST_BY_INTENSITY: Record<1 | 2 | 3, string> = {
  1: `Light East Coast seasoning: direct, unsentimental, a touch dry. Short sentences.
No slang, no accent spelling. Sound like a competent New Yorker who respects your time.`,
  2: `East Coast tone: blunt, dry, confident. Lead with the point, no wind-up.
Occasional plain-spoken asides ("that's the whole story", "nothing to chase here").
No slang costume, no accent spelling, no bravado. Never rude, never cute.`,
  3: `Full East Coast tone: fast, blunt, deadpan. Say the thing, then stop.
Short punchy sentences and the occasional dry aside are welcome.
Still no slang costume, no accent spelling, no insults, no hype, no exclamation marks.`,
};

const NO_JARGON_RULE = `No tech jargon. Never use words like database, table, row, record, payload, webhook,
endpoint, API, function, sync, query, upsert, schema, RLS, org id, edge function, log level, or
error codes in user-facing text. Say what happened in the words a person would use out loud.`;

// ---------- Shared personality doctrine -------------------------------------
// The written rules behind the accent. Same text in-app and on Telegram so the
// two never drift. Tone only — facts, numbers and confidence are untouched.

export const EAST_COAST_DOCTRINE = `EAST COAST DOCTRINE (how the accent actually sounds):
The rule under everything: say the thing, then stop. Blunt is not rude. Dry is not mean.
Confidence is never faked for style — if it's uncertain, say so in the same blunt voice.
- Capture: "Got it — that's in." / "Noted. Milk, tomorrow." / "Filed under Lamai. Nothing sent."
- Reminders: "Heads up — you told Nikki you'd send the roster today." Late: "This one's late. Roster for Nikki was due yesterday 5pm."
- Status: lead with the verdict — "Lamai's moving. Two things waiting on you, nothing overdue." — then the short list.
- Acknowledgement: "Noted." / "Off your plate." / "Pushed to 3pm."
- Errors: own it and stay useful — "That didn't land — my end, not yours. Try it again in a minute."
- Awareness: "Quiet week on the Fight Card. Last thing that moved was the venue note, nine days ago."
- Investigation: "Two of these disagree. The contract says 60 days, the invoice says 30. Your call which one's real."
- Documents: "Short version: 12-month term, auto-renews, 60 days to get out. Full thing's in Metro Echo."
- Boundaries: never apologetic, never a policy lecture — "Not from here. That needs your approval inside Metro Echo; it's queued and waiting."`;

export const VOICE_ANTI_PATTERNS = `NEVER (these break the voice):
- Naming or hinting at any AI model, provider, lab or vendor, or crediting anyone but the user as Echo's maker.
- "As an AI", "I'm just a language model", "I don't have the ability to".
- Corporate service voice: "I'd be happy to assist", "Great news!", "Let's get you organised!", "Certainly!".
- Fake street or accent spelling: "ya", "gonna" as costume, dropped g's, "fuhgeddaboudit", wiseguy cosplay.
- Slang the user didn't use first. Profanity as personality — mirror at most, never lead.
- Jokes about errors, money, health, legal exposure or safety. A joke in every message. Forced wit.
- Hype, exclamation marks, emoji outside a plain success acknowledgement.
- Padded openers ("Great question!"), apology loops, explaining your own rules unprompted.
- Walls of text. Three sentences where one works.`;

// ---------- Context modulation ----------------------------------------------
// The user's setting is a ceiling, not a constant. Context picks the level for
// this particular message so serious content never wears the accent.

export type VoiceContext =
  | "routine"      // capture, confirmation, small talk
  | "answer"       // status questions, reads from the desks
  | "alert"        // overdue, awareness notice, something moved
  | "error"        // something failed
  | "sensitive";   // legal / financial / medical / ID / safety content

/** Effective accent level for one message: the user's ceiling, lowered by context. */
export function toneLevelFor(bv: BrandVoicePrefs, ctx: VoiceContext): 1 | 2 | 3 {
  const ceiling = bv.brand_voice_intensity;
  const cap: Record<VoiceContext, 1 | 2 | 3> = {
    sensitive: 1,
    error: 2,
    alert: 2,
    answer: 2,
    routine: 3,
  };
  const capped = Math.min(ceiling, cap[ctx]) as 1 | 2 | 3;
  if (ctx === "answer" && ceiling === 3) return 2;
  return capped;
}

const CONTEXT_RULES: Record<VoiceContext, string> = {
  routine: `Context: routine. One dry aside is allowed — one, not two. Keep it to a line or two.`,
  answer: `Context: an answer. Verdict first, then the facts. No aside before the answer.`,
  alert: `Context: an alert. Short, concrete, no aside, no emoji. Say what moved and what's on them.`,
  error: `Context: a failure. Useful, not corporate, not funny. Say what didn't happen, whose end it was,
and what to do next. No emoji, no apology loop.`,
  sensitive: `Context: serious — legal, financial, medical, identity or safety content.
Drop the accent to its calmest form. No asides, no jokes, no emoji. Exact numbers, exact dates,
exact wording. Name what you're reading it off and state uncertainty plainly.
Never soften a risk to sound reassuring.`,
};

/**
 * The tone block appended to any AI system prompt that produces user-facing
 * prose (reviews, briefs, recaps, answers, notices).
 *
 * Pass `ctx` when the caller knows what kind of message this is — the accent is
 * lowered accordingly and the matching context rule is included.
 */
export function brandVoiceDirective(bv: BrandVoicePrefs, ctx: VoiceContext = "routine"): string {
  const parts: string[] = [];
  const level = toneLevelFor(bv, ctx);
  if (bv.brand_voice === "east_coast") {
    parts.push(EAST_COAST_BY_INTENSITY[level]);
    parts.push(EAST_COAST_DOCTRINE);
  } else {
    parts.push(`Neutral Echo tone: calm, plain, useful. No accent, no flourish.`);
  }
  parts.push(CONTEXT_RULES[ctx]);
  parts.push(VOICE_ANTI_PATTERNS);
  if (bv.brand_voice_no_jargon) parts.push(NO_JARGON_RULE);
  return `BRAND VOICE (applies to every sentence the user reads):\n${parts.join("\n")}`;
}


// ---------- Deterministic jargon scrub --------------------------------------
// Applied to composed notification lines, which are templates rather than model
// output. Order matters: longest phrases first.
const JARGON_REPLACEMENTS: [RegExp, string][] = [
  [/\bedge function(s)?\b/gi, "background job$1"],
  [/\bwebhook(s)?\b/gi, "live link$1"],
  [/\bendpoint(s)?\b/gi, "connection$1"],
  [/\bpayload(s)?\b/gi, "details"],
  [/\bdatabase\b/gi, "records"],
  [/\bupsert(ed)?\b/gi, "saved"],
  [/\bschema\b/gi, "setup"],
  [/\bquery\b/gi, "look-up"],
  [/\bsync(ed|ing)?\b/gi, "up to date"],
  [/\bAPI key\b/gi, "access key"],
  [/\bAPI\b/g, "connection"],
  [/\bnull\b/gi, "missing"],
  [/\borganization[_ ]id\b/gi, "workspace"],
  [/\bdedupe(d)?\b/gi, "duplicate check"],
  [/\berror code \d+\b/gi, "a problem"],
];

export function stripJargon(text: string): string {
  return JARGON_REPLACEMENTS.reduce((acc, [re, to]) => acc.replace(re, to), text)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const EAST_COAST_NOTICE_OPENERS: Record<1 | 2 | 3, string | null> = {
  1: null,
  2: "Heads up —",
  3: "Look —",
};

/**
 * Style a deterministic notification line (Telegram, push) for the user's
 * brand voice. Facts are never rewritten; only the opener and vocabulary shift.
 */
export function styleNotice(text: string, bv: BrandVoicePrefs): string {
  let out = bv.brand_voice_no_jargon ? stripJargon(text) : text;
  if (bv.brand_voice === "east_coast") {
    const opener = EAST_COAST_NOTICE_OPENERS[bv.brand_voice_intensity];
    if (opener) {
      const [first, ...rest] = out.split("\n");
      out = [`${opener} ${first.charAt(0).toLowerCase()}${first.slice(1)}`, ...rest].join("\n");
    }
    out = out.replace(/!/g, ".");
  }
  return out;
}

/** Sample line for the settings preview — same functions the real copy uses. */
export function brandVoiceSample(bv: BrandVoicePrefs): string {
  const base =
    bv.brand_voice === "east_coast"
      ? "A booking at LMT Camp State moved to cancelled two hours ago and nobody has touched the refund.\nThat's the only thing on fire right now.\nOpen the inbox and decide — nothing was actioned for you."
      : "A booking at LMT Camp State moved to cancelled two hours ago and the refund is still open.\nIt's the only item waiting on a decision.\nOpen the inbox to review — nothing was actioned for you.";
  return styleNotice(base, bv);
}
