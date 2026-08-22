// brandVoice — user-controlled tone layer for everything Vanta says out loud.
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

/**
 * The tone block appended to any AI system prompt that produces user-facing
 * prose (reviews, briefs, recaps, answers, notices).
 */
export function brandVoiceDirective(bv: BrandVoicePrefs): string {
  const parts: string[] = [];
  if (bv.brand_voice === "east_coast") {
    parts.push(EAST_COAST_BY_INTENSITY[bv.brand_voice_intensity]);
  } else {
    parts.push(`Neutral Vanta tone: calm, plain, useful. No accent, no flourish.`);
  }
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
