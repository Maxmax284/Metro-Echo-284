// awarenessShelves — one read of where you are, then four shelves.
//
// Doctrine:
//   - one paragraph first. Not a grid of layer cards reporting in turn.
//   - four shelves, fixed order: Now / Around you / Changed / Coming up.
//   - at most three lines per shelf. An empty shelf says how something gets
//     there; it never just reports emptiness.
//   - a layer that has never been read is missing, not zero, and never
//     contributes a reassuring line.
//   - nothing here scans. Reading is always an explicit tap.
//
// Pure module: the caller hands over provider state, this ranks and words it.

import { coerceSignal, type RiskLevel } from "@/lib/vantaSignal";
import { formatDistance } from "@/lib/trips";

export type ShelfKey = "now" | "around" | "changed" | "coming";

export const SHELF_LABEL: Record<ShelfKey, string> = {
  now: "Now",
  around: "Around you",
  changed: "Changed",
  coming: "Coming up",
};

/** Which layers belong on which shelf when they have a read. */
const RISK_LAYERS = ["hazards", "scams", "connectivity"] as const;
const AROUND_LAYERS = ["transport", "infrastructure", "payments", "etiquette", "connectivity"] as const;
const COMING_LAYERS = ["timing", "transport"] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type ShelfLine = {
  key: string;
  /** The one sentence a person reads. */
  text: string;
  /** Why it is on this shelf, in plain words. */
  detail: string;
  /** The layer to open, when there is one. */
  section?: string | null;
  /** Newest fact behind the line. */
  at?: string | null;
  tone?: "warn" | "plain";
};

export type Shelf = {
  key: ShelfKey;
  label: string;
  lines: ShelfLine[];
  /** Shown instead of lines. Teaches how something lands here. */
  quiet: string;
};

export type ShelvesRead = {
  /** One paragraph. Where you are, how sure, and what has been read. */
  paragraph: string;
  shelves: Shelf[];
  /** Layers never read here, named once rather than shown as empty cards. */
  neverRead: string[];
};

export type ShelvesInput = {
  now?: number;
  place: { label: string; city?: string | null; region?: string | null; country?: string | null } | null;
  /** Plain-English state line already resolved by awarenessLocation. */
  locationMessage?: string | null;
  placeUnresolved?: boolean;
  /** Newest scan time across layers, if anything has ever been scanned. */
  newestAt?: string | null;
  /** The location warning carried on the snapshot, if any. */
  locationWarning?: unknown;
  /** Latest briefing per layer, exactly as stored. */
  briefings: Record<string, { signal?: unknown; confidence?: string | null; generated_at: string } | undefined>;
  /** All layers Echo knows how to read. */
  layers: readonly string[];
  /**
   * Meetings soon that are somewhere other than where you are. Today's read
   * leaves them alone; they belong on the "Around you" shelf.
   */
  elsewhereMeetings?: Array<{ id: string; title: string; starts_at: string; location: string }>;
  /**
   * Your own saved places with a measured distance from the current fix. This is
   * recorded ground truth, not a search result, so it is the first thing the
   * "Around you" shelf says.
   */
  savedNearby?: Array<{ id: string; label: string; distanceM: number }>;
  /**
   * Populated places around the fix, from the nearby lookup Echo already runs.
   * Named towns with a measured distance — no interpretation on top.
   */
  nearbyTowns?: Array<{ name: string; kind?: string | null; distanceM: number }>;
};

/** How close a saved place has to be before it counts as "around you". */
export const NEAR_RADIUS_M = 5000;

function ageMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? now - t : null;
}

/** "just now", "3h ago", "4d ago" — never a raw timestamp in prose. */
export function agoPhrase(iso: string | null | undefined, now = Date.now()): string {
  const age = ageMs(iso, now);
  if (age == null) return "never read";
  const mins = age / 60000;
  if (mins < 60) return mins < 2 ? "just now" : `${Math.round(mins)}m ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const RISK_RANK: Record<RiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

/** Where you are, in one paragraph. Never two paragraphs saying the same thing. */
export function placeParagraph(input: ShelvesInput): string {
  const now = input.now ?? Date.now();
  if (!input.place) {
    return "Echo has no place to read from yet. Save where you are and it can start looking around you.";
  }
  const where = input.place.city || input.place.region || input.place.country || input.place.label;
  const read = Object.values(input.briefings).filter(Boolean).length;
  const parts: string[] = [];
  if (input.placeUnresolved) {
    parts.push(`Echo is working from ${input.place.label}, but it can't tell where that is yet.`);
  } else {
    parts.push(`You're reading this from ${where}.`);
  }
  if (read === 0) {
    parts.push("Nothing has been read here yet — a scan only runs when you tap it.");
  } else {
    parts.push(`${read === 1 ? "One layer has" : `${read} layers have`} been read, newest ${agoPhrase(input.newestAt, now)}.`);
  }
  if (input.locationMessage && input.placeUnresolved) parts.push(input.locationMessage);
  return parts.join(" ");
}

export function readShelves(input: ShelvesInput): ShelvesRead {
  const now = input.now ?? Date.now();
  const nowLines: ShelfLine[] = [];
  const around: ShelfLine[] = [];
  const changed: ShelfLine[] = [];
  const coming: ShelfLine[] = [];

  /* A location warning outranks every layer read: the read itself may be
     standing on the wrong ground. */
  if (input.locationWarning) {
    const s = coerceSignal(input.locationWarning);
    nowLines.push({
      key: "warning",
      text: s.title || "Where you are doesn't add up.",
      detail: s.short_summary || "Fix the place before trusting the rest of this read.",
      tone: "warn",
      at: null,
    });
  }

  const entries = input.layers
    .map((layer) => ({ layer, b: input.briefings[layer] }))
    .filter((e): e is { layer: string; b: NonNullable<ShelvesInput["briefings"][string]> } => Boolean(e.b));

  for (const { layer, b } of entries) {
    const sig = coerceSignal(b.signal ?? {});
    const risk = RISK_RANK[sig.risk_level];
    const age = ageMs(b.generated_at, now) ?? 0;

    /* Now — only what carries real risk, or a risky layer Echo isn't sure of. */
    if ((RISK_LAYERS as readonly string[]).includes(layer)) {
      if (risk >= 2) {
        nowLines.push({
          key: `risk:${layer}`,
          text: sig.title || `${layer} needs a look.`,
          detail: sig.why_it_matters || sig.short_summary || `Read from the ${layer} layer.`,
          section: layer,
          at: b.generated_at,
          tone: "warn",
        });
      } else if (risk >= 1 && b.confidence === "low") {
        nowLines.push({
          key: `unsure:${layer}`,
          text: sig.title || `${layer} is unclear.`,
          detail: "Something is flagged here and Echo isn't confident in the read. Worth checking yourself.",
          section: layer,
          at: b.generated_at,
          tone: "warn",
        });
      }
    }

    /* Around you — the plain read of the place, risk lines excluded so nothing
       is reported twice. */
    if ((AROUND_LAYERS as readonly string[]).includes(layer) && risk < 2) {
      around.push({
        key: `around:${layer}`,
        text: sig.title || layer,
        detail: sig.short_summary || `Read from the ${layer} layer.`,
        section: layer,
        at: b.generated_at,
      });
    }

    /* Changed — read again since yesterday. Echo keeps no before-picture of a
       layer, so it says what was re-read, never that something is different. */
    if (age < DAY_MS) {
      changed.push({
        key: `changed:${layer}`,
        text: `${layer} was read again ${agoPhrase(b.generated_at, now)}.`,
        detail: "Echo doesn't keep the previous read of a layer, so it can't tell you what moved — only that this is current.",
        section: layer,
        at: b.generated_at,
      });
    }

    /* Coming up — layers that talk about timing rather than the present. */
    if ((COMING_LAYERS as readonly string[]).includes(layer) && sig.what_to_do_next) {
      coming.push({
        key: `coming:${layer}`,
        text: sig.what_to_do_next,
        detail: `From the ${layer} read, ${agoPhrase(b.generated_at, now)}.`,
        section: layer,
        at: b.generated_at,
      });
    }
  }

  /* Anything older than a week is worth re-reading, and that belongs on Now
     because acting on a week-old read is the actual risk. */
  for (const { layer, b } of entries) {
    if ((ageMs(b.generated_at, now) ?? 0) < WEEK_MS) continue;
    nowLines.push({
      key: `stale:${layer}`,
      text: `The ${layer} read is ${agoPhrase(b.generated_at, now)}.`,
      detail: "Old enough that Echo wouldn't lean on it. Scan again when you need it.",
      section: layer,
      at: b.generated_at,
    });
  }

  /* Around you, grounded. Your own saved places first: these are places you
     recorded yourself, so the distance is measured, not guessed. */
  const saved = (input.savedNearby ?? [])
    .filter((p) => Number.isFinite(p.distanceM) && p.distanceM <= NEAR_RADIUS_M)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 2);
  for (const p of saved.slice().reverse()) {
    around.unshift({
      key: `saved:${p.id}`,
      text: `${p.label} is ${formatDistance(p.distanceM)} from here.`,
      detail: "One of your own saved places, measured from the fix Echo is using. Nothing was searched for this.",
      at: null,
    });
  }

  /* Then the named towns from the nearby lookup — the closest one only, so the
     shelf stays a read and not a list of map results. */
  const town = (input.nearbyTowns ?? [])
    .filter((t) => Number.isFinite(t.distanceM))
    .sort((a, b) => a.distanceM - b.distanceM)[0];
  if (town) {
    around.push({
      key: `town:${town.name}`,
      text: `Nearest named place is ${town.name}, about ${formatDistance(town.distanceM)} away.`,
      detail: "From the nearby-places lookup against the fix Echo is using — map data, not a web search.",
      at: null,
    });
  }

  /* Meetings happening somewhere you aren't. Today deliberately stays quiet
     about these, so this is the one place they're said — as a where-it-is note,
     never as a nudge, and never with a claim about how far away it is. */
  for (const m of input.elsewhereMeetings ?? []) {
    around.push({
      key: `meeting:${m.id}`,
      text: `${m.title} is at ${m.location} — not where you are.`,
      detail: "Read from a calendar you connected. Today leaves it alone because you're somewhere else.",
      at: m.starts_at,
    });
  }

  const byNewest = (a: ShelfLine, b: ShelfLine) =>
    new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime();
  /* Saved-place and town lines carry no read time, so a newest-first sort would
     bury them. They are ground truth: they stay at the top in distance order. */
  const grounded = around.filter((l) => l.key.startsWith("saved:") || l.key.startsWith("town:"));
  const read = around.filter((l) => !grounded.includes(l));
  read.sort(byNewest);
  around.length = 0;
  around.push(...grounded, ...read);
  changed.sort(byNewest);
  coming.sort(byNewest);

  const neverRead = input.place ? input.layers.filter((l) => !input.briefings[l]) : [...input.layers];

  const shelves: Shelf[] = [
    {
      key: "now",
      label: SHELF_LABEL.now,
      lines: nowLines.slice(0, 3),
      quiet: input.place
        ? "Nothing here is pulling at you. Anything risky Echo reads would land on this shelf."
        : "Save a place and anything risky about it lands here first.",
    },
    {
      key: "around",
      label: SHELF_LABEL.around,
      lines: around.slice(0, 3),
      quiet: "Nothing around you yet. Save a place or two near where you are, and getting around, paying, local habits and meetings held elsewhere land here.",
    },
    {
      key: "changed",
      label: SHELF_LABEL.changed,
      lines: changed.slice(0, 3),
      quiet: "Nothing re-read in the last day. Each scan you run shows up here so you know what's current.",
    },
    {
      key: "coming",
      label: SHELF_LABEL.coming,
      lines: coming.slice(0, 3),
      quiet: "Nothing ahead that Echo can see from here. Timing reads for this place land here.",
    },
  ];

  return { paragraph: placeParagraph({ ...input, now }), shelves, neverRead };
}

/** "Never read here: hazards, scams." — missing named once. */
export function neverReadLine(layers: string[]): string | null {
  if (layers.length === 0) return null;
  const list =
    layers.length === 1
      ? layers[0]
      : `${layers.slice(0, -1).join(", ")} and ${layers[layers.length - 1]}`;
  return `Never read here: ${list}. Echo leaves ${layers.length === 1 ? "it" : "them"} out rather than guess.`;
}
