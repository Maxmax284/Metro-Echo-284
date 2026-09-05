// telegramReplies — the one place that builds Telegram deep links and the
// small, fixed button vocabulary Echo is allowed to show in a chat.
//
// Doctrine: a button in Telegram either acknowledges something (Noted, Mark
// done, Snooze), files something where it belongs (File under <project>), or
// opens Echo. No button approves or executes.

export type TgInlineButton = { text: string; callback_data?: string; url?: string };
export type TgReplyMarkup = { inline_keyboard: TgInlineButton[][] };

/** Every object kind Telegram can point back at. Mirrors SurfaceId in src/lib/navigation.ts. */
export type VantaLinkKind =
  | "today"
  | "work"
  | "ask"
  | "receipts"
  | "inbox"
  | "memory"
  | "projects"
  | "commitments"
  | "actions"
  | "briefs"
  | "schedule"
  | "sherlock"
  | "awareness";

declare const Deno: { env: { get(key: string): string | undefined } } | undefined;

export function publicBase(): string {
  const env = typeof Deno !== "undefined" ? Deno?.env.get("VANTA_PUBLIC_URL") : undefined;
  return (env ?? "").replace(/\/$/, "");
}

/**
 * Build a link into the exact place in Metro Echo. `commitment` gets its own focus
 * param because the shell already knows how to open and highlight one.
 */
export function vantaLink(
  kind: VantaLinkKind,
  opts: { commitmentId?: string; tripId?: string; base?: string } = {},
): string | null {
  const base = opts.base !== undefined ? opts.base.replace(/\/$/, "") : publicBase();
  if (!base) return null;
  if (opts.commitmentId) return `${base}/?commitment=${opts.commitmentId}`;
  /* A walk opened from a chat has to open the SAME session in the app, so the
     session id rides along in the link instead of the person hunting for it. */
  if (opts.tripId) return `${base}/?surface=${kind}&trip=${opts.tripId}`;
  return `${base}/?surface=${kind}`;
}

const OPEN_LABEL: Partial<Record<VantaLinkKind, string>> = {
  inbox: "Open Inbox",
  memory: "Open Inbox",
  commitments: "Open Commitments",
  actions: "Open Actions",
  projects: "Open project",
  briefs: "Open draft",
  receipts: "Open Receipts",
  sherlock: "Open what Echo noticed",
  schedule: "Open Schedule",
  today: "Open Metro Echo",
  awareness: "Open the Aware room",
  work: "Open Work",
  ask: "Open Ask",
};

/** "Open in Metro Echo" style button, or null when no public URL is configured. */
export function openButton(kind: VantaLinkKind, opts: { commitmentId?: string; tripId?: string; label?: string; base?: string } = {}): TgInlineButton | null {
  const url = vantaLink(kind, opts);
  if (!url) return null;
  return { text: opts.label ?? OPEN_LABEL[kind] ?? "Open in Metro Echo", url };
}

/** Acknowledge a nudge or finding — marks it seen, nothing else. */
export function notedButton(nudgeId: string): TgInlineButton {
  return { text: "Noted", callback_data: `noted:${nudgeId}` };
}

export function markDoneButton(commitmentId: string): TgInlineButton {
  return { text: "Mark done", callback_data: `done:${commitmentId}` };
}

export const SNOOZE_PRESETS: { minutes: number; label: string; key: string }[] = [
  { minutes: 60, label: "Snooze 1h", key: "snooze1h" },
  { minutes: 60 * 3, label: "Snooze 3h", key: "snooze3h" },
  { minutes: 60 * 24, label: "Tomorrow", key: "snooze1d" },
];

export function snoozeMinutesFor(key: string): number | null {
  return SNOOZE_PRESETS.find((p) => p.key === key)?.minutes ?? null;
}

export function snoozeButtons(commitmentId: string): TgInlineButton[] {
  return SNOOZE_PRESETS.map((p) => ({ text: p.label, callback_data: `${p.key}:${commitmentId}` }));
}

/** "File under <project>" — a reversible link between a capture and a project. */
export function fileUnderButton(projectId: string, projectTitle: string, itemType: string, itemId: string): TgInlineButton {
  const label = projectTitle.length > 22 ? `${projectTitle.slice(0, 21)}…` : projectTitle;
  return { text: `File under ${label}`, callback_data: `file:${projectId}:${itemType}:${itemId}` };
}

/** Assemble rows, dropping anything that couldn't be built (no public URL). */
export function keyboard(...rows: (TgInlineButton | null)[][]): TgReplyMarkup | undefined {
  const cleaned = rows
    .map((row) => row.filter((b): b is TgInlineButton => !!b))
    .filter((row) => row.length > 0);
  return cleaned.length ? { inline_keyboard: cleaned } : undefined;
}
