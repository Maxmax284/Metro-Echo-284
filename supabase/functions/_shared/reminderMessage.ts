// reminderMessage — one composer and one sender for promise reminders, shared
// by the scheduled sweep and the "send it now" control.
//
// Doctrine: a reminder is a notification. Its buttons acknowledge a promise;
// they never approve or execute anything.
const TG_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export type TgInlineButton = { text: string; callback_data?: string; url?: string };
export type TgReplyMarkup = { inline_keyboard: TgInlineButton[][] };

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
        text: "Open in Vanta",
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
  chatId: number,
  text: string,
  reply_markup?: TgReplyMarkup,
): Promise<{ ok: boolean; err?: string }> {
  try {
    const r = await fetch(`${TG_GATEWAY}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
        "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(reply_markup ? { reply_markup } : {}),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, err: JSON.stringify(j).slice(0, 200) };
    if (j && j.ok === false) return { ok: false, err: String(j.description ?? "telegram refused") };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : "send failed" };
  }
}
