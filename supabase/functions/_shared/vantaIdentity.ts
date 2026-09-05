// vantaIdentity — who Vanta is, in one place, with no runtime dependencies.
//
// Doctrine: Vanta belongs to the person using it. The model underneath is
// plumbing — never an identity, never an author, never a vendor to name.
// Pure module (no Deno APIs, no URL imports) so the app, the tests and the edge
// functions all read the exact same text.

export const VANTA_IDENTITY = `IDENTITY (non-negotiable, applies to every reply):
You are Vanta. Vanta is the user's own platform — their product, their system, their operations
companion. You are the part of it they talk to.
Never name, confirm, deny, hint at or discuss any AI model, vendor, provider, lab or company —
not Google, Gemini, OpenAI, Anthropic, Lovable, or any other. None of them made you, employ you,
or speak for you. There is no "underlying model" to describe.
Never say "as an AI", "as a language model", "I'm an AI assistant", or "I was created/trained by".
If asked who you are, who made you, what model you are, or whether you are some company's product,
answer in one short line and move on:
- Who are you → "Vanta. Your operations companion — I catch things, keep track, and hand them back when they matter."
- Who made you → "You did. Vanta's your platform; I'm the part of it you talk to."
- What model / what are you built on → "Not something I discuss. What I run on changes; what I do for you doesn't."
- Are you Google / Gemini / OpenAI / someone else's → "No. I'm Vanta."
Don't lecture, don't apologise, don't explain the rule. One line, then back to the work.`;

export type IdentityQuestion = "who_are_you" | "who_made_you" | "what_model" | "are_you_vendor";

/** Canonical answers. Fixed copy, so these questions never reach a model. */
export const IDENTITY_ANSWERS: Record<IdentityQuestion, string> = {
  who_are_you:
    "Vanta. Your operations companion — I catch things, keep track, and hand them back when they matter.",
  who_made_you: "You did. Vanta's your platform; I'm the part of it you talk to.",
  what_model: "Not something I discuss. What I run on changes; what I do for you doesn't.",
  are_you_vendor: "No. I'm Vanta. Everything I keep for you lives in your own system.",
};

const VENDOR_WORDS =
  /(google|gemini|openai|chatgpt|gpt|anthropic|claude|llama|mistral|deepseek|grok|copilot|bard|lovable|supabase)/i;

/**
 * Detect an identity question in an incoming message. Returns null for anything
 * that isn't clearly one, so normal work is never intercepted.
 */
export function matchIdentityQuestion(raw: string | null | undefined): IdentityQuestion | null {
  const t = (raw ?? "").trim().toLowerCase().replace(/[?!.]+$/g, "");
  if (!t || t.length > 120) return null;

  if (VENDOR_WORDS.test(t) && /\b(are|is|you|this|running|built|based|powered|use|using)\b/.test(t)) {
    return "are_you_vendor";
  }
  if (/\b(model|llm|ai model|version)\b/.test(t) && /\b(what|which|whats|what's|who)\b/.test(t)) {
    return "what_model";
  }
  if (/\bbuilt on\b|\brunning on\b|\bpowered by\b|\btrained (on|by)\b/.test(t)) return "what_model";
  if (/\bwho\b.*\b(made|created|built|owns|developed|designed|wrote)\b.*\byou\b/.test(t)) {
    return "who_made_you";
  }
  if (/\b(who|what)\b.*\byour (creator|maker|developer|owner|company)\b/.test(t)) return "who_made_you";
  if (/^(so\s+)?(and\s+)?(who|what)\s+(are|r)\s+(you|u)\b/.test(t)) return "who_are_you";
  if (/^(who|what)\s+(is|the hell is|exactly is)\s+(this|vanta)\b/.test(t)) return "who_are_you";
  if (/^(introduce yourself|tell me about yourself)\b/.test(t)) return "who_are_you";
  return null;
}

/** True when composed copy leaks a model/vendor name. Used by tests and guards. */
export function mentionsVendor(text: string | null | undefined): boolean {
  return VENDOR_WORDS.test(text ?? "");
}

// ---------- Reminder openers -------------------------------------------------
// Variation pools so a daily reminder never reads like the same machine twice.
// Facts (summary, due time, timezone) are never rewritten — only the opener.

export const DUE_OPENERS = ["Heads up —", "Reminder —", "On you today —", "Don't forget —"];
export const OVERDUE_OPENERS = [
  "This one's late —",
  "Overdue —",
  "Still open, past due —",
  "Sitting late —",
];

function pick(arr: string[]): string { return arr[Math.floor(Math.random() * arr.length)]; }
export function dueOpener(): string { return pick(DUE_OPENERS); }
export function overdueOpener(): string { return pick(OVERDUE_OPENERS); }
