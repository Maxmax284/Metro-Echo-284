// changeBuckets — turns raw recorded events into four human shelves.
//
// Background housekeeping (scans, dismissals, health ticks) never reaches the
// human summary — it stays in Receipts. Unknown event names fall back to the
// shared humanizer and land in the shelf their prefix suggests.
import { humanizeEvent } from "@/lib/plainLabels";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

export type BucketKey = "inbound" | "schedule" | "actions" | "insights";

export const BUCKETS: Record<BucketKey, { title: string; hint: string; target: SurfaceKey }> = {
  inbound: { title: "Inbound captures", hint: "What came in from Telegram, capture and linked apps", target: "inbox" },
  schedule: { title: "Schedule & reminders", hint: "Promises, reminders and calendar moves", target: "commitments" },
  actions: { title: "Actions taken", hint: "Things you approved and what ran", target: "actions" },
  insights: { title: "Echo insights", hint: "Patterns Echo noticed for you to look at", target: "sherlock" },
};

export const BUCKET_ORDER: BucketKey[] = ["inbound", "schedule", "actions", "insights"];

/** Housekeeping — excluded from the human shelves, folded away and countable. */
const NOISE = [
  /patterns?[_ ]scanned/i, /nudge[_ ]dismissed/i, /health/i, /heartbeat/i, /sync(ed)?[_ ]ok/i,
  /cache/i, /^calendar[_ ]sync/i, /synchroni[sz]ed/i,
  /push[_ .]/i, /diagnos/i, /[_ .]test/i, /^test/i, /subscription/i, /service[_ ]?worker/i,
  /token[_ ]refresh/i, /oauth/i, /sweep/i, /scan/i, /embedding/i, /autolink/i, /viewed/i, /opened/i,
  /prefs?[_ .]/i, /preference/i, /settings?[_ .]/i, /acknowledg/i, /today[_ ]take/i,
  /brief(ing)?[_ ](generated|composed|read)/i,
];


const PLAIN: Array<[RegExp, string]> = [
  [/transition:?\s*staged\s*->\s*approved/i, "Action approved"],
  [/transition:?\s*approved\s*->\s*executed/i, "Action ran"],
  [/execute[_ ]success/i, "Action ran"],
  [/execute[_ ]fail/i, "Action failed to run"],
  [/action[_ ]staged/i, "Action waiting for your yes"],
  [/ecosystem[_ ]gth/i, "Ground Truth Hub update"],
  [/capture[_ ]needs[_ ]review/i, "Capture waiting for a look"],
  [/reminder[_ ]needs[_ ]time/i, "Reminder needs a time"],
  [/reminder[_ ]scheduled/i, "Reminder set"],
  [/telegram/i, "Note from Telegram"],
  [/sherlock[_ ]suggest/i, "Echo spotted something"],
  [/commitment[_ ]completed/i, "Promise kept"],
  [/commitment[_ ]reopened/i, "Promise reopened"],
];

export function isNoise(event: string) {
  return NOISE.some((r) => r.test(event));
}

export function plainLabel(event: string) {
  for (const [r, l] of PLAIN) if (r.test(event)) return l;
  return humanizeEvent(event);
}

export function bucketFor(event: string): BucketKey {
  const e = event.toLowerCase();
  if (/sherlock|insight|noticed|pattern|nudge|awareness/.test(e)) return "insights";
  if (/remind|commit|calendar|schedule|meeting|flight|due/.test(e)) return "schedule";
  if (/action|execute|transition|approv|staged|run/.test(e)) return "actions";
  return "inbound";
}

export type BucketLine = { label: string; count: number; latest: string; raw: string };
export type Bucket = { key: BucketKey; total: number; lines: BucketLine[] };

export function bucketEvents(events: { event: string; created_at: string }[]): {
  buckets: Bucket[];
  hidden: number;
  /** The folded housekeeping, grouped — shown inside the sheet on request. */
  hiddenLines: BucketLine[];
} {
  const map = new Map<BucketKey, Map<string, BucketLine>>();
  const back = new Map<string, BucketLine>();
  let hidden = 0;
  for (const ev of events) {
    if (isNoise(ev.event)) {
      hidden += 1;
      const label = plainLabel(ev.event);
      const h = back.get(label);
      if (h) { h.count += 1; if (ev.created_at > h.latest) h.latest = ev.created_at; }
      else back.set(label, { label, count: 1, latest: ev.created_at, raw: ev.event });
      continue;
    }
    const b = bucketFor(ev.event);
    const label = plainLabel(ev.event);
    const lines = map.get(b) ?? new Map<string, BucketLine>();
    const l = lines.get(label);
    if (l) { l.count += 1; if (ev.created_at > l.latest) l.latest = ev.created_at; }
    else lines.set(label, { label, count: 1, latest: ev.created_at, raw: ev.event });
    map.set(b, lines);
  }
  const buckets = BUCKET_ORDER.filter((k) => map.has(k)).map((k) => {
    const lines = [...map.get(k)!.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
    return { key: k, total: lines.reduce((s, l) => s + l.count, 0), lines };
  });
  const hiddenLines = [...back.values()].sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
  return { buckets, hidden, hiddenLines };
}

