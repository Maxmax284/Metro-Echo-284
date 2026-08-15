// Bundling — three signals about one project are one thing to say, not three.
//
// Unrelated high-urgency events are never merged just to reduce the count.
import type { AwarenessSignal } from "./signal.ts";
import { type Urgency, urgencyRank } from "./urgency.ts";

export type Candidate = {
  signal: AwarenessSignal;
  urgency: Urgency;
  score: number;
};

export type Bundle = {
  /** Grouping key: project when available, otherwise the situation itself. */
  key: string;
  label: string;
  /** Highest-value member — the one whose words get used. */
  lead: Candidate;
  members: Candidate[];
  urgency: Urgency;
  /** Human summary when more than one member. */
  title: string;
  why: string;
};

const strongest = (a: Candidate, b: Candidate) => {
  const r = urgencyRank(b.urgency) - urgencyRank(a.urgency);
  return r !== 0 ? r : b.score - a.score;
};

/**
 * Group by project when the members are ordinary attention-level notes.
 * Time-sensitive and critical items stay on their own — they deserve their own
 * sentence.
 */
export function bundleSignals(candidates: Candidate[]): Bundle[] {
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const bundleable =
      Boolean(c.signal.projectId) && urgencyRank(c.urgency) <= urgencyRank("attention");
    const key = bundleable ? `project:${c.signal.projectId}` : `single:${c.signal.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const bundles: Bundle[] = [];
  for (const [key, members] of groups) {
    const sorted = [...members].sort(strongest);
    const lead = sorted[0];
    const label = lead.signal.projectLabel ?? lead.signal.summary;
    const many = sorted.length > 1;
    bundles.push({
      key,
      label,
      lead,
      members: sorted,
      urgency: lead.urgency,
      title: many
        ? `${label} has ${sorted.length} items needing attention`
        : lead.signal.summary,
      why: many
        ? sorted.slice(0, 3).map((m) => m.signal.why).join(" · ")
        : lead.signal.why,
    });
  }

  return bundles.sort((a, b) => strongest(a.lead, b.lead));
}
