// lookAt (frontend mirror) — the pure half of the deliberate camera seam.
//
// Same law as supabase/functions/_shared/lookAt.ts: Echo looks only when a
// person points it at something, one look at a time, and a look never files,
// routes or executes anything.

export type LookIntentId = "identify" | "unusual" | "text" | "promises" | "amount";

export type LookIntent = {
  id: LookIntentId;
  label: string;
  looking: string;
};

export const LOOK_INTENTS: LookIntent[] = [
  { id: "identify", label: "What is this?", looking: "Echo is looking" },
  { id: "unusual", label: "Anything off?", looking: "Echo is looking for anything off" },
  { id: "text", label: "Read what it says", looking: "Echo is reading it" },
  { id: "promises", label: "Find promises and dates", looking: "Echo is looking for promises and dates" },
  { id: "amount", label: "Read the total", looking: "Echo is looking for the total" },
];

export function lookIntent(id: string | null | undefined): LookIntent {
  return LOOK_INTENTS.find((i) => i.id === id) ?? LOOK_INTENTS[0];
}

export const LOOK_STATES = {
  idle: "Camera is off until you open it.",
  captured: "Got the picture. Nothing has been read yet.",
  looking: "Echo is looking",
  done: "Looked at it.",
  nothing: "Echo could not make anything of it.",
} as const;

/** Only pictures can be looked at. */
export function isLookableFile(file: { name?: string | null; type?: string | null }): boolean {
  const mime = (file.type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const ext = (file.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp", "heic", "heif", "gif", "avif"].includes(ext);
}

/** What the follow-up question in Ask should be, once a look came back. */
export function askAboutLook(intentId: LookIntentId, filename: string): string {
  switch (intentId) {
    case "amount":
      return `About the picture I showed you (${filename}) — what should I do with this receipt?`;
    case "promises":
      return `About the picture I showed you (${filename}) — turn what you found into commitments I can review.`;
    case "unusual":
      return `About the picture I showed you (${filename}) — what should I do about what you saw?`;
    case "text":
      return `About the picture I showed you (${filename}) — summarize what it says.`;
    default:
      return `About the picture I showed you (${filename}) — tell me more.`;
  }
}

/**
 * The one line said after a look: where it went, and one offer worth making.
 * Mirrors supabase/functions/_shared/lookAt.ts — saving is safe and already
 * done, filing under a project is an offer, never a silent decision.
 */
export function afterLookLine(intentId: LookIntentId): string {
  switch (intentId) {
    case "text":
      return "It's in your Inbox. Want it saved as a note?";
    case "amount":
      return "It's in your Inbox. Want it filed under a project?";
    case "promises":
      return "It's in your Inbox. Want these tracked as promises?";
    default:
      return "It's in your Inbox. Want the text pulled out, or filed under a project?";
  }
}
