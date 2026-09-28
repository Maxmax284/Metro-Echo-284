// notifyPolicy — one priority ladder for everything that wants to reach a person.
//
// The urgency ladder (awareness/urgency.ts) says how much a thing matters.
// This module says what the person ALLOWED to interrupt them, per category:
//   buzz   — reach the phone outside quiet hours
//   today  — wait quietly in Today, never buzz
//   digest — gather silently, the weekly digest carries it
//
// Doctrine:
//   - Critical always punches through. A floor is a courtesy, never a gag on
//     genuine emergencies.
//   - Unknown kinds keep the behavior they already had (buzz). A new control
//     must never silently change what an existing sender does.
//   - Every hold leaves a receipt. Held is a status, never silence.
//
// Pure module. No IO. Mirrored into the client so Settings and the sweeps
// agree on the same ladder.

export const NOTIFY_CATEGORIES = ["safety", "flights", "schedule", "watches", "sherlock"] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number];

export const NOTIFY_FLOORS = ["buzz", "today", "digest"] as const;
export type NotifyFloor = (typeof NOTIFY_FLOORS)[number];

export type NotifyLevel = "urgent" | "important" | "informational" | "digest";

export const CATEGORY_LABEL: Record<NotifyCategory, string> = {
  safety: "Safety and hazards",
  flights: "Flights and travel",
  schedule: "Schedule and reminders",
  watches: "Watches on the world",
  sherlock: "What Echo noticed",
};

export const CATEGORY_DETAIL: Record<NotifyCategory, string> = {
  safety: "Severe weather, scams, hazards near you. Critical ones always punch through.",
  flights: "Gate moves, delays, journey changes.",
  schedule: "Reminders, meetings starting, moved appointments.",
  watches: "Pages and topics Echo checks for you.",
  sherlock: "Patterns Echo spots in your own records.",
};

export const FLOOR_LABEL: Record<NotifyFloor, string> = {
  buzz: "Buzz me",
  today: "Today only",
  digest: "Digest",
};

export const FLOOR_DETAIL: Record<NotifyFloor, string> = {
  buzz: "Buzzes your phone outside quiet hours.",
  today: "Waits quietly in Today.",
  digest: "Gathered into the weekly digest.",
};

/**
 * Defaults preserve what senders already do. Sherlock is the one exception:
 * its findings have always been digest-shaped, so the default says so.
 */
export const DEFAULT_NOTIFY_FLOORS: Record<NotifyCategory, NotifyFloor> = {
  safety: "buzz",
  flights: "buzz",
  schedule: "buzz",
  watches: "buzz",
  sherlock: "digest",
};

/** Tolerates the awareness ladder plus the legacy words senders already use. */
export function levelForUrgency(urgency: string | null | undefined): NotifyLevel {
  switch (urgency) {
    case "critical":
    case "urgent":
      return "urgent";
    case "time_sensitive":
    case "high":
      return "important";
    case "background":
    case "low":
      return "digest";
    case "attention":
    case "normal":
    default:
      return "informational";
  }
}

/**
 * Best-effort category for a situation/entity kind. Null means "we don't
 * know" — and unknown keeps the behavior it already had.
 */
export function categoryForSituation(kind: string | null | undefined): NotifyCategory | null {
  const k = (kind ?? "").toLowerCase();
  if (!k) return null;
  if (/hazard|scam|safety|weather_alert|severe/.test(k)) return "safety";
  if (/flight|journey|trip|boarding|airport/.test(k)) return "flights";
  if (/watch|web_page|web_search/.test(k)) return "watches";
  if (/sherlock|finding/.test(k)) return "sherlock";
  if (/reminder|commitment|calendar|meeting|schedule|appointment/.test(k)) return "schedule";
  return null;
}

function asFloor(v: unknown): NotifyFloor | null {
  return typeof v === "string" && (NOTIFY_FLOORS as readonly string[]).includes(v)
    ? (v as NotifyFloor)
    : null;
}

/** Read per-category floors out of a raw preferences blob, defensively. */
export function readFloors(
  prefs: Record<string, unknown> | null | undefined,
): Record<NotifyCategory, NotifyFloor> {
  const raw = (prefs ?? {})["notify_floors"];
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_NOTIFY_FLOORS };
  for (const cat of NOTIFY_CATEGORIES) {
    const f = asFloor(stored[cat]);
    if (f) out[cat] = f;
  }
  return out;
}

export type FloorDecision = {
  /** Where the thing may go once the person's settings have their say. */
  channel: "push" | "today" | "digest";
  /** True when a push would have happened without the floor. */
  held: boolean;
  /** Plain English for the receipt. */
  because: string;
  level: NotifyLevel;
  category: NotifyCategory | null;
};

/**
 * The gate every push path passes through. Only "push" may interrupt;
 * anything else stays inside the platform where the person finds it.
 */
export function applyFloor(args: {
  urgency: string | null | undefined;
  category: NotifyCategory | null;
  floors: Record<NotifyCategory, NotifyFloor>;
}): FloorDecision {
  const level = levelForUrgency(args.urgency);
  const floor = args.category ? args.floors[args.category] : "buzz";

  if (level === "urgent") {
    return {
      channel: "push",
      held: false,
      because: "critical always punches through",
      level,
      category: args.category,
    };
  }
  if (level === "informational") {
    return {
      channel: "today",
      held: false,
      because: "worth attention, never worth an interruption",
      level,
      category: args.category,
    };
  }
  if (level === "digest") {
    return {
      channel: "digest",
      held: false,
      because: "background news gathers quietly",
      level,
      category: args.category,
    };
  }
  /* important — the only level a floor can hold back. */
  if (floor === "today") {
    return {
      channel: "today",
      held: true,
      because: `your settings keep ${args.category ? CATEGORY_LABEL[args.category].toLowerCase() : "this"} in Today`,
      level,
      category: args.category,
    };
  }
  if (floor === "digest") {
    return {
      channel: "digest",
      held: true,
      because: `your settings gather ${args.category ? CATEGORY_LABEL[args.category].toLowerCase() : "this"} into the digest`,
      level,
      category: args.category,
    };
  }
  return {
    channel: "push",
    held: false,
    because: "time-sensitive and your settings allow the buzz",
    level,
    category: args.category,
  };
}

/** Web Push Urgency header — battery and delivery priority on the device. */
export function pushUrgencyHeader(level: NotifyLevel): "high" | "normal" | "low" {
  if (level === "urgent" || level === "important") return "high";
  if (level === "informational") return "normal";
  return "low";
}
