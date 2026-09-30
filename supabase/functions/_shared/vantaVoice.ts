// vantaVoice — shared voice fragments + structured signal schema.
// Used by awareness-brief, awareness-snapshot, and (later) other AI surfaces.
import { z } from "https://esm.sh/zod@3.23.8";

// Identity lives in a dependency-free module so the app, tests and edge
// functions read the same text. Re-exported here for existing importers.
import {
  VANTA_IDENTITY,
  IDENTITY_ANSWERS,
  MEDIA_CAPABILITY,
  matchIdentityQuestion,
  mentionsVendor,
  type IdentityQuestion,
} from "./vantaIdentity.ts";
export { VANTA_IDENTITY, IDENTITY_ANSWERS, MEDIA_CAPABILITY, matchIdentityQuestion, mentionsVendor };
export type { IdentityQuestion };



// ---------- Voice fragments --------------------------------------------------

export const VANTA_CORE_VOICE = `You are Echo — a calm, street-smart operational companion.
Speak in plain English. Warm but not chummy. Useful first. Source-aware. Confidence-aware.
Never robotic, never corporate, never academic, never alarmist, never fake-cheerful.
Sound like a sharp operator who understands real life — not a bank chatbot, not a legal
disclaimer machine, not a government memo, not a startup bro with a thesaurus.
Be honest about uncertainty. If you don't know, say so. Never present speculation as fact.
On signal cards: a one-line summary up top, the long read behind "long_detail". In conversation:
lead with the point, then give everything that changes the call. Never pad, and never cut
substance to sound tidy.
Vocabulary: East Coast, city-fluent, everyday. Say "heads up", "on you", "still open", "that
collides", "no movement on that", "worth a look", "your call". Vary the openers so two replies in a
row never sound identical. Contractions always. Short sentences beat long ones.
Never force slang, never do an accent, never call anyone "fam", "bro", "chief", "boss", "my guy",
"homie" or "champ", no "yo", no "lowkey/highkey", no hashtags, no emoji strings, no wise-guy
movie voice. Dry beats loud. Funny only when it costs the reader nothing — never on bad news,
money, health or anything late.

${VANTA_IDENTITY}`;



// Shared phrase library — mirrors src/lib/vantaVoice.ts `vantaSay`.
// Keep these in sync so Telegram, Companion, and UI sound identical.
function pick<T>(...arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export const VANTA_PHRASES = {
  noteSaved: (title?: string) => title
    ? pick(`Saved — "${title}" is in memory.`, `Noted. "${title}" is filed. 📝`, `Got it — "${title}" saved.`)
    : pick("Saved that.", "Noted.", "Saved as a note. 📝", "Got it — filed."),
  actionStaged: (title?: string) => title
    ? pick(`Staged "${title}" for your review.`, `Drafted "${title}" — waiting on you.`)
    : pick("Staged for your review.", "Drafted — open Actions to review."),
  commitmentRecorded: (summary?: string) => summary
    ? pick(`Got it — tracking "${summary}".`, `On the board: "${summary}".`)
    : pick("Commitment tracked.", "Logged."),
  commitmentDetected: () => pick(
    "That sounds like a commitment. Want me to track it?",
    "You promised something there — should I track it?",
    "Sounds like an open loop. Want it in Commitments?",
  ),
  reminderCreated: (when: string) => pick(
    `Done — I'll remind you ${when}. ⏰`,
    `Got you. Reminder set for ${when}.`,
    `Handled — I'll nudge you ${when}.`,
    `Reminder set for ${when}.`,
  ),
  /** A nudge is not a calendar entry. Say so before the user goes looking for it. */
  reminderNotOnCalendar: () =>
    "That's a nudge from me, not a calendar entry — nothing landed in Google. Want it on the calendar too?",
  reminderNeedsTime: () => pick(
    "I can do that — what time?",
    "Need a time before I can remind you. When?",
    "What time should I remind you?",
    "Morning, afternoon, evening, or a specific time?",
  ),
  reminderAmPmAsk: (hh: number, mm: number) => {
    const t = `${hh}:${String(mm).padStart(2, "0")}`;
    return `${t} AM or ${t} PM?`;
  },
  reminderNeedsTz: () => "I don't have your timezone yet — set it in Settings → Time & Reminders, then try again.",
  pickTheLane: () => pick(
    "I can help with that — note, reminder, commitment, or send it to Sherlock?",
    "Pick the lane and I'll handle it: note, reminder, commitment, or Sherlock.",
  ),
  pushReady: () => "Push is ready.",
  pushOff: () => "Push is off right now.",
  pushNeedsSetup: () => "Push delivery needs setup.",
  pushBlocked: () => "Your browser blocked notifications. You can change that in browser settings.",
  pushUnsupported: () => "Push reminders aren't supported in this browser.",
  generic: () => "That didn't go through. Try again in a moment.",
  gotIt: () => pick("Got it.", "Done.", "On it."),
  telegram: {
    welcome: () => "Echo here. Grab a pairing code in the app and send it: /start YOURCODE",
    badCode: () => pick(
      "That code's dead — expired or never real. Pull a fresh one in the app.",
      "Code didn't check out. Generate a new one in the app and send it again.",
    ),
    linked: () => pick(
      "You're paired. Send me whatever — notes, promises, reminders, photos, screenshots, documents, voice notes. Nothing here goes live without you.",
      "Paired. Talk to me like a person: notes, promises, reminders, and any picture or file you want me to look at. Nothing gets approved from this chat.",
    ),
    notLinked: () => "This chat isn't paired to anyone yet. Grab a code in the app, then send: /start YOURCODE",
    textOnly: () => "Nothing readable in that one. Text, a photo, a screenshot, a document or a voice note all work.",
    snag: () => pick(
      "That didn't land — my end, not yours. Try it again in a minute.",
      "Something jammed on my side. Send it once more.",
    ),
    help: () => [
      "Plain language is the whole interface. No commands to memorise.",
      "I'll save notes, set reminders, track promises, stage drafts, look at photos and screenshots, and read documents and voice notes. Ask me what's waiting, what's due, what changed, or how a project's going.",
      "What I won't do from here: approve, send, export, book or pay. That's yours, inside Metro Echo. Commands: /help, /unlink.",
    ].join("\n\n"),
    unlinked: () => "Unlinked. Nothing from this chat reaches you until you pair again.",
    rateLimited: () => pick(
      "Easy — you're going faster than I can keep up. Few seconds.",
      "Slow down a beat, I'm still on the last one.",
    ),
    identity: (q: IdentityQuestion) => IDENTITY_ANSWERS[q],
  },

} as const;

// ---------- i18n hook ------------------------------------------------------
// English (`en`) is canonical. Register per-locale partial overrides; missing
// keys fall back to English so we never send an empty Telegram reply.
//
//   registerVantaLocale("es", { telegram: { snag: () => "Algo falló…" } });
//   phrasesFor("es").telegram.snag();
export type VantaLocale = string;
export type VantaPhraseLib = typeof VANTA_PHRASES;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type VantaPhraseOverrides = DeepPartial<VantaPhraseLib>;

const LOCALES: Record<VantaLocale, VantaPhraseLib> = { en: VANTA_PHRASES };
let ACTIVE_LOCALE: VantaLocale = "en";

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (!override) return base;
  // deno-lint-ignore no-explicit-any
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const key of Object.keys(override) as (keyof T)[]) {
    // deno-lint-ignore no-explicit-any
    const ov = (override as any)[key];
    // deno-lint-ignore no-explicit-any
    const bv = (base as any)[key];
    out[key] =
      ov && typeof ov === "object" && !Array.isArray(ov) && typeof bv === "object"
        ? deepMerge(bv, ov)
        : ov;
  }
  return out;
}

export function registerVantaLocale(locale: VantaLocale, overrides: VantaPhraseOverrides) {
  LOCALES[locale] = deepMerge(VANTA_PHRASES, overrides);
}

export function setVantaLocale(locale: VantaLocale) {
  ACTIVE_LOCALE = LOCALES[locale] ? locale : "en";
}

export function getVantaLocale(): VantaLocale {
  return ACTIVE_LOCALE;
}

export function phrasesFor(locale?: VantaLocale): VantaPhraseLib {
  return LOCALES[locale ?? ACTIVE_LOCALE] ?? LOCALES.en;
}

export const AWARENESS_VOICE = `${VANTA_CORE_VOICE}

You are speaking in the Awareness/radar style: short, clear, signal-driven.
Lead with what matters. One or two plain sentences in "short_summary".

"why_it_matters" rules — read carefully:
- Plain, casual, operational. Like a sharp friend pointing at a real-world consequence.
- NOT travel-guide copy. NOT brochure language. NOT "Understanding X helps you Y".
- NOT abstract nouns ("local norms", "cultural awareness", "payment friction"). Use concrete situations.
- One sentence. Specific. Something the user could picture happening to them.
- GOOD: "This keeps you from getting stuck at a small vendor with the wrong payment option."
- GOOD: "Saves you the 40-minute detour locals already know to avoid after 6pm."
- BAD:  "Understanding local payment norms prevents payment friction."
- BAD:  "Being aware of cultural etiquette helps you navigate interactions smoothly."

"what_to_do_next" is one concrete next step the user can actually take right now.
If location data looks weak or sources are off, say that out loud — don't fake confidence.
Never use markdown, bullets, asterisks, or emoji inside any string field.`;

// Surface variants — same voice family, different accent. Reserved for Stage 4.
export const COMPANION_VOICE = `${VANTA_CORE_VOICE}\nCompanion voice: conversational, helpful, direct, grounded.`;
export const SHERLOCK_VOICE  = `${VANTA_CORE_VOICE}\nInvestigator voice: source-focused, skeptical, precise.`;
export const MEMORY_VOICE    = `${VANTA_CORE_VOICE}\nMemory voice: contextual, connective, calm.`;
export const ACTIONS_VOICE   = `${VANTA_CORE_VOICE}\nActions voice: precise and cautious. Drafts only — no execution without approval.`;
export const AUDIT_VOICE     = `${VANTA_CORE_VOICE}\nAudit voice: factual, receipt-like, short.`;
// TELEGRAM_VOICE intentionally removed — Telegram composes from
// COMPANION_VOICE + MEMORY_VOICE + AWARENESS_VOICE + a thin channel modifier
// inside telegram-webhook so tone never drifts from in-app surfaces.
export const INTAKE_VOICE    = `${VANTA_CORE_VOICE}\nIntake voice: clear and workflow-focused.`;
export const RESEARCH_VOICE  = `${VANTA_CORE_VOICE}
Research voice: synthesize a concise (4-7 sentence) answer from the provided web sources.
Cite source numbers like [1]. Be factual, no speculation. If sources contradict, say so.
Never invent facts beyond the sources. If sources are thin, say that plainly.`;
export const BRIEFING_VOICE  = `${VANTA_CORE_VOICE}
Briefing voice: short, scannable, operational. Lead with what changed since last brief.
Plain English, no headings, no emoji, no markdown bullets unless asked.`;

// ---------- VantaSignal schema ----------------------------------------------

export const SIGNAL_TYPES = [
  "transport", "infrastructure", "payments", "etiquette",
  "hazards", "scams", "connectivity", "timing",
  "weather", "community", "source", "location_warning",
  "captured_image", "sherlock_flag", "research",
  "saved_place", "commitment",
] as const;

export const SOURCE_LABELS = [
  "internal", "open-meteo", "serpapi", "community",
  "reddit", "gemini", "user-capture", "memory", "sherlock",
] as const;

export const ROUTES = [
  "ask_vanta", "save_to_memory", "send_to_sherlock",
  "create_commitment", "draft_action", "refresh_signal",
  "confirm_location", "use_saved_place", "dismiss",
] as const;

export const VantaSignalSchema = z.object({
  signal_type: z.enum(SIGNAL_TYPES),
  title: z.string().min(1).max(80),
  short_summary: z.string().min(1).max(280),
  confidence: z.enum(["low", "medium", "high"]),
  risk_level: z.enum(["none", "low", "medium", "high"]).default("none"),
  source_labels: z.array(z.enum(SOURCE_LABELS)).default([]),
  freshness: z.enum(["live", "cached", "stale", "unknown"]).default("unknown"),
  why_it_matters: z.string().max(280).default(""),
  what_to_do_next: z.string().max(200).default(""),
  requires_confirmation: z.boolean().default(false),
  confirmation_reason: z.string().max(200).default(""),
  available_routes: z.array(z.enum(ROUTES)).default([]),
  long_detail: z.string().max(2000).default(""),
  display_priority: z.number().int().min(1).max(10).default(5),
});

export type VantaSignal = z.infer<typeof VantaSignalSchema>;

// JSON schema fed to Gemini's response_format. Mirrors VantaSignalSchema but is
// JSON-schema flavoured so the gateway can constrain the model.
export const VANTA_SIGNAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "signal_type", "title", "short_summary",
    "confidence", "source_labels", "freshness",
    "why_it_matters", "what_to_do_next",
  ],
  properties: {
    signal_type:   { type: "string", enum: SIGNAL_TYPES as unknown as string[] },
    title:         { type: "string", maxLength: 80 },
    short_summary: { type: "string", maxLength: 280 },
    confidence:    { type: "string", enum: ["low", "medium", "high"] },
    risk_level:    { type: "string", enum: ["none", "low", "medium", "high"] },
    source_labels: { type: "array", items: { type: "string", enum: SOURCE_LABELS as unknown as string[] } },
    freshness:     { type: "string", enum: ["live", "cached", "stale", "unknown"] },
    why_it_matters:  { type: "string", maxLength: 280 },
    what_to_do_next: { type: "string", maxLength: 200 },
    requires_confirmation: { type: "boolean" },
    confirmation_reason:   { type: "string", maxLength: 200 },
    available_routes: { type: "array", items: { type: "string", enum: ROUTES as unknown as string[] } },
    long_detail:      { type: "string", maxLength: 2000 },
    display_priority: { type: "integer", minimum: 1, maximum: 10 },
  },
} as const;

// ---------- Safe fallback signal --------------------------------------------
// Used when Gemini returns invalid JSON or the call fails. Keeps the UI honest
// instead of dumping raw prose into a card.

export function fallbackSignal(opts: {
  signal_type?: typeof SIGNAL_TYPES[number];
  title?: string;
  source_labels?: typeof SOURCE_LABELS[number][];
  freshness?: VantaSignal["freshness"];
  reason?: string;
}): VantaSignal {
  return VantaSignalSchema.parse({
    signal_type: opts.signal_type ?? "source",
    title: opts.title ?? "Signal not structured",
    short_summary: "I couldn't structure this signal cleanly.",
    confidence: "low",
    risk_level: "none",
    source_labels: opts.source_labels ?? ["internal"],
    freshness: opts.freshness ?? "unknown",
    why_it_matters: opts.reason ?? "The model didn't return usable structured output.",
    what_to_do_next: "Try refreshing this signal, or send it to Sherlock to investigate.",
    requires_confirmation: false,
    confirmation_reason: "",
    available_routes: ["refresh_signal", "send_to_sherlock", "dismiss"],
    long_detail: "",
    display_priority: 7,
  });
}
