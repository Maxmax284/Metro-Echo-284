// wearableAutoSend.ts — is the hands-off feed actually landing?
//
// Pure. Nothing here posts, reads a device, or writes a row. It looks at
// readings that arrived by phone export (`source: "ingest"`) and says plainly
// whether the automatic feed is alive, late, or was never set up. A gap is
// always a gap: no zeros standing in for missing data.
import { latest, stepsForDay, type Reading, type ReadingKind } from "@/lib/wearable";

/** How long an automatic feed may go quiet before Vanta calls it late. */
export const AUTO_SEND_STALE_HOURS = 26;

export type AutoSendState = "never" | "late" | "live";

export interface AutoSendHealth {
  state: AutoSendState;
  /** Short machine label for a proof line. */
  label: string;
  /** One honest sentence for a card. */
  detail: string;
  lastAt: string | null;
  hoursSince: number | null;
  kinds: ReadingKind[];
}

function hoursBetween(then: string, now: Date): number {
  return (now.getTime() - new Date(then).getTime()) / 3_600_000;
}

/**
 * Health of the automatic phone feed. Readings entered by hand or read over
 * Bluetooth do not count — they are not the thing that is supposed to run
 * without you.
 */
export function autoSendHealth(
  readings: Reading[],
  consented: boolean,
  now = new Date(),
): AutoSendHealth {
  if (!consented) {
    return {
      state: "never",
      label: "activity off",
      detail:
        "Steps, sleep and workouts are switched off, so nothing is being read, stored, or inferred.",
      lastAt: null,
      hoursSince: null,
      kinds: [],
    };
  }

  const sent = readings.filter((r) => r.source === "ingest");
  if (!sent.length) {
    return {
      state: "never",
      label: "not set up",
      detail:
        "Nothing has arrived from your phone yet. Once the export is set up, readings land here on their own.",
      lastAt: null,
      hoursSince: null,
      kinds: [],
    };
  }

  let newest = sent[0];
  for (const r of sent) {
    if (new Date(r.measured_at) > new Date(newest.measured_at)) newest = r;
  }
  const hours = hoursBetween(newest.measured_at, now);
  const kinds = [...new Set(sent.map((r) => r.kind))];

  if (hours > AUTO_SEND_STALE_HOURS) {
    return {
      state: "late",
      label: `late by ${Math.round(hours - AUTO_SEND_STALE_HOURS)}h`,
      detail: `The last automatic send was ${Math.round(hours)} hours ago. The export on your phone has probably stopped running.`,
      lastAt: newest.measured_at,
      hoursSince: hours,
      kinds,
    };
  }

  return {
    state: "live",
    label: hours < 1 ? "sending" : `sent ${Math.round(hours)}h ago`,
    detail: `Your phone is sending on its own — ${kinds.length} kind${kinds.length === 1 ? "" : "s"} of reading, last one ${hours < 1 ? "within the hour" : `${Math.round(hours)} hours ago`}.`,
    lastAt: newest.measured_at,
    hoursSince: hours,
    kinds,
  };
}

export interface BodyRow {
  key: ReadingKind;
  label: string;
  /** Rendered value, or null when there is nothing honest to show. */
  value: string | null;
  /** Where it came from, or why it is blank. */
  note: string;
}

/**
 * The wrist strip: three lines, each either a real number with its source or a
 * stated gap. Never a zero in place of silence.
 */
export function bodyStrip(
  readings: Reading[],
  consent: { heart_rate?: boolean; activity?: boolean },
  now = new Date(),
): BodyRow[] {
  const hrOn = consent.heart_rate === true;
  const actOn = consent.activity === true;

  const hr = hrOn ? latest(readings, "heart_rate") : null;
  const steps = actOn ? stepsForDay(readings, now) : null;
  const sleep = actOn ? latest(readings, "sleep") : null;

  const freshness = (at: string) => {
    const h = hoursBetween(at, now);
    if (h < 1) return "just now";
    if (h < 24) return `${Math.round(h)}h ago`;
    return `${Math.round(h / 24)}d ago`;
  };

  return [
    {
      key: "heart_rate",
      label: "Heart",
      value: hr ? `${Math.round(hr.value)} bpm` : null,
      note: !hrOn ? "sense off" : hr ? freshness(hr.measured_at) : "nothing read yet",
    },
    {
      key: "steps",
      label: "Steps",
      value: steps !== null ? String(steps) : null,
      note: !actOn ? "sense off" : steps !== null ? "today" : "nothing sent today",
    },
    {
      key: "sleep",
      label: "Sleep",
      value: sleep ? `${Math.round(sleep.value / 60)}h ${Math.round(sleep.value % 60)}m` : null,
      note: !actOn ? "sense off" : sleep ? freshness(sleep.measured_at) : "no night recorded",
    },
  ];
}

/** The exact body an export should post. Kept here so copy and docs can't drift. */
export function ingestBodyTemplate(): string {
  return JSON.stringify(
    {
      readings: [
        { kind: "steps", value: 8421, unit: "steps", measured_at: "2026-09-02T18:00:00Z" },
        { kind: "heart_rate", value: 62, unit: "bpm", measured_at: "2026-09-02T18:00:00Z" },
        { kind: "sleep", value: 431, unit: "minutes", measured_at: "2026-09-02T06:30:00Z" },
        { kind: "workout", value: 48, unit: "minutes", measured_at: "2026-09-02T17:10:00Z" },
      ],
    },
    null,
    2,
  );
}

export interface SetupRecipe {
  platform: "iphone" | "android";
  title: string;
  app: string;
  steps: string[];
}

export const SETUP_RECIPES: SetupRecipe[] = [
  {
    platform: "iphone",
    title: "iPhone",
    app: "Shortcuts, or Health Auto Export",
    steps: [
      "Copy your private link below. Treat it like a key — it can drop readings in, nothing else.",
      "Open Shortcuts, make a new shortcut, and add “Get Health Sample” for steps, then heart rate, then sleep.",
      "Add “Get Contents of URL”. Paste the link, set the method to POST, and set the request body to JSON in the shape shown below.",
      "Add an Automation: run it daily at a time you're usually awake, and again after a workout ends.",
      "Turn off “Ask Before Running” so it goes hands-off.",
      "Tap Check the feed here once. If it says sending, you're done — you never touch it again.",
    ],
  },
  {
    platform: "android",
    title: "Android",
    app: "Health Connect, via an export app or Tasker",
    steps: [
      "Copy your private link below.",
      "Give your export app read access to Health Connect for steps, heart rate and sleep.",
      "Point its webhook or HTTP POST at the link, with the JSON body shown below.",
      "Set the schedule to daily, plus on workout end if the app offers it.",
      "Tap Check the feed here once to confirm the first send landed.",
    ],
  },
];

/** What the wrist may say about the feed in one proof chip. */
export function autoSendProof(health: AutoSendHealth): string {
  return `auto ${health.label}`;
}
