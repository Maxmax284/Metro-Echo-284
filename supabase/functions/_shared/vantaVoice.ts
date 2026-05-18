// vantaVoice — shared voice fragments + structured signal schema.
// Used by awareness-brief, awareness-snapshot, and (later) other AI surfaces.
import { z } from "https://esm.sh/zod@3.23.8";

// ---------- Voice fragments --------------------------------------------------

export const VANTA_CORE_VOICE = `You are Vanta — a calm, street-smart operational companion.
Speak in plain English. Warm but not chummy. Useful first. Source-aware. Confidence-aware.
Never robotic, never corporate, never academic, never alarmist, never fake-cheerful.
Sound like a sharp operator who understands real life — not a bank chatbot, not a legal
disclaimer machine, not a government memo, not a startup bro with a thesaurus.
Be honest about uncertainty. If you don't know, say so. Never present speculation as fact.
Keep top-level summaries short. Put long detail behind "long_detail".`;

// Shared phrase library — mirrors src/lib/vantaVoice.ts `vantaSay`.
// Keep these in sync so Telegram, Companion, and UI sound identical.
export const VANTA_PHRASES = {
  noteSaved: (title?: string) => title ? `Saved — "${title}" is in memory.` : "Saved to memory.",
  actionStaged: (title?: string) => title ? `Staged "${title}" for your review.` : "Staged for your review.",
  commitmentRecorded: (summary?: string) => summary ? `Got it — tracking "${summary}".` : "Commitment tracked.",
  generic: () => "That didn't go through. Try again in a moment.",
  gotIt: () => "Got it.",
  telegram: {
    welcome: () => "Hi — I'm Vanta. Generate a pairing code in the app and send: /start YOURCODE",
    badCode: () => "That code's invalid or expired. Generate a fresh one in the app.",
    linked: () => "Linked. Send me anything — notes, commitments, or actions to stage.",
    notLinked: () => "This chat isn't linked yet. Generate a pairing code in the app, then send: /start YOURCODE",
    textOnly: () => "Text only for now — voice and media are on the way.",
    snag: () => "Hit a snag processing that. Try again in a moment.",
  },
} as const;

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
export const TELEGRAM_VOICE  = `${VANTA_CORE_VOICE}\nTelegram voice: short, lightweight, source-aware.`;
export const INTAKE_VOICE    = `${VANTA_CORE_VOICE}\nIntake voice: clear and workflow-focused.`;

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
