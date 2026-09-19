// wearableAutoSend.ts — is the hands-off feed actually landing?
//
// Pure. Nothing here posts, reads a device, or writes a row. It looks at
// readings that arrived by phone export (`source: "ingest"`) and says plainly
// whether the automatic feed is alive, late, or was never set up. A gap is
// always a gap: no zeros standing in for missing data.
import { latest, stepsForDay, type Reading, type ReadingKind } from "@/lib/wearable";

/** How long an automatic feed may go quiet before Echo calls it late. */
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
        { kind: "resting_heart_rate", value: 54, unit: "bpm", measured_at: "2026-09-02T06:30:00Z" },
        { kind: "hrv", value: 68, unit: "ms", measured_at: "2026-09-02T06:30:00Z" },
        { kind: "spo2", value: 97, unit: "%", measured_at: "2026-09-02T06:30:00Z" },
        { kind: "calories", value: 612, unit: "kcal", measured_at: "2026-09-02T18:00:00Z" },
        { kind: "weight", value: 78.4, unit: "kg", measured_at: "2026-09-02T07:00:00Z" },
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
    title: "iPhone · Apple Health",
    app: "Health Auto Export (App Store), or Shortcuts if you'd rather not install anything",
    steps: [
      "Copy your private link below. Treat it like a key — it can drop readings in, nothing else.",
      "Install Health Auto Export and let it read Apple Health for whatever you want sent — heart rate, resting heart rate, variability, sleep, steps, energy, workouts, weight.",
      "In the app: Automations, add a REST API automation, paste the link as the URL, method POST, format JSON.",
      "Set it to run hourly, or daily plus after a workout — whatever suits you.",
      "Echo reads Health Auto Export's own format, so there is no JSON to write. If you use Shortcuts instead, post the plain list shown below.",
      "Tap Check the feed here once. If it says sending, you're done — you never touch it again.",
    ],
  },
  {
    platform: "android",
    title: "Android · Health Connect",
    app: "Health Connect, read by an exporter app (Health Sync, Tasker or similar)",
    steps: [
      "Copy your private link below.",
      "Give your exporter read access in Health Connect — Google Fit's own numbers live here now, so anything Fit or your watch writes is included.",
      "Point the exporter's webhook or HTTP POST at the link, method POST, JSON.",
      "Set the schedule to hourly or daily, plus on workout end if it offers it.",
      "Echo reads a plain sample list as well as its own format, so most exporters work untouched.",
      "Tap Check the feed here once to confirm the first send landed.",
    ],
  },
];

export interface WatchRecipe {
  key: string;
  /** What the box says. */
  title: string;
  /** The phone app that stands between the watch and Echo. */
  app: string;
  steps: string[];
  /** Live heart rate straight to Echo, when the watch broadcasts it. */
  broadcast: string | null;
}

/**
 * Watch brands that reach Echo through the phone's own health store. None of
 * these needs an account with the brand: the brand's app writes to Apple Health
 * or Health Connect, and Echo reads what the phone sends on. A watch that is
 * not listed still works if its app writes to either store.
 */
export const WATCH_RECIPES: WatchRecipe[] = [
  {
    key: "amazfit",
    title: "Amazfit · Bip, Active, T-Rex, Cheetah",
    app: "Zepp",
    steps: [
      "Pair the watch to Zepp as normal, and let it finish its first sync before you start.",
      "Android: install Health Connect from the Play Store first if the phone doesn't already have it.",
      "Zepp: tap Profile at the bottom right.",
      "Tap Accounts and Authorization — older builds call it Add Accounts.",
      "Tap Health Connect on Android, or Apple Health on iPhone, then tap Connect.",
      "On the permission sheet, tap Allow all — or tick heart rate, resting heart rate, steps, sleep and workouts by hand, then Allow.",
      "Android only: phone Settings, Health Connect, App permissions, Zepp — check writing is on for those five.",
      "Zepp: Profile, tap your watch, Health Monitoring — set heart rate to all-day or automatic, or Zepp has hourly gaps to hand over.",
      "Set up the phone hand-off above once. Zepp fills the phone, the phone sends it to Echo.",
      "Tap Check the feed here after the next sync to see the first readings land.",
    ],
    broadcast:
      "For beats live rather than hourly: on the watch open Settings, Workout Settings, then turn on Broadcast Heart Rate (some models call it Heart Rate Sharing). Start any workout to keep the sensor awake, then tap Connect a watch on Today or the body desk. Android Chrome or a computer only — iPhone can't do it.",
  },
  {
    key: "garmin",
    title: "Garmin",
    app: "Garmin Connect",
    steps: [
      "In Garmin Connect: Settings, Connected Apps — turn on Health Connect or Apple Health.",
      "Allow the readings you want shared.",
      "Set up the phone hand-off above once, then check the feed.",
    ],
    broadcast:
      "Most Garmin watches broadcast heart rate during an activity, so Echo can read the beats live over Bluetooth.",
  },
  {
    key: "fitbit",
    title: "Fitbit",
    app: "Fitbit",
    steps: [
      "On Android: Fitbit app, Settings, Health Connect — turn it on and allow the readings.",
      "On iPhone: Fitbit writes to Apple Health for steps, sleep and workouts; heart rate stays inside Fitbit.",
      "Set up the phone hand-off above once, then check the feed.",
    ],
    broadcast: null,
  },
  {
    key: "samsung",
    title: "Samsung Galaxy Watch",
    app: "Samsung Health",
    steps: [
      "Samsung Health: Settings, Health Connect — allow the readings you want shared.",
      "Set up the phone hand-off above once, then check the feed.",
    ],
    broadcast: null,
  },
  {
    key: "apple",
    title: "Apple Watch",
    app: "Apple Health",
    steps: [
      "Nothing to link — the watch already writes straight into Apple Health.",
      "Set up the iPhone hand-off above once, then check the feed.",
    ],
    broadcast: null,
  },
];

/** The plain answer for a watch nobody listed. */
export const UNLISTED_WATCH_LINE =
  "A watch that isn't listed still works, as long as its own app can write to Apple Health or Health Connect. If it can't, Echo says so rather than pretending a reading arrived.";

/**
 * The honest limit, said once and in plain words. Apple Health and Health
 * Connect have no cloud to read from — Google Fit's own API was retired and its
 * data moved into Health Connect — so the phone is always the sender. That is
 * not a shortcut Echo took; it is the only door either platform opens.
 */
export const HEALTH_PUSH_TRUTH =
  "Apple Health and Health Connect keep your readings on the phone; neither offers a cloud Echo could read. So your phone pushes on a schedule and Echo never reaches out to a device. Once it's set up, nothing is typed by hand.";

/** What the wrist may say about the feed in one proof chip. */
export function autoSendProof(health: AutoSendHealth): string {
  return `auto ${health.label}`;
}
