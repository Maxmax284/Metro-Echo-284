// reminderMessage — one composer and one sender for promise reminders, shared
// by the scheduled sweep and the "send it now" control.
//
// Doctrine: a reminder is a notification. Its buttons acknowledge a promise;
// they never approve or execute anything.
import { sendTelegram } from "./telegramApi.ts";

export type TgInlineButton = { text: string; callback_data?: string; url?: string };
export type TgReplyMarkup = { inline_keyboard: TgInlineButton[][] };

// Openers vary so a daily reminder never reads like the same machine twice.
// Facts (summary, due time, timezone) are never rewritten — only the opener.
import { dueOpener as pickDue, overdueOpener as pickOverdue } from "./vantaIdentity.ts";

export function composeReminder(
  summary: string,
  overdue: boolean,
  dueAt: string | null,
  tz: string,
  opts: { noteTitle?: string | null; noteSnippet?: string | null; commitmentId?: string } = {},
): { text: string; reply_markup?: TgReplyMarkup } {
  const when = dueAt
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: tz, weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      }).format(new Date(dueAt))
    : "";
  const header = overdue ? `${pickOverdue()} ${summary}` : `${pickDue()} ${summary}`;
  const lines: string[] = [header];
  if (when) lines.push(overdue ? `Was due ${when} (${tz})` : `Due ${when} (${tz})`);
  const snippet = (opts.noteSnippet || "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (opts.noteTitle || snippet) {
    const noteLine = [opts.noteTitle, snippet].filter(Boolean).join(" — ");
    if (noteLine) lines.push(`Note: ${noteLine}`);
  }

  const inline_keyboard: TgInlineButton[][] = [];
  if (opts.commitmentId) {
    inline_keyboard.push([
      { text: "Mark done", callback_data: `done:${opts.commitmentId}` },
      { text: "Snooze 1h", callback_data: `snooze1h:${opts.commitmentId}` },
    ]);
    const publicUrl = Deno.env.get("VANTA_PUBLIC_URL");
    if (publicUrl) {
      inline_keyboard.push([{
        text: "Open in Metro Echo",
        url: `${publicUrl.replace(/\/$/, "")}/?commitment=${opts.commitmentId}`,
      }]);
    }
  }

  return {
    text: lines.join("\n"),
    reply_markup: inline_keyboard.length ? { inline_keyboard } : undefined,
  };
}

export async function sendTelegramReminder(
  admin: any,
  userId: string,
  chatId: number,
  text: string,
  reply_markup?: TgReplyMarkup,
  opts: { organizationId?: string | null; commitmentId?: string | null } = {},
): Promise<{ ok: boolean; err?: string }> {
  /* Single outbound path: the reminder lands on the Telegram thread with a receipt. */
  const res = await sendTelegram({
    admin,
    userId,
    chatId,
    text,
    replyMarkup: reply_markup,
    organizationId: opts.organizationId ?? null,
    kind: "reminder",
    entityType: "commitment",
    entityId: opts.commitmentId ?? null,
    auditEvent: "reminder.telegram_sent",
    auditFailedEvent: "reminder.telegram_failed",
  });
  return res.ok ? { ok: true } : { ok: false, err: res.reason ?? "send failed" };
}
