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

function pick<T>(...arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export const vantaSay = {
  // Capture / staging — variation pools so toasts don't feel canned
  noteSaved: (title?: string) =>
    title
      ? pick(`Saved — "${title}" is in memory.`, `Noted. "${title}" is filed. 📝`, `Got it — "${title}" saved.`)
      : pick("Saved that.", "Noted.", "Saved as a note. 📝", "Got it — filed."),
  noteEmbedFailed: () => "Saved, but I couldn't index it for search yet.",
  capturedToMemory: () => pick("Captured to memory.", "Saved. 📝", "Got it — in memory."),
  actionStaged: (title?: string) =>
    title ? `Staged "${title}" for your review.` : "Staged for your review.",
  actionDrafted: () => pick("Drafted — open Actions to review.", "Staged. Nothing's been sent."),
  commitmentRecorded: (summary?: string) =>
    summary
      ? pick(`Got it — tracking "${summary}".`, `On the board: "${summary}".`)
      : pick("Commitment tracked.", "Logged."),
  commitmentAdded: () => pick("Commitment added.", "Tracking it."),
  commitmentDetected: () => pick(
    "That sounds like a commitment. Want me to track it?",
    "You promised something there — should I track it?",
    "Sounds like an open loop. Want it in Commitments?",
  ),
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
  reminderCreated: (when: string) => pick(
    `Done — I'll remind you ${when}. ⏰`,
    `Got you. Reminder set for ${when}.`,
    `Handled — I'll nudge you ${when}.`,
    `Reminder set for ${when}.`,
  ),
  reminderNeedsTime: () => pick(
    "I can do that — what time?",
    "Need a time before I can remind you. When?",
    "What time should I remind you?",
    "Morning, afternoon, evening, or a specific time?",
  ),
  reminderAmPmAsk: (hh: number, mm: number) => `${hh}:${String(mm).padStart(2, "0")} — AM or PM?`,
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
    inbox: () => "Inbox is clear. Nothing waiting on a decision.",
    files: () => "No files waiting. Clean for now.",
    briefing: () => "No briefing yet. Add a few commitments or captures, and I'll summarize what matters.",
  },

  // Sensitive content — careful, neutral, no judgement
  sensitive: {
    fileWarning: () => "This may contain personal or financial information. Review before routing.",
    routeWarning: () => "Looks sensitive. I'll keep it private unless you tell me otherwise.",
  },

  // Briefing voice (Phase 6 — variant-aware operator summaries)
  briefing: {
    morning: (counts: { active: number; overdue: number; review: number }) =>
      `Today: ${counts.active} active, ${counts.overdue} overdue, ${counts.review} needs review.`,
    midday: (counts: { active: number; overdue: number; review: number }) =>
      `Midday check: ${counts.active} still open, ${counts.overdue} overdue, ${counts.review} to triage.`,
    evening: (done: number, open: number, slipped: number) =>
      `Wrap-up: ${done} done, ${open} still open, ${slipped} slipped.`,
    wrap: (done: number, open: number, slipped: number) =>
      `Day's done: ${done} closed, ${open} carrying over, ${slipped} slipped.`,
    bestFirstMove: (what: string) => `Best first move: ${what}.`,
    salientFromObserve: (what: string) => `Sherlock noticed: ${what}`,
    quiet: () => "Quiet day. Nothing pressing.",
    composing: () => "Composing briefing…",
  },

  // Inbox voice (Phase 4 — capture state machine)
  inbox: {
    tabNow: () => "Now",
    tabSnoozed: () => "Snoozed",
    tabDone: () => "Done",
    emptyNow: () => "Nothing waiting on you. Clean desk.",
    emptySnoozed: () => "Nothing snoozed.",
    emptyDone: () => "Nothing routed yet.",
    snoozedUntil: (when: string) => `Snoozed until ${when}.`,
    unsnoozed: () => "Back on the desk.",
  },

  // Confirmations
  staged: () => "Staged. Nothing's been sent.",
  approved: () => "Approved. Running now.",
  rejected: () => "Rejected. Nothing happened.",

  // Surface prompts — invitations, not apologies. Used by chat/capture inputs.
  prompt: {
    sort: () => "What needs sorting?",
    structure: () => "Drop the messy version. I'll help structure it.",
    followThrough: () => "What needs follow-through?",
    schedule: () => "This has a date and a follow-up. Want me to schedule it?",
    attach: () => "This looks connected to an existing item. Want me to attach it?",
    nextAction: () => "I found a possible next action.",
    draftFirst: () => "I can draft this first so you can approve it.",
  },

  // Sherlock voice — forensic, calm, names confidence, never executes.
  sherlock: {
    looksLike: (kind: string) => `Looks like a ${kind}.`,
    observed: (kind: string, confidence: "low" | "medium" | "high") =>
      `Observed: ${kind} (${confidence} confidence).`,
    suggests: (action: string) => `Suggested next move: ${action}.`,
    ambiguous: () => "Two possible reads here. Pick one and I'll lock it in.",
    nothingFound: () => "Nothing to extract.",
    notExecuting: () => "Suggestion only — nothing runs until you approve.",
    chipHint: () => "Tap to review.",
    approved: () => "Approved. Routing now.",
    dismissed: () => "Dismissed. Not acting on it.",
    relatedCount: (n: number) => `${n} related ${n === 1 ? "item" : "items"}.`,
    salient: (what: string) => `Worth noticing: ${what}`,
    scanComplete: (n: number) =>
      n === 0
        ? "Scan complete. Nothing new worth flagging."
        : `Scan complete. ${n} new ${n === 1 ? "thing" : "things"} worth a look.`,
    sensitiveHeld: (cats: string[]) =>
      cats.length
        ? `Sensitive content (${cats.join(", ")}). Held for your review — nothing routed.`
        : "Sensitive content. Held for your review — nothing routed.",
    sensitiveRevealHint: () => "Details hidden. Tap reveal to inspect.",
    markedSensitive: () => "Marked sensitive. Future suggestions will stay cautious.",
    unmarkedSensitive: () => "Sensitivity flag removed.",
    operation: {
      observe: "Observe",
      extract: "Extract",
      relate: "Relate",
      suggest: "Suggest",
      investigate: "Investigate",
    },
  },

  // Generic error builder — replaces "Something went wrong" everywhere.
  // Usage: vantaSay.errorWith("Couldn't reach the briefing service", "Try again in a moment.")
  errorWith: (what: string, doWhat = "Try again in a moment.") => `${what}. ${doWhat}`,
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
