// situation — one read of where you are standing, across every source.
//
// Doctrine:
//   - one situation, not a list of sources reporting in turn.
//   - at most three things. Silence is a valid output.
//   - every line names its source, its freshness, and why it is here.
//   - authoritative state only. Nothing is inferred from a past conversation.
//   - a source with no data says so; it never contributes a zero.
//
// Pure module: callers fetch rows, this ranks and words them.

import { gapPhrase, unusual, worthSurfacing, type BaselineRead, type Cadence } from "./baseline.ts";
import { whyFor, type WhySurfaced } from "./whySurfaced.ts";
import { meetingContextClause, type ContextForecastHour } from "./todayContext.ts";

export type SituationSource =
  | "commitments"
  | "actions"
  | "inbox"
  | "sherlock"
  | "calendar"
  | "telegram"
  | "projects"
  | "body";

export const SOURCE_LABEL: Record<SituationSource, string> = {
  commitments: "Commitments",
  actions: "Actions",
  inbox: "Inbox",
  sherlock: "What Echo noticed",
  calendar: "Calendar",
  telegram: "Telegram",
  projects: "Projects",
  body: "Body",
};

export type SituationKind =
  | "overdue"
  | "due_soon"
  | "waiting_on_you"
  | "arrived"
  | "noticed"
  | "meeting_soon"
  | "happening_now"
  | "went_unusually_quiet"
  | "matter_open"
  | "matter_proposed";

/** Ranked by consequence, not by recency. Lower number wins. */
const KIND_WEIGHT: Record<SituationKind, number> = {
  overdue: 1,
  waiting_on_you: 2,
  meeting_soon: 3,
  /* Something already under way is context, not pressure — it sits just behind
     the thing that is about to start, and ahead of what is merely due. */
  happening_now: 3.5,
  due_soon: 4,
  noticed: 5,
  matter_open: 6,
  matter_proposed: 7,
  went_unusually_quiet: 8,
  arrived: 9,
};


export type SituationLine = {
  kind: SituationKind;
  source: SituationSource;
  /** The one sentence a person reads. Plain English, no IDs. */
  text: string;
  /** Why this line is here at all. */
  reason: string;
  /** ISO time of the newest fact behind the line, for the freshness strip. */
  at: string | null;
  /** What it points at, so tapping lands on the same object. */
  entity?: { type: string; id: string } | null;
  /** Present only when a baseline actually informed the line. */
  baseline?: BaselineRead | null;
  /** The shared "Why this?" reveal. Same seven answers on every surface. */
  why?: WhySurfaced | null;
  weight: number;
};

export type SituationRead = {
  /** At most three, already ranked. */
  lines: SituationLine[];
  /** One opening sentence. Never a count of nothing. */
  headline: string;
  /** Sources that had nothing to say, named once rather than shown as zeros. */
  quietSources: SituationSource[];
  /** Sources that could not be read at all — missing, never zero. */
  unknownSources: SituationSource[];
  /**
   * One clause about where this was read from, or nothing at all. Place never
   * adds a line of its own and never changes what is true — it only says where
   * you were standing when the read was made.
   */
  placeNote: string | null;
  /**
   * Meetings that are happening somewhere other than where you are. They never
   * make the main read — Echo doesn't nudge you about a room you're not near.
   * The Aware room shows them on the "Around you" shelf instead.
   */
  elsewhereMeetings: Array<{ id: string; title: string; starts_at: string; location: string }>;
};

/**
 * Where the person is, as far as the Aware layer resolved it. Words only: this
 * never creates a line, never removes one, and never claims proximity.
 */
export type SituationPlace = {
  /** What to call it in prose — a city or region, not a saved label like "Spot 4:47". */
  where: string;
  /** How precisely it is known. "unknown" means say nothing. */
  scope: "exact" | "area" | "city" | "country" | "unknown";
  /** When the place was last confirmed. Stale place, no words. */
  at: string | null;
  /**
   * A saved place the fix actually sits inside — "Lamai", not a city. Set only
   * when the distance check passed, so the words can name it without guessing.
   */
  savedPlace?: string | null;
};

/** Place speaks only when all three hold. Otherwise it stays quiet. */
const PLACE_FRESH_MS = 12 * 60 * 60 * 1000;
export function placeSpeaks(place: SituationPlace | null | undefined, lineCount: number, now: number): boolean {
  if (!place) return false;
  // 1. the place is actually resolved
  if (place.scope === "unknown" || !place.where.trim()) return false;
  // 2. it was confirmed recently enough to still be where you are
  const at = place.at ? new Date(place.at).getTime() : NaN;
  if (!Number.isFinite(at) || now - at > PLACE_FRESH_MS) return false;
  // 3. there is something for it to sit beside. Place alone is not news.
  return lineCount > 0;
}

export type SituationInput = {
  now?: number;
  overdue: Array<{ id: string; summary: string; due_at: string | null }>;
  dueSoon: Array<{ id: string; summary: string; due_at: string | null }>;
  waitingOnYou: Array<{ id: string; title: string; updated_at: string }>;
  /**
   * Things that landed and have no home yet. `read` and `why` come from the
   * arrivals lane, so an arrival is described the same way here as it is in the
   * Aware room and in Telegram.
   */
  arrived: Array<{
    id: string;
    label: string;
    at: string;
    via?: string | null;
    read?: string | null;
    why?: WhySurfaced | null;
  }>;
  noticed: Array<{ id: string; title: string; reason: string; at: string }> ;
  /**
   * `distanceM` is set only when the caller could measure it from two recorded
   * fixes. It is never estimated, and travel time is never invented from it.
   */
  meetings: Array<{ id: string; title: string; starts_at: string; location?: string | null; distanceM?: number | null }>;
  /**
   * Calendar entries that are under way right now — a hotel stay, a travel
   * week, a conference. They never start "today", so a window that only asks
   * "what begins from here" drops them on the floor. Recorded rows only: the
   * end time comes from the calendar, never from a guess.
   */
  ongoing?: Array<{
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    all_day?: boolean;
    location?: string | null;
  }>;

  /**
   * Hours of forecast already read for where you are. Used to fold weather into
   * the meeting line instead of spawning a weather card beside it.
   */
  forecast?: ContextForecastHour[] | null;
  /** Projects with their stored cadence, for the "different from usual" read. */
  projects: Array<{ id: string; title: string; lastEventAt: string | null; cadence: Cadence | null }>;
  /**
   * Cross-reference matters Sherlock read together and left waiting for review.
   * They surface as one matter line, never as a pile of source reports.
   */
  matters?: Array<{
    id: string;
    title: string;
    /** Filenames as recorded, so the reveal names the real sources. */
    sources: string[];
    /** The named expectation used to read them: "Fight card", "Contract". */
    templateLabel: string | null;
    /** Fields the template expected and the sources did not carry. */
    gaps?: string[];
    /** Conflicts found between sources, if any were recorded. */
    conflicts?: number;
    at: string;
  }>;
  /**
   * One deterministic suggestion that sources already in hand could be read
   * against each other. Noticed by filename and arrival only — no model has
   * run, and none will until the person taps.
   */
  proposal?: {
    filenames: string[];
    reason: string;
    signal: string;
    at: string;
  } | null;
  /** Sources the caller could not read (offline, off, not set up). */
  unknownSources?: SituationSource[];
  /**
   * Where the read was made from, if the Aware layer resolved it. Words only —
   * it softens the wording and breaks ties between equally weighted lines. It
   * cannot add a line, remove one, or change a due time.
   */
  place?: SituationPlace | null;
};

const HOUR = 60 * 60 * 1000;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function hoursUntil(iso: string, now: number): number {
  return (new Date(iso).getTime() - now) / HOUR;
}

/**
 * Build the one read. Every branch either produces a line with a source and a
 * reason, or produces nothing at all.
 */
/**
 * Why a kind is worth attention, and what happens if it is left alone. Fixed
 * copy, so the reveal says the same thing on every surface and never invents a
 * consequence per item.
 */
const KIND_STAKES: Record<SituationKind, { matters: string; ignored: string | null }> = {
  overdue: { matters: "You told someone this would be done.", ignored: "It stays open and keeps ageing. Nobody is told." },
  waiting_on_you: { matters: "Work is prepared but stopped at your approval.", ignored: "The draft sits there. Nothing runs on its own." },
  meeting_soon: { matters: "It starts soon and you may need something ready.", ignored: "The meeting still happens. Echo won't act for you." },
  happening_now: { matters: "It is on your calendar and running right now.", ignored: "Nothing changes. It ends when the calendar says it ends." },

  due_soon: { matters: "The due time is close and it is still open.", ignored: "It becomes overdue." },
  noticed: { matters: "Echo spotted a pattern you did not ask about.", ignored: "It stays on the Sherlock desk until you look." },
  matter_open: { matters: "Sources were read together and the result is unreviewed.", ignored: "The reading waits. Nothing is exported or sent." },
  matter_proposed: { matters: "Two or more sources look related and nothing has read them together yet.", ignored: "Nothing happens. No reading starts on its own." },
  went_unusually_quiet: { matters: "This normally moves more often than it has.", ignored: "Nothing breaks. The gap just keeps growing." },
  arrived: { matters: "Something came in and has no home yet.", ignored: "It waits in Inbox. It was not acted on." },
};

export function readSituation(input: SituationInput): SituationRead {
  const now = input.now ?? Date.now();
  const lines: SituationLine[] = [];
  const push = (l: Omit<SituationLine, "weight">) => {
    const stakes = KIND_STAKES[l.kind];
    lines.push({
      ...l,
      weight: KIND_WEIGHT[l.kind],
      /* One reveal, built from the same facts the line was worded from. */
      why:
        l.why ??
        whyFor({
          source: SOURCE_LABEL[l.source],
          whatChanged: l.text,
          reason: l.reason,
          /* Only ever compares against a cadence Echo actually learned. */
          comparedWith: l.baseline?.cadence
            ? `What's usual for it — a move every ${gapPhrase(l.baseline.cadence.medianGapDays)}`
            : null,
          at: l.at,
          whyItMatters: stakes.matters,
          ifIgnored: stakes.ignored,
        }),
    });
  };

  if (input.overdue.length > 0) {
    const first = input.overdue[0];
    const rest = input.overdue.length - 1;
    push({
      kind: "overdue",
      source: "commitments",
      text: rest > 0 ? `${first.summary} is past due, and ${rest} ${plural(rest, "other is", "others are")} too.` : `${first.summary} is past due.`,
      reason: "The due time passed and it is still open.",
      at: first.due_at,
      entity: { type: "commitment", id: first.id },
    });
  }

  if (input.waitingOnYou.length > 0) {
    const n = input.waitingOnYou.length;
    const first = input.waitingOnYou[0];
    push({
      kind: "waiting_on_you",
      source: "actions",
      text: n === 1 ? `${first.title} is drafted and waiting for you.` : `${n} drafts are waiting for you, starting with ${first.title}.`,
      reason: "Echo prepared these. Nothing runs until you approve.",
      at: first.updated_at,
      entity: { type: "action", id: first.id },
    });
  }

  /* A meeting only earns the main read when it's where you are — or when Echo
     has no idea where you are. A meeting with a named location that clearly
     isn't your resolved place is set aside for the "Around you" shelf. Place
     never invents or hides a fact; it only decides which shelf carries it. */
  const placeForMeetings = placeSpeaks(input.place, 1, now) ? input.place! : null;
  const soonWindow = input.meetings.filter((m) => {
    const h = hoursUntil(m.starts_at, now);
    return h >= -0.25 && h <= 3;
  });
  const elsewhereMeetings = soonWindow
    .filter((m) => meetingIsElsewhere(m.location, placeForMeetings))
    .map((m) => ({ id: m.id, title: m.title, starts_at: m.starts_at, location: String(m.location ?? "").trim() }));
  const elsewhereIds = new Set(elsewhereMeetings.map((m) => m.id));
  const soonMeeting = soonWindow.find((m) => !elsewhereIds.has(m.id));
  if (soonMeeting) {
    const h = hoursUntil(soonMeeting.starts_at, now);
    /* Place, weather and distance ride on this sentence rather than becoming
       three more cards beside it. Missing facts simply do not appear. */
    const context = meetingContextClause({
      startsAt: soonMeeting.starts_at,
      distanceM: soonMeeting.distanceM ?? null,
      forecast: input.forecast ?? null,
      now,
    });
    const base =
      h <= 0 ? `${soonMeeting.title} is starting now` : `${soonMeeting.title} starts in ${Math.max(1, Math.round(h * 60))} minutes`;
    push({
      kind: "meeting_soon",
      source: "calendar",
      text: context ? `${base} — ${context}.` : `${base}.`,
      reason: context
        ? "It came from a calendar you connected, read against where you are."
        : "It came from a calendar you connected.",
      at: soonMeeting.starts_at,
      entity: { type: "calendar_event", id: soonMeeting.id },
    });
  }

  if (input.dueSoon.length > 0 && input.overdue.length === 0) {
    const first = input.dueSoon[0];
    const rest = input.dueSoon.length - 1;
    push({
      kind: "due_soon",
      source: "commitments",
      text: rest > 0 ? `${first.summary} is due next, with ${rest} more behind it.` : `${first.summary} is due next.`,
      reason: "It is the nearest thing you promised.",
      at: first.due_at,
      entity: { type: "commitment", id: first.id },
    });
  }

  if (input.noticed.length > 0) {
    const first = input.noticed[0];
    push({
      kind: "noticed",
      source: "sherlock",
      text: first.title,
      reason: first.reason,
      at: first.at,
      entity: { type: "finding", id: first.id },
    });
  }

  /* Baselines only speak when the silence is genuinely outside ordinary. */
  const quietProject = input.projects
    .map((p) => ({ p, read: unusual(p.cadence, p.lastEventAt, now) }))
    .filter((x) => worthSurfacing(x.read))
    .sort((a, b) => (b.read.observedGapDays ?? 0) - (a.read.observedGapDays ?? 0))[0];
  if (quietProject) {
    push({
      kind: "went_unusually_quiet",
      source: "projects",
      text: `${quietProject.p.title} has gone quiet.`,
      reason: quietProject.read.line,
      at: quietProject.p.lastEventAt,
      entity: { type: "project", id: quietProject.p.id },
      baseline: quietProject.read,
    });
  }

  const matters = input.matters ?? [];
  if (matters.length > 0) {
    const m = matters[0];
    const rest = matters.length - 1;
    const named = m.templateLabel ? `read as a ${m.templateLabel.toLowerCase()}` : "read together";
    push({
      kind: "matter_open",
      source: "sherlock",
      text:
        rest > 0
          ? `${m.title} is ${named} and waiting for your review, along with ${rest} ${plural(rest, "other", "others")}.`
          : `${m.title} is ${named} and waiting for your review.`,
      reason:
        m.conflicts && m.conflicts > 0
          ? `${m.conflicts} ${plural(m.conflicts, "disagreement", "disagreements")} between the sources need a decision.`
          : "Echo lined the sources up. Nothing is final until you review it.",
      at: m.at,
      entity: { type: "case", id: m.id },
      why: whyFor({
        source: m.sources.length > 0 ? m.sources.join(", ") : SOURCE_LABEL.sherlock,
        whatChanged: `${m.sources.length || "Several"} sources were read together into one reading.`,
        reason: m.templateLabel
          ? `The sources matched what a ${m.templateLabel.toLowerCase()} usually contains.`
          : "No known template matched, so the sources were laid out plainly.",
        comparedWith: m.templateLabel ? `What a ${m.templateLabel.toLowerCase()} normally contains` : null,
        at: m.at,
        whyItMatters:
          m.gaps && m.gaps.length > 0
            ? `Still missing: ${m.gaps.slice(0, 3).join(", ")}.`
            : KIND_STAKES.matter_open.matters,
        ifIgnored: KIND_STAKES.matter_open.ignored,
      }),
    });
  }

  const proposal = input.proposal ?? null;
  if (proposal && matters.length === 0) {
    const n = proposal.filenames.length;
    push({
      kind: "matter_proposed",
      source: "sherlock",
      text:
        proposal.signal === "same_name"
          ? `${n} sources look like the same thing and have never been read side by side.`
          : `${n} sources could be read against each other.`,
      reason: proposal.reason,
      at: proposal.at,
      entity: { type: "case_proposal", id: proposal.filenames.slice(0, 3).join(" · ") },
      why: whyFor({
        source: proposal.filenames.join(", "),
        whatChanged: "Nothing changed. These are sources already in hand.",
        reason: proposal.reason,
        comparedWith: null,
        at: proposal.at,
        whyItMatters: KIND_STAKES.matter_proposed.matters,
        ifIgnored: KIND_STAKES.matter_proposed.ignored,
      }),
    });
  }

  if (input.arrived.length > 0) {
    const n = input.arrived.length;
    const first = input.arrived[0];
    const via = first.via ? ` from ${first.via}` : "";
    /* One arrival is spoken about in the words the lane already chose. Several
       are counted, because reading three summaries here would drown the day. */
    const text = n === 1
      ? (first.read?.trim() || `${first.label} arrived${via} and is not filed yet.`)
      : `${n} things arrived${via} and are not filed yet.`;
    push({
      kind: "arrived",
      source: "inbox",
      text,
      reason: "Captures wait in Inbox until you file them. Nothing was acted on.",
      at: first.at,
      entity: { type: "capture", id: first.id },
      /* The lane's own reveal when there is exactly one thing to reveal. */
      why: n === 1 ? first.why ?? null : null,
    });
    /* Something that landed minutes ago belongs beside a meeting or a promise,
       not behind everything else. Older arrivals keep their usual place. */
    const landed = new Date(first.at).getTime();
    if (Number.isFinite(landed) && now - landed <= 60 * 60 * 1000) {
      const line = lines[lines.length - 1];
      if (line) line.weight = 3.5;
    }
  }

  /* Consequence first. Place only decides which of two equally weighted lines
     is read first — a place-bound kind wins that coin toss, and nothing else
     about the read changes. */
  const speaks = placeSpeaks(input.place, lines.length, now);
  const PLACE_BOUND = new Set<SituationKind>(["meeting_soon", "noticed"]);
  lines.sort((a, b) => {
    if (a.weight !== b.weight) return a.weight - b.weight;
    if (speaks) {
      const pa = PLACE_BOUND.has(a.kind) ? 0 : 1;
      const pb = PLACE_BOUND.has(b.kind) ? 0 : 1;
      if (pa !== pb) return pa - pb;
    }
    return new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime();
  });
  const top = lines.slice(0, 3);

  const quietSources: SituationSource[] = [];
  const unknown = input.unknownSources ?? [];
  const had = new Set(top.map((l) => l.source));
  const candidates: Array<[SituationSource, boolean]> = [
    ["commitments", input.overdue.length + input.dueSoon.length > 0],
    ["actions", input.waitingOnYou.length > 0],
    ["inbox", input.arrived.length > 0],
    ["sherlock", input.noticed.length > 0 || matters.length > 0],
    ["calendar", input.meetings.length > 0],
  ];
  for (const [src, hasAny] of candidates) {
    if (unknown.includes(src)) continue;
    if (!hasAny && !had.has(src)) quietSources.push(src);
  }

  return {
    lines: top,
    headline: headlineFor(top),
    quietSources,
    unknownSources: unknown,
    placeNote: speaks ? placeNoteFor(input.place!) : null,
    elsewhereMeetings,
  };
}

/**
 * True when a meeting's own location clearly isn't the place you're standing in.
 * Unknown location, or unknown place, both read as "can't tell" — and Echo
 * keeps the meeting in the main read rather than quietly demoting it.
 */
export function meetingIsElsewhere(
  location: string | null | undefined,
  place: SituationPlace | null,
): boolean {
  const loc = (location ?? "").trim().toLowerCase();
  if (!loc || !place) return false;
  // A link or a dial-in is nowhere in particular — it travels with you.
  if (/^(https?:|zoom|meet\.|teams|google meet|phone|call)/.test(loc)) return false;
  const names = [place.savedPlace, place.where]
    .map((n) => (n ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (names.length === 0) return false;
  return !names.some((n) => loc.includes(n) || n.includes(loc));
}

/** "Read from Bangkok." — where you stood, never a claim about distance. */
export function placeNoteFor(place: SituationPlace): string {
  const where = place.where.trim();
  /* Standing inside a place you named. This is the only case where Echo says
     where you are rather than where it read from. */
  const saved = place.savedPlace?.trim();
  if (saved && (place.scope === "exact" || place.scope === "area")) {
    return `You're at ${saved}.`;
  }
  switch (place.scope) {
    case "exact":
      return `Read from where you are, ${where}.`;
    case "area":
      return `Read from around ${where}.`;
    case "city":
      return `Read from ${where}.`;
    case "country":
      return `Read from ${where} — that's as close as Echo can place you.`;
    default:
      return `Read from ${where}.`;
  }
}

/** One opening sentence, chosen by the strongest line. Never a count of nothing. */
export function headlineFor(lines: SituationLine[]): string {
  if (lines.length === 0) return "You're clear.";
  switch (lines[0].kind) {
    case "overdue":
      return "Something you promised is late.";
    case "waiting_on_you":
      return "Work is drafted and waiting on your call.";
    case "meeting_soon":
      return "You're due somewhere shortly.";
    case "due_soon":
      return "Here's what's next.";
    case "noticed":
      return "Echo noticed something worth a look.";
    case "went_unusually_quiet":
      return "One thread has gone quieter than usual.";
    case "arrived":
      return "New things landed and are still unfiled.";
    case "matter_open":
      return "A reading is waiting for your review.";
    case "matter_proposed":
      return "Some sources look like they belong together.";
  }
}

/** "Nothing waiting in Commitments or Inbox." — named once, never as zeros. */
export function quietLine(sources: SituationSource[]): string | null {
  if (sources.length === 0) return null;
  const names = sources.map((s) => SOURCE_LABEL[s]);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `Nothing waiting in ${list}.`;
}

/** "Echo can't see Calendar right now." — missing stays missing. */
export function unknownLine(sources: SituationSource[]): string | null {
  if (sources.length === 0) return null;
  const names = sources.map((s) => SOURCE_LABEL[s]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `No reading from ${list} — so this read leaves ${names.length === 1 ? "it" : "them"} out.`;
}
