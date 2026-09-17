// archetype — soft, expiring working hypotheses about the shape of a day.
//
// Doctrine:
//   - A shape, never a taxonomy and never a label on the person. "Travel day"
//     is a guess about today, not a fact about who someone is.
//   - Evidence-driven and expiring. No evidence, no hypothesis. Old evidence,
//     dead hypothesis.
//   - It may change what Echo checks and how much it says. It may NOT create a
//     tab, a filter, a badge, a mode or a visible category. Nothing in this
//     module returns copy for the screen.
//
// Pure module.

export type ArchetypeId =
  | "travel_day"
  | "fight_week"
  | "training_day"
  | "stadium_night"
  | "admin_day"
  | "housing_problem"
  | "money_squeeze"
  | "errand_run"
  | "fire_drill"
  | "guest_ops"
  | "salvage";

/** Grounded evidence only. Every field is something actually recorded. */
export type ArchetypeEvidence = {
  /** Words the person actually used, if any. */
  text?: string | null;
  /** A filed flight departs or lands inside the next 24h. */
  flightWithin24h?: boolean;
  /** A recorded flight leg is late, moved, cancelled or diverted. */
  flightDisrupted?: boolean;
  /** A recurring training block sits on today's calendar. */
  trainingToday?: boolean;
  /** A recorded fight/competition date is inside the next 7 days. */
  fightWithin7d?: boolean;
  /** A recorded stadium/event shift starts today. */
  stadiumToday?: boolean;
  /** An appointment today is tagged visa, embassy, bank, tax or licence. */
  adminAppointmentToday?: boolean;
  /** A housing/lease/landlord thread moved in the last 48h. */
  housingChanged?: boolean;
  /** A read money rail says a balance is short against a dated obligation. */
  moneyShort?: boolean;
  /** A security or platform incident signal arrived. */
  incident?: boolean;
  /** A guest/camp operations signal arrived from a connected platform. */
  guestOps?: boolean;
};

export type ArchetypeHypothesis = {
  id: ArchetypeId;
  /** 0..1, from how many independent pieces of evidence line up. Never invented. */
  confidence: number;
  /** The recorded reasons. Every hypothesis can be explained. */
  because: string[];
  /** ISO. After this it is gone and must be re-earned. */
  expiresAt: string;
};

const HOURS = 60 * 60 * 1000;

/** How long each shape may survive without new evidence. */
const LIFE_HOURS: Record<ArchetypeId, number> = {
  travel_day: 24,
  fight_week: 24 * 7,
  training_day: 12,
  stadium_night: 12,
  admin_day: 12,
  housing_problem: 48,
  money_squeeze: 48,
  errand_run: 8,
  fire_drill: 6,
  guest_ops: 12,
  salvage: 4,
};

const PHRASES: Array<{ id: ArchetypeId; re: RegExp }> = [
  { id: "travel_day", re: /\b(flight|airport|layover|terminal|boarding|lands?|landing|check ?in)\b/i },
  { id: "fight_week", re: /\b(fight (week|night|card)|weigh ?in|bout|corner(ing)?)\b/i },
  { id: "training_day", re: /\b(training|session|padwork|pads|sparring|gym|clinch|run)\b/i },
  { id: "stadium_night", re: /\b(stadium|event night|show|gate staff|crowd)\b/i },
  { id: "admin_day", re: /\b(visa|immigration|embassy|consulate|extension|90 ?day|tax|licen[cs]e|notar)/i },
  { id: "housing_problem", re: /\b(landlord|lease|deposit|rent|apartment|condo|water bill|electric bill)\b/i },
  { id: "money_squeeze", re: /\b(short on|can'?t afford|tight (on )?(money|cash)|overdraft|until payday)\b/i },
  { id: "errand_run", re: /\b(pharmacy|clinic|hospital|prescription|pick ?up|dentist|doctor)\b/i },
  { id: "fire_drill", re: /\b(down|outage|broken|locked out|hacked|breach|urgent)\b/i },
  { id: "guest_ops", re: /\b(guest|check ?out|booking|room \d|villa|camp)\b/i },
  { id: "salvage", re: /\b(went wrong|screwed|missed (the|my)|stranded|least (stupid|bad)|now what)\b/i },
];

const FLAGS: Array<{ id: ArchetypeId; key: keyof ArchetypeEvidence; because: string }> = [
  { id: "travel_day", key: "flightWithin24h", because: "a filed flight moves inside 24 hours" },
  { id: "salvage", key: "flightDisrupted", because: "a recorded leg was delayed, moved or cancelled" },
  { id: "training_day", key: "trainingToday", because: "a recurring training block is on today" },
  { id: "fight_week", key: "fightWithin7d", because: "a recorded fight date is inside a week" },
  { id: "stadium_night", key: "stadiumToday", because: "a recorded stadium shift starts today" },
  { id: "admin_day", key: "adminAppointmentToday", because: "an admin appointment is on today" },
  { id: "housing_problem", key: "housingChanged", because: "a housing thread moved recently" },
  { id: "money_squeeze", key: "moneyShort", because: "a read balance is short against a dated obligation" },
  { id: "fire_drill", key: "incident", because: "an incident signal arrived" },
  { id: "guest_ops", key: "guestOps", because: "a guest operations signal arrived" },
];

/**
 * At most two hypotheses. A day has a shape; it does not have nine shapes.
 * Confidence is evidence count, capped — never a vibe.
 */
export function inferArchetypes(evidence: ArchetypeEvidence, now = new Date()): ArchetypeHypothesis[] {
  const hits = new Map<ArchetypeId, string[]>();
  const add = (id: ArchetypeId, because: string) => {
    const list = hits.get(id) ?? [];
    if (!list.includes(because)) list.push(because);
    hits.set(id, list);
  };

  const text = (evidence.text ?? "").trim();
  if (text) {
    for (const { id, re } of PHRASES) {
      if (re.test(text)) add(id, "the words used point at it");
    }
  }
  for (const { id, key, because } of FLAGS) {
    if (evidence[key] === true) add(id, because);
  }

  return [...hits.entries()]
    .map(([id, because]) => ({
      id,
      // Words alone are the weakest kind of evidence; a recorded flag is stronger.
      confidence: Math.min(0.9, because.length === 1 && because[0].startsWith("the words") ? 0.4 : 0.4 + 0.25 * because.length),
      because,
      expiresAt: new Date(now.getTime() + LIFE_HOURS[id] * HOURS).toISOString(),
    }))
    .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
    .slice(0, 2);
}

/** Anything expired is gone. A shape has to be re-earned, never inherited. */
export function activeArchetypes(list: ArchetypeHypothesis[], now = new Date()): ArchetypeHypothesis[] {
  return list.filter((h) => {
    const at = Date.parse(h.expiresAt);
    return Number.isFinite(at) && at > now.getTime();
  });
}

/**
 * What this shape makes worth checking. These are lookup hints for the existing
 * reads — not a checklist Echo recites, and not a promise that data exists.
 */
export function archetypeChecks(id: ArchetypeId): string[] {
  switch (id) {
    case "travel_day":
      return ["flight status and gate", "leave-by time", "clock shift at the other end", "what can wait until after"];
    case "salvage":
      return ["what is still reachable", "closing times", "cost of the least bad option", "who needs telling"];
    case "training_day":
      return ["training time", "sleep window before it", "anything colliding with it"];
    case "fight_week":
      return ["weigh-in and fight times", "travel around them", "what can be pushed past the fight"];
    case "stadium_night":
      return ["shift start", "travel time to the ground", "what needs answering before it starts"];
    case "admin_day":
      return ["appointment time and place", "documents and copies needed", "office hours", "payment method accepted"];
    case "housing_problem":
      return ["what the record actually says", "dated obligations", "who has access and when"];
    case "money_squeeze":
      return ["what is dated and unavoidable", "what has actually landed", "what can move"];
    case "errand_run":
      return ["nearest open place", "closing time", "whether cash is needed"];
    case "fire_drill":
      return ["what is affected", "what is recorded", "who is already on it"];
    case "guest_ops":
      return ["what the connected platform reported", "what needs a person", "what is already handled"];
    default:
      return [];
  }
}

/** Internal prompt hint. Deliberately says: do not name this out loud. */
export function archetypeBlock(list: ArchetypeHypothesis[]): string {
  const active = list.filter((h) => h.confidence >= 0.4);
  if (!active.length) return "";
  return [
    "Working read of the situation (internal, expiring, never named to the person, never a category or filter):",
    ...active.map((h) => `- ${h.id.replace(/_/g, " ")} (${Math.round(h.confidence * 100)}% — ${h.because.join("; ")}). Worth checking: ${archetypeChecks(h.id).join(", ")}.`),
    "Let this change what you check and how little you say. Do not announce it, do not label the person, do not invent data it implies.",
  ].join("\n");
}
