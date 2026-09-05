// sherlockBriefing — the front door of the Sherlock room.
//
// Doctrine: a room opens with where things stand, not with a control panel.
// This module turns the pending-findings queue into one honest read-out:
// what kinds of things Echo noticed, and exactly one place to start.
//
// Rules it obeys:
//   - exactly one "Start here", or none at all
//   - sensitive findings are never promoted into Start here
//   - low confidence never outranks high confidence
//   - a calm queue says so plainly and offers nothing to do
//   - pure: no fetching, no clock beyond what is handed in
import type { SherlockFinding } from "@/lib/sherlock/types";

export type NoticedGroup = {
  /** Stable key: the finding mode. */
  key: string;
  /** Plain-English plural label: "Possible connections". */
  label: string;
  count: number;
  /** Newest summary in the group, so the group is never abstract. */
  example: string;
};

export type SherlockBriefing = {
  /** One sentence for the room head. Never "Synchronized". */
  headline: string;
  /** The single thing worth doing first, or null when the queue is calm. */
  startHere: SherlockFinding | null;
  /** Why that one was promoted, in plain English. */
  startHereReason: string | null;
  groups: NoticedGroup[];
  /** True when there is nothing pending at all. */
  calm: boolean;
};

const GROUP_LABEL: Record<string, string> = {
  observe: "Patterns noticed",
  extract: "Details pulled out",
  relate: "Possible connections",
  suggest: "Suggestions",
  investigate: "Worth a look",
};

const CONFIDENCE_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function ts(f: SherlockFinding): number {
  const raw = f.updated_at || f.created_at;
  const n = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(n) ? 0 : n;
}

export function groupNoticed(findings: SherlockFinding[]): NoticedGroup[] {
  const byMode = new Map<string, SherlockFinding[]>();
  for (const f of findings) {
    const key = f.mode || "observe";
    const list = byMode.get(key);
    if (list) list.push(f);
    else byMode.set(key, [f]);
  }
  return [...byMode.entries()]
    .map(([key, list]) => {
      const newest = [...list].sort((a, b) => ts(b) - ts(a))[0];
      return {
        key,
        label: GROUP_LABEL[key] ?? "Noticed",
        count: list.length,
        example: newest?.summary ?? "",
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * Promote exactly one finding. Highest confidence first, then newest. Sensitive
 * findings are excluded: they need a deliberate look, not a nudge.
 */
export function pickStartHere(findings: SherlockFinding[]): SherlockFinding | null {
  const eligible = findings.filter((f) => !f.sensitive_flag && f.status === "pending");
  if (!eligible.length) return null;
  const sorted = [...eligible].sort((a, b) => {
    const ra = CONFIDENCE_RANK[a.confidence] ?? 0;
    const rb = CONFIDENCE_RANK[b.confidence] ?? 0;
    if (ra !== rb) return rb - ra;
    return ts(b) - ts(a);
  });
  const top = sorted[0];
  // Nothing above "low" is worth interrupting for.
  if ((CONFIDENCE_RANK[top.confidence] ?? 0) < 2) return null;
  return top;
}

function reasonFor(f: SherlockFinding): string {
  if (f.confidence === "high") return "Strongest match in the queue right now.";
  return "Best of what is waiting — worth a look, not a certainty.";
}

export function buildSherlockBriefing(input: {
  pending: SherlockFinding[];
  /** Last completed scan, when a scan has ever run. */
  lastScanAt?: string | null;
}): SherlockBriefing {
  const pending = input.pending.filter((f) => f.status === "pending");
  if (!pending.length) {
    return {
      headline: input.lastScanAt
        ? "Nothing new since the last look. Sherlock only speaks when a pattern repeats."
        : "Sherlock has not looked yet. It reads what you have already saved — it never goes out on its own.",
      startHere: null,
      startHereReason: null,
      groups: [],
      calm: true,
    };
  }
  const groups = groupNoticed(pending);
  const startHere = pickStartHere(pending);
  const sensitive = pending.filter((f) => f.sensitive_flag).length;
  const parts = [
    `${pending.length} thing${pending.length === 1 ? "" : "s"} waiting on your read`,
  ];
  if (sensitive) parts.push(`${sensitive} marked sensitive`);
  return {
    headline: `${parts.join(" · ")}. Nothing has been filed.`,
    startHere,
    startHereReason: startHere ? reasonFor(startHere) : null,
    groups,
    calm: false,
  };
}
