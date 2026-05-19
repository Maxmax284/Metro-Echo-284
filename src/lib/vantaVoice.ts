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
  capturedToMemory: () => "Captured to memory.",
  actionStaged: (title?: string) =>
    title ? `Staged "${title}" for your review.` : "Staged for your review.",
  actionDrafted: () => "Drafted — open Actions to review.",
  commitmentRecorded: (summary?: string) =>
    summary ? `Got it — tracking "${summary}".` : "Commitment tracked.",
  commitmentAdded: () => "Commitment added.",
  fileIngested: (name: string) => `${name} is in. Indexing now.`,
  copied: (what = "Code") => `${what} copied.`,
  fieldNoteSaved: () => "Field note saved.",
  linked: () => "Linked.",
  archived: () => "Archived.",
  restored: () => "Restored.",
  expired: () => "Marked expired.",
  deleted: () => "Deleted.",
  exported: () => "Exported.",
  cancelled: (what = "Cancelled") => `${what}.`,
  snoozed: (until?: string) => (until ? `Snoozed until ${until}.` : "Snoozed."),
  noteToReminder: () => "Turned into a reminder.",
  noteToCommitment: () => "Tracking as a commitment.",
  noteToSherlock: () => "Sent to Sherlock.",
  markedDone: () => "Marked done.",
  reminderSet: (when: string) => `Reminder set for ${when}.`,
  reminderNeedsTime: () => "Need a time. When should I remind you?",
  timezoneUpdated: (tz: string) => `Timezone set to ${tz}.`,
  briefingReady: () => "Briefing's ready.",
  fileNeedsReview: () => "This file needs a type.",
  fileTypeSet: (type: string) => `Filed as a ${type}.`,
  fileArchived: () => "Filed away.",

  // Awareness / radar
  recentered: () => "Recentered. Tap Scan area when you want fresh context.",
  roughFix: (km: number) =>
    `Got a rough fix (±${km}km). Confirm the place if it looks off.`,
  pinned: () => "Pinned to your radar.",
  unpinned: () => "Off the radar.",
  awarenessAnswered: (place?: string) =>
    place ? `Awareness answered — ${place}.` : "Awareness answered — no active place set.",

  // Bad location recovery
  pinLooksOff: () => "This pin looks wrong. Let's fix it.",
  pinOffshore: () => "This pin looks offshore. Probably a bad GPS fix.",
  sameBadFix: () => "Your phone gave me the same offshore spot again.",
  gotGps: () => "Got your GPS.",
  geocodeOk: (place: string) => `Location fixed — now reading ${place}.`,
  geocodeMissed: () => "Got your GPS, but I couldn't resolve a real place from it.",
  highAccuracySampling: (s: number) => `Reading GPS for ${s}s…`,
  highAccuracyFailed: () => "Tried a high-accuracy recenter, but the GPS still looks wrong. Pick a saved place or search manually.",
  placeDeleted: () => "Deleted that bad spot.",
  switchedPlace: (label: string) => `Now using ${label}.`,
  manualPlaceSaved: (label: string) => `Saved ${label}. Using it now.`,
  manualPlaceMiss: () => "Couldn't find that place. Try a different spelling.",
  locationFixedRescan: () => "Location looks fixed. Want me to rescan local context?",
  useLastGood: (label: string) => `Use ${label} again — that one's confirmed.`,
  mapPickerApplied: (label: string) => `Pinned ${label} on the map. Using it now.`,
  mapPickerResolving: () => "Reading that spot…",
  autoRescanFired: () => "Rescanning local context for the new spot.",

  // Source / scan state
  sourcePaused: (name: string) => `${name} paused.`,
  sourceResumed: (name: string) => `${name} back on.`,
  serpapiPaused: () => "SerpApi paused.",
  serpapiResumed: () => "SerpApi back on.",
  lockdown: () => "Lockdown engaged. All external APIs disabled.",

  // Research / Sherlock
  researchComplete: (sources: number) => `Research done — ${sources} sources.`,
  researchBlocked: (reason: string) => `Blocked: ${reason}.`,
  researchFailed: (reason: string) => `Couldn't finish that research: ${reason}.`,
  sherlockComplete: (n: number) => `Investigation done — ${n} findings.`,
  sherlockFailed: () => "Investigation didn't finish.",

  // Memory
  summarized: () => "Summary added.",
  actionsExtracted: () => "Action items extracted.",
  searchFailed: () => "Search didn't go through.",
  aiAssistFailed: () => "AI assist didn't finish.",

  // Auth
  accountCreated: () => "Account created. Welcome.",
  notSignedIn: () => "You're not signed in.",
  authFailed: () => "Sign-in didn't go through. Try again.",

  // Errors — honest, non-alarming
  generic: () => "That didn't go through. Try again in a moment.",
  couldntSave: () => "Couldn't save that. Try again.",
  couldntUpdate: () => "Couldn't update that.",
  couldntDelete: () => "Couldn't delete that.",
  couldntExport: () => "Couldn't export that.",
  network: () => "Network's flaky right now. Give it a beat and retry.",
  rateLimited: () => "Easy — you're moving faster than the gateway. Try again in a few seconds.",
  unauthorized: () => "You'll need to sign in again before I can do that.",
  intentBlocked: (mode: string, kind: string) =>
    `${mode} mode — "${kind}" is blocked here.`,
  permissionLocation: () =>
    "Location permission is off. Enable it in your browser or pick a saved place.",
  locationUnavailable: () =>
    "Can't read your location right now. Try again or pick a saved place.",
  locationTimeout: () => "Location timed out. Try once more.",
  fileTooLarge: (name: string, maxMb = 20) =>
    `${name} is over ${maxMb}MB — slim it down or split it up.`,
  micUnsupported: () => "Voice input isn't supported in this browser.",
  micError: (detail?: string) => (detail ? `Mic: ${detail}` : "Mic didn't catch that."),
  nameRequired: () => "Name's required.",
  fieldRequired: (name: string) => `${name} is required.`,
  notFound: (what = "Item") => `${what} not found.`,

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

// ---------- i18n hook ------------------------------------------------------
// English (`en`) is the canonical phrase library. Other locales can be
// registered as a deep-partial override; anything missing falls back to `en`
// so we never ship an empty string to the UI.
//
// Usage:
//   registerVantaLocale("es", { generic: () => "Eso no funcionó. Inténtalo de nuevo." });
//   setVantaLocale("es");
//   vantaSayFor("es").generic();   // -> Spanish
//   vantaSayFor().generic();       // -> active locale
//
// Existing call sites that import `vantaSay` keep working unchanged — they
// resolve against `en` until a locale is set.
export type VantaLocale = string;
export type VantaPhrases = typeof vantaSay;
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type VantaPhraseOverrides = DeepPartial<VantaPhrases>;

const LOCALES: Record<VantaLocale, VantaPhrases> = { en: vantaSay };
let ACTIVE_LOCALE: VantaLocale = "en";

function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (!override) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const ov = (override as any)[key];
    const bv = (base as any)[key];
    out[key] =
      ov && typeof ov === "object" && !Array.isArray(ov) && typeof bv === "object"
        ? deepMerge(bv, ov)
        : ov;
  }
  return out;
}

export function registerVantaLocale(locale: VantaLocale, overrides: VantaPhraseOverrides) {
  LOCALES[locale] = deepMerge(vantaSay, overrides);
}

export function setVantaLocale(locale: VantaLocale) {
  ACTIVE_LOCALE = LOCALES[locale] ? locale : "en";
}

export function getVantaLocale(): VantaLocale {
  return ACTIVE_LOCALE;
}

export function vantaSayFor(locale?: VantaLocale): VantaPhrases {
  return LOCALES[locale ?? ACTIVE_LOCALE] ?? LOCALES.en;
}

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
  warning(arg: ToastArg) {
    const { message, opts } = normalize(arg);
    return sonnerToast.warning(message, opts);
  },
  message(arg: ToastArg) {
    const { message, opts } = normalize(arg);
    return sonnerToast.message(message, opts);
  },
  info(arg: ToastArg) {
    const { message, opts } = normalize(arg);
    return sonnerToast.message(message, opts);
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
