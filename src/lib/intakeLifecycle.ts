/**
 * Intake lifecycle — Slice 6.
 *
 * Single source of truth for classifying any raw intake item (capture, file,
 * note, field note) into one of five plain-English states and filtering
 * Command Center / Inbox views from those states.
 *
 * States (UI words):
 *   Active     — fresh, not routed, not dismissed, within visibility window
 *   Attached   — present in project_items for some project
 *   Archived   — explicitly archived
 *   Dismissed  — explicitly dismissed (intake_dismissals row, restored_at null)
 *   Stale      — older than window AND not attached AND not dismissed AND not in
 *                an active workflow
 *
 * Nothing here deletes anything — these are just filters layered on top of the
 * raw rows the rest of the app already reads.
 */

export type LifecycleState =
  | "active"
  | "attached"
  | "archived"
  | "dismissed"
  | "stale";

export type LifecycleFilter = LifecycleState | "all";

export type IntakePrefs = {
  capture_visibility_days: number; // 2 | 3 | 7 | N
  unattached_after_window: "collapse" | "archive" | "keep" | "ask";
  dismissed_behavior: "sticky" | "show_restore";
  duplicate_grouping: "group" | "hide_dupes" | "newest_only" | "show_all";
  command_center_section_limit: number; // 3 | 5 | 10 | N
};

export const DEFAULT_INTAKE_PREFS: IntakePrefs = {
  capture_visibility_days: 3,
  unattached_after_window: "collapse",
  dismissed_behavior: "sticky",
  duplicate_grouping: "group",
  command_center_section_limit: 5,
};

export type DismissedSet = Set<string>; // keys: `${kind}:${id}`
export type AttachedSet = Set<string>; // keys: `${kind}:${id}`

export type IntakeClassifyInput = {
  kind: "message" | "file" | "field_note" | "note" | "capture";
  id: string;
  ts: string;
  isArchived?: boolean;
  hasActiveWorkflow?: boolean; // open commitment / pending sherlock / due reminder
};

export function keyFor(kind: string, id: string): string {
  return `${kind}:${id}`;
}

export function classifyIntakeItem(
  item: IntakeClassifyInput,
  prefs: IntakePrefs,
  dismissed: DismissedSet,
  attached: AttachedSet,
  now: Date = new Date(),
): LifecycleState {
  const k = keyFor(item.kind, item.id);
  if (dismissed.has(k)) return "dismissed";
  if (attached.has(k)) return "attached";
  if (item.isArchived) return "archived";
  const ageDays = (now.getTime() - new Date(item.ts).getTime()) / 86_400_000;
  if (ageDays > prefs.capture_visibility_days && !item.hasActiveWorkflow) {
    return "stale";
  }
  return "active";
}

/** Items shown in Command Center: active only, optionally collapsing stale. */
export function filterForCommandCenter<T extends IntakeClassifyInput>(
  items: T[],
  prefs: IntakePrefs,
  dismissed: DismissedSet,
  attached: AttachedSet,
  now: Date = new Date(),
): T[] {
  return items.filter((i) => {
    const s = classifyIntakeItem(i, prefs, dismissed, attached, now);
    return s === "active";
  });
}

export function filterForInbox<T extends IntakeClassifyInput>(
  items: T[],
  prefs: IntakePrefs,
  dismissed: DismissedSet,
  attached: AttachedSet,
  filter: LifecycleFilter,
  now: Date = new Date(),
): T[] {
  if (filter === "all") return items;
  return items.filter(
    (i) => classifyIntakeItem(i, prefs, dismissed, attached, now) === filter,
  );
}

// -- Duplicate grouping ------------------------------------------------------

export type IntakeGroup<T> = {
  kind: "group";
  key: string;
  label: string;
  items: T[];
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "at",
  "is", "it", "this", "that", "with", "from", "by", "as", "be", "are",
  "was", "were", "you", "your", "i", "we", "they", "them", "our",
]);

function topKeywords(text: string, n = 2): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    .slice(0, n);
}

/**
 * Bucket similar captures within a 48h window by shared top keywords.
 * Returns a mixed list of single items and group summary cards.
 */
export function groupSimilarCaptures<T extends { id: string; ts: string; text?: string; label?: string }>(
  items: T[],
  prefs: IntakePrefs,
  windowHours = 48,
): Array<T | IntakeGroup<T>> {
  if (prefs.duplicate_grouping === "show_all") return items;
  if (prefs.duplicate_grouping === "newest_only") {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const it of items) {
      const key = topKeywords(it.text ?? it.label ?? "").join("|") || it.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(it);
    }
    return out;
  }

  const windowMs = windowHours * 3600 * 1000;
  const buckets = new Map<string, T[]>();
  const order: string[] = [];
  for (const it of items) {
    const kws = topKeywords(it.text ?? it.label ?? "");
    const stem = kws.join("|");
    if (!stem) {
      buckets.set(`__solo__${it.id}`, [it]);
      order.push(`__solo__${it.id}`);
      continue;
    }
    // find an open bucket with same stem and ts within window
    const ts = new Date(it.ts).getTime();
    let placed = false;
    for (const k of order) {
      if (!k.startsWith(stem + "@")) continue;
      const arr = buckets.get(k)!;
      const first = new Date(arr[0].ts).getTime();
      if (Math.abs(first - ts) <= windowMs) {
        arr.push(it);
        placed = true;
        break;
      }
    }
    if (!placed) {
      const key = `${stem}@${ts}`;
      buckets.set(key, [it]);
      order.push(key);
    }
  }

  const out: Array<T | IntakeGroup<T>> = [];
  for (const k of order) {
    const arr = buckets.get(k)!;
    if (arr.length === 1 || k.startsWith("__solo__")) {
      out.push(arr[0]);
      continue;
    }
    if (prefs.duplicate_grouping === "hide_dupes") {
      out.push(arr[0]); // only the newest
      continue;
    }
    const kws = k.split("@")[0].split("|").filter(Boolean);
    const label = `${arr.length} related ${kws.join(" ")} captures`.trim();
    out.push({
      kind: "group",
      key: `group:${k}`,
      label,
      items: arr,
    });
  }
  return out;
}

export function isGroup<T>(x: T | IntakeGroup<T>): x is IntakeGroup<T> {
  return !!x && typeof x === "object" && (x as any).kind === "group";
}
