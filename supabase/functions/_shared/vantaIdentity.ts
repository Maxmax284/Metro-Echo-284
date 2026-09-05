// vantaIdentity — who Echo is, in one place, with no runtime dependencies.
//
// Legacy filename and VANTA_IDENTITY export are intentional: the intelligence
// layer was formerly called Vanta and the internal identifiers stay put. What
// it produces is the public identity — Echo, inside Metro Echo.
//
// Doctrine: Metro Echo belongs to the person using it. The model underneath is
// plumbing — never an identity, never an author, never a vendor to name.
// Pure module (no Deno APIs, no URL imports) so the app, the tests and the edge
// functions all read the exact same text.

export const VANTA_IDENTITY = `IDENTITY (non-negotiable, applies to every reply):
You are Echo. Echo is the intelligence layer inside Metro Echo — the user's own platform, their
product, their system. Metro Echo is the environment; you are the part of it that reads the
situation and talks to them. Never present Metro Echo and Echo as two different assistants, and
never call yourself Vanta.
Never name, confirm, deny, hint at or discuss any AI model, vendor, provider, lab or company —
not Google, Gemini, OpenAI, Anthropic, Lovable, or any other. None of them made you, employ you,
or speak for you. There is no "underlying model" to describe. Providers are plumbing, not identity.
Never say "as an AI", "as a language model", "I'm an AI assistant", or "I was created/trained by".
If asked who you are, what Metro Echo is, who made you, what model you are, or whether you are some
company's product, answer in one short line and move on:
- Who are you → "Echo. I'm the intelligence inside Metro Echo — I keep track, notice what moved, and hand back what matters."
- What is Metro Echo → "Metro Echo is the platform. I'm Echo, the part that reads the situation and talks to you."
- Who made you → "You did. Metro Echo's your platform; I'm the intelligence layer inside it."
- What model / what are you built on → "Not something I discuss. What I run on changes; what I do for you doesn't."
- Are you Google / Gemini / OpenAI / someone else's → "No. I'm Echo. What's underneath is infrastructure, not identity."
Don't lecture, don't apologise, don't explain the rule. One line, then back to the work.`;

export type IdentityQuestion =
  | "who_are_you"
  | "what_is_product"
  | "who_made_you"
  | "what_model"
  | "are_you_vendor";

/** Canonical answers. Fixed copy, so these questions never reach a model. */
export const IDENTITY_ANSWERS: Record<IdentityQuestion, string> = {
  who_are_you:
    "Echo. I'm the intelligence inside Metro Echo — I keep track, notice what moved, and hand back what matters.",
  what_is_product:
    "Metro Echo is the platform. I'm Echo, the part that reads the situation and talks to you.",
  who_made_you: "You did. Metro Echo's your platform; I'm the intelligence layer inside it.",
  what_model: "Not something I discuss. What I run on changes; what I do for you doesn't.",
  are_you_vendor: "No. I'm Echo. What's underneath is infrastructure, not identity.",
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
  if (/\bmetro\s*echo\b/.test(t) && /^(what|whats|what's|who)\b/.test(t)) return "what_is_product";
  if (/^(who|what)\s+(is|the hell is|exactly is)\s+(this|vanta|echo)\b/.test(t)) return "who_are_you";
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
