// situationReducer — turns raw recorded events into what a person needs today.
//
// Plumbing (syncs, push diagnostics, health ticks, tests) never reaches the
// briefing; it stays countable and one tap away in Receipts. Only today's
// events count — yesterday was yesterday. Repeats fold into one line.
import { isNoise, plainLabel, bucketFor, type BucketKey } from "@/lib/changeBuckets";

export type SituationEvent = { id: string; event: string; created_at: string };
export type Situation = { key: string; label: string; count: number; latest: string; bucket: BucketKey };
export type SituationBrief = {
  situations: Situation[];
  plumbing: number;
  /** Stable fingerprint — changes only when something meaningful lands. */
  signature: string;
};

const PLUMBING = [
  /push[_ .]/i, /diagnos/i, /[_ .]test/i, /^test/i, /subscription/i, /service[_ ]?worker/i,
  /token[_ ]refresh/i, /oauth/i, /sweep/i, /scan/i, /embedding/i, /autolink/i, /viewed/i, /opened/i,
  /prefs?[_ .]/i, /preference/i, /settings?[_ .]/i, /acknowledg/i, /today[_ ]take/i,
];

export function isPlumbing(event: string): boolean {
  return isNoise(event) || PLUMBING.some((r) => r.test(event));
}

function startOfLocalDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function reduceSituation(events: SituationEvent[], now = Date.now()): SituationBrief {
  const since = startOfLocalDay(now);
  const map = new Map<string, Situation>();
  let plumbing = 0;
  for (const ev of events) {
    const at = Date.parse(ev.created_at);
    if (!Number.isFinite(at) || at < since) continue;
    if (isPlumbing(ev.event)) { plumbing += 1; continue; }
    const label = plainLabel(ev.event);
    const s = map.get(label);
    if (s) { s.count += 1; if (ev.created_at > s.latest) s.latest = ev.created_at; }
    else map.set(label, { key: label, label, count: 1, latest: ev.created_at, bucket: bucketFor(ev.event) });
  }
  const situations = [...map.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  const signature = situations.map((s) => `${s.key}:${s.count}:${s.latest}`).join("|");
  return { situations, plumbing, signature };
}
