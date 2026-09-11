// interactionVerbs — one vocabulary for every "get this off my screen" tap.
//
// Doctrine: the same word must always mean the same thing. Before this module
// the product shipped Dismiss, Hide, Ignore, Remove, Snooze and Archive across
// surfaces for roughly three underlying meanings, and "Dismiss" swung between
// a soft UI fold and a hard status change. Seven verbs, seven meanings, no
// synonyms. If a new interaction does not fit one of these, it is not a new
// word — it is a design question.
//
// Pure data. Nothing here reads state or writes anything.

export type InteractionVerb =
  | "not_now"
  | "later"
  | "handled"
  | "hide"
  | "archive"
  | "delete"
  | "clear_settled";

export type VerbSpec = {
  /** The only label allowed on screen for this meaning. */
  label: string;
  /** What it means, in the user's words. Used for tooltips and help copy. */
  means: string;
  /** True when the source record keeps its truth and only the view changes. */
  reversible: boolean;
  /** Words this verb replaces. Any of these on screen is a bug. */
  retires: string[];
};

export const INTERACTION_VERBS: Record<InteractionVerb, VerbSpec> = {
  not_now: {
    label: "Not now",
    means: "Stop surfacing this kind of thing for a while.",
    reversible: true,
    retires: ["Ignore", "Don't show again", "Do not show again"],
  },
  later: {
    label: "Later",
    means: "Still true. Bring it back later.",
    reversible: true,
    retires: ["Snooze", "Save for later", "Remind me"],
  },
  handled: {
    label: "Handled",
    means: "I did the real thing outside Echo.",
    reversible: true,
    retires: ["Mark handled", "Mark done", "Complete"],
  },
  hide: {
    label: "Hide",
    means: "Off this view. The record itself is untouched.",
    reversible: true,
    retires: ["Dismiss", "Remove", "Clear"],
  },
  archive: {
    label: "Archive",
    means: "Kept, but out of active work.",
    reversible: true,
    retires: ["File away", "Stash"],
  },
  delete: {
    label: "Delete",
    means: "Actually gone. Echo writes a receipt of what it was first.",
    reversible: false,
    retires: ["Destroy", "Purge"],
  },
  clear_settled: {
    label: "Clear settled",
    means: "Hide everything already resolved. Nothing unresolved moves.",
    reversible: true,
    retires: ["Clear all", "Clean up"],
  },
};

/** The label to render. Never hand-write one of these strings in a component. */
export function verbLabel(verb: InteractionVerb): string {
  return INTERACTION_VERBS[verb].label;
}

/** The one-line meaning, for tooltips and the "Why this?" layer. */
export function verbMeans(verb: InteractionVerb): string {
  return INTERACTION_VERBS[verb].means;
}

/** Every word that must no longer appear as a user-facing action label. */
export const RETIRED_VERBS: string[] = Object.values(INTERACTION_VERBS).flatMap((v) => v.retires);

/**
 * Maps a legacy label to the verb that replaces it, so a surface can be
 * migrated without guessing. Returns null when the label is already canonical.
 */
export function canonicalVerbFor(label: string): InteractionVerb | null {
  const needle = label.trim().toLowerCase();
  for (const [verb, spec] of Object.entries(INTERACTION_VERBS) as [InteractionVerb, VerbSpec][]) {
    if (spec.label.toLowerCase() === needle) return null;
    if (spec.retires.some((r) => r.toLowerCase() === needle)) return verb;
  }
  return null;
}
