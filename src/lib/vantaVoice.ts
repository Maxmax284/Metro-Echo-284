// vantaVoice — unified voice + phrase library for client surfaces.
// Mirrors supabase/functions/_shared/vantaVoice.ts. Keep PHRASES in sync there.
//
// Use this module for every empty state, toast, confirmation, and inline status
// message so Companion, Telegram, and UI all sound like the same operator.
//
// Tone rules:
//   - Plain English. Warm but not chummy. Useful first.
//   - No emoji, no markdown, no exclamation marks unless the user wins something.
//   - Acknowledge uncertainty out loud. Never fake confidence.
//   - Short. One sentence beats two. Two beat three.
import { toast as sonnerToast } from "sonner";

export const VANTA_VOICE_RULES = `Plain English. Warm but not chummy. Useful first.
Source- and confidence-aware. Never robotic, never corporate, never fake-cheerful.
If you don't know, say so. Keep it short.`;

// ---------- Phrase library --------------------------------------------------
// Grouped by intent. Functions take light context so the phrase still sounds
// human ("Saved that note." vs "Saved.") without callers writing copy.

export const vantaSay = {
  // Capture / staging
  noteSaved: (title?: string) =>
    title ? `Saved — "${title}" is in memory.` : "Saved to memory.",
  noteEmbedFailed: () => "Saved, but I couldn't index it for search yet.",
  actionStaged: (title?: string) =>
    title ? `Staged "${title}" for your review.` : "Staged for your review.",
  commitmentRecorded: (summary?: string) =>
    summary ? `Got it — tracking "${summary}".` : "Commitment tracked.",
  fileIngested: (name: string) => `${name} is in. Indexing now.`,
  copied: (what = "Code") => `${what} copied.`,

  // Awareness / radar
  recentered: () => "Recentered. Tap Scan area when you want fresh context.",
  roughFix: (km: number) =>
    `Got a rough fix (±${km}km). Confirm the place if it looks off.`,
  pinned: () => "Pinned to your radar.",
  unpinned: () => "Off the radar.",

  // Source / scan state
  sourcePaused: (name: string) => `${name} paused.`,
  sourceResumed: (name: string) => `${name} back on.`,

  // Errors — honest, non-alarming
  generic: () => "That didn't go through. Try again in a moment.",
  network: () => "Network's flaky right now. Give it a beat and retry.",
  rateLimited: () => "Easy — you're moving faster than the gateway. Try again in a few seconds.",
  unauthorized: () => "You'll need to sign in again before I can do that.",
  permissionLocation: () =>
    "Location permission is off. Enable it in your browser or pick a saved place.",
  locationUnavailable: () =>
    "Can't read your location right now. Try again or pick a saved place.",
  locationTimeout: () => "Location timed out. Try once more.",
  fileTooLarge: (name: string, maxMb = 20) =>
    `${name} is over ${maxMb}MB — slim it down or split it up.`,
  micUnsupported: () => "Voice input isn't supported in this browser.",
  micError: (detail?: string) => (detail ? `Mic: ${detail}` : "Mic didn't catch that."),

  // Empty states
  empty: {
    awareness: () => "Nothing on the radar yet. Drop a place or scan the area.",
    memory: () => "Memory's quiet. Capture a note and it'll start filling in.",
    actions: () => "No actions staged. Anything you draft lands here first — nothing executes without you.",
    commitments: () => "No commitments tracked yet.",
    research: () => "No research runs yet. Ask Vanta to dig into something.",
    sherlock: () => "Sherlock hasn't been asked anything yet.",
    conversation: () => "Say something — I'm listening.",
    telegram: () => "Telegram isn't linked. Generate a pairing code below.",
    notifications: () => "All quiet.",
  },

  // Confirmations
  staged: () => "Staged. Nothing's been sent.",
  approved: () => "Approved. Running now.",
  rejected: () => "Rejected. Nothing happened.",
} as const;

// ---------- Toast wrapper ---------------------------------------------------
// Use vantaToast.* instead of sonner's toast directly so future tone tweaks
// (timing, descriptions, classNames) happen in one place.

type ToastArg = string | { title: string; description?: string };

function normalize(arg: ToastArg): { message: string; opts?: { description?: string } } {
  if (typeof arg === "string") return { message: arg };
  return { message: arg.title, opts: arg.description ? { description: arg.description } : undefined };
}

function say(arg: ToastArg) {
  const { message, opts } = normalize(arg);
  return sonnerToast(message, opts);
}

export const vantaToast = Object.assign(say, {
  say,
  success(arg: ToastArg) {
    const { message, opts } = normalize(arg);
    return sonnerToast.success(message, opts);
  },
  error(arg: ToastArg) {
    const { message, opts } = normalize(arg);
    return sonnerToast.error(message, opts);
  },
  // Convenience: pass an unknown error and get a clean phrase out.
  fromError(e: unknown, fallback = vantaSay.generic()) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg) return sonnerToast.error(fallback);
    if (/rate.?limit|429/i.test(msg)) return sonnerToast.error(vantaSay.rateLimited());
    if (/network|fetch|failed to fetch|offline/i.test(msg)) return sonnerToast.error(vantaSay.network());
    if (/unauthor|401/i.test(msg)) return sonnerToast.error(vantaSay.unauthorized());
    return sonnerToast.error(msg);
  },
});

// Re-export raw sonner toast for legacy call sites that still need it.
export { sonnerToast as toast };
