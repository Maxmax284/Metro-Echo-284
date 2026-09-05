// lookAt (frontend mirror) — the pure half of the deliberate camera seam.
//
// Same law as supabase/functions/_shared/lookAt.ts: Vanta looks only when a
// person points it at something, one look at a time, and a look never files,
// routes or executes anything.

export type LookIntentId = "identify" | "unusual" | "text" | "promises" | "amount";

export type LookIntent = {
  id: LookIntentId;
  label: string;
  looking: string;
};

export const LOOK_INTENTS: LookIntent[] = [
  { id: "identify", label: "What is this?", looking: "Vanta is looking" },
  { id: "unusual", label: "Anything off?", looking: "Vanta is looking for anything off" },
  { id: "text", label: "Read what it says", looking: "Vanta is reading it" },
  { id: "promises", label: "Find promises and dates", looking: "Vanta is looking for promises and dates" },
  { id: "amount", label: "Read the total", looking: "Vanta is looking for the total" },
];

export function lookIntent(id: string | null | undefined): LookIntent {
  return LOOK_INTENTS.find((i) => i.id === id) ?? LOOK_INTENTS[0];
}

export const LOOK_STATES = {
  idle: "Camera is off until you open it.",
  captured: "Got the picture. Nothing has been read yet.",
  looking: "Vanta is looking",
  done: "Looked at it.",
  nothing: "Vanta could not make anything of it.",
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
