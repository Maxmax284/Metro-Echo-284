/**
 * Plain-English translation layer for Command Center bulletin items.
 *
 * Raw audit_log event strings (`brief.exported`, `capture.needs_review`, …)
 * are NEVER shown to users. This module maps them to calm, plain-English
 * sentences and assigns each one to a bulletin section.
 *
 * Design source: .lovable/integrations-daily-bulletin-audit.md §3.
 */

export type BulletinBucket =
  | "attention" // requires user review or decision
  | "project" // project-level rollups
  | "captures" // new intake
  | "done" // completed / saved / exported
  | "cleanup"; // background tidy-up

export type BulletinKind = BulletinBucket;

export type RawAuditEvent = {
  id: string;
  event: string;
  entity_type: string;
  entity_id?: string | null;
  created_at: string;
  payload?: any;
};

export type BulletinLine = {
  id: string;
  bucket: BulletinBucket;
  text: string;
  at: string;
  entity_id?: string | null;
  /** Original audit event name (if any) — drives which inline actions apply. */
  source_event?: string;
  /** Original audit entity_type — drives which inline actions apply. */
  entity_type?: string | null;
  /** Raw payload echoed through for action handlers (e.g. dismissal kind/item_id). */
  payload?: any;
};

const PROJECT_NAME_FALLBACK = "a project";

/** Format a single audit_log row into a bulletin line, or null to skip. */
export function formatAuditEvent(
  ev: RawAuditEvent,
  projectName?: string,
): BulletinLine | null {
  const e = ev.event;
  const proj = projectName || PROJECT_NAME_FALLBACK;
  const base = { id: ev.id, at: ev.created_at, entity_id: ev.entity_id ?? null };

  // -- Done / saved -------------------------------------------------------
  if (e === "brief.exported")
    return { ...base, bucket: "done", text: `${cap(proj)} brief was exported and saved.` };
  if (e === "brief.generated" || e === "briefing.composed" || e === "briefing.generated")
    return { ...base, bucket: "done", text: `A new brief was generated.` };
  if (e === "project.summarized")
    return { ...base, bucket: "project", text: `${cap(proj)} summary was refreshed.` };
  if (e === "pdf.generated")
    return { ...base, bucket: "done", text: `A PDF was generated.` };
  if (e === "reminder.completed")
    return { ...base, bucket: "done", text: `A reminder was marked done.` };
  if (e === "completed")
    return { ...base, bucket: "done", text: `Something was marked complete.` };

  // -- New captures -------------------------------------------------------
  if (e === "telegram.message_in")
    return { ...base, bucket: "captures", text: `New Telegram note captured.` };
  if (e === "ecosystem.gth.captured")
    return { ...base, bucket: "captures", text: `New update from Ground Truth Hub.` };
  if (e === "capture.routed")
    return { ...base, bucket: "captures", text: `A capture was routed to its destination.` };
  if (e === "file.uploaded" || e === "file.staged")
    return { ...base, bucket: "captures", text: `New file saved.` };
  if (e === "file.extracted")
    return { ...base, bucket: "captures", text: `A file finished processing.` };
  if (e === "ingest.success")
    return { ...base, bucket: "captures", text: `New capture saved.` };

  // -- Needs attention ----------------------------------------------------
  if (e === "capture.needs_review")
    return { ...base, bucket: "attention", text: `A capture needs a quick look.` };
  if (e === "sherlock_finding_created" || e === "sherlock.suggested")
    return { ...base, bucket: "attention", text: `Vanta noticed something worth a quick look.` };
  if (e === "file.action_suggested")
    return { ...base, bucket: "attention", text: `A file has a suggested next step.` };
  if (e === "commitment.overdue")
    return { ...base, bucket: "attention", text: `A commitment went overdue.` };

  // -- Quiet cleanup ------------------------------------------------------
  if (e === "dismissed" || e === "sherlock_suggestion_dismissed")
    return { ...base, bucket: "cleanup", text: `Hidden from Command Center.` };
  if (e === "commitment.cancelled")
    return { ...base, bucket: "cleanup", text: `A commitment was closed out.` };
  if (e.startsWith("reminder.") && e.includes("skipped_quiet_hours"))
    return { ...base, bucket: "cleanup", text: `A reminder was held back for quiet hours.` };

  // Anything else: skip — never expose raw event names.
  return null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Pluralize a count + word, plain English. */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : pluralForm ?? singular + "s"}`;
}

/** Compose the top "Since you last checked" paragraph from bucketed counts. */
export function composeSinceLastChecked(input: {
  hasLastSeen: boolean;
  projectUpdatesByName: Record<string, number>;
  newCaptures: number;
  exportsSaved: number;
  needsAttention: number;
  cleanupHidden: number;
  cleanupGrouped: number;
}): string {
  const parts: string[] = [];

  const projEntries = Object.entries(input.projectUpdatesByName)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (projEntries.length === 1) {
    const [name, n] = projEntries[0];
    parts.push(`${name} had ${plural(n, "update")}`);
  } else if (projEntries.length > 1) {
    const top = projEntries.slice(0, 2).map(([name, n]) => `${name} (${n})`).join(" and ");
    parts.push(`project activity in ${top}`);
  }

  if (input.newCaptures > 0) parts.push(`${plural(input.newCaptures, "new capture")}`);
  if (input.exportsSaved > 0) parts.push(`${plural(input.exportsSaved, "export")} saved`);
  if (input.needsAttention > 0)
    parts.push(`${plural(input.needsAttention, "item")} waiting for review`);
  if (input.cleanupHidden > 0)
    parts.push(`${plural(input.cleanupHidden, "stale capture")} hidden`);
  if (input.cleanupGrouped > 0)
    parts.push(`${plural(input.cleanupGrouped, "similar capture")} grouped`);

  const lead = input.hasLastSeen ? "Since you last checked" : "Here's what changed recently";
  if (parts.length === 0) return `${lead}: nothing urgent right now. Recent activity is quiet.`;

  // Compose with serial commas, cap to ~3 clauses.
  const visible = parts.slice(0, 3);
  const overflow = parts.length - visible.length;
  let sentence = visible.join(", ");
  if (overflow > 0) sentence += `, and a few more`;
  return `${lead}: ${sentence}.`;
}
