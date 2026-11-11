import { corsHeaders } from "../_shared/http.ts";
// commitment-reminders: sweep due/overdue commitments, emit audit events,
// and (when opted in) deliver Telegram nudges. Designed for pg_cron.
//
// Doctrine: opt-in only. Respect quiet hours unless urgent. Dedupe by
// stamping metadata.telegram_sent_at on the commitment. Capture never
// executes — this only notifies.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { composeReminder, sendTelegramReminder } from "../_shared/reminderMessage.ts";
import { isInQuietHours } from "../_shared/drift.ts";
import { reachPhone } from "../_shared/delivery/reach.ts";



const TG_THROTTLE_MS = 6 * 60 * 60 * 1000;
const PUSH_THROTTLE_MS = 6 * 60 * 60 * 1000;

type Prefs = {
  telegram_reminders_enabled?: boolean;
  push_reminders_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
};

/* Quiet hours live in one place (_shared/drift.ts) so every sender agrees. */



type TgInlineButton = { text: string; callback_data?: string; url?: string };
type TgReplyMarkup = { inline_keyboard: TgInlineButton[][] };

/* Composer and sender live in _shared so the "send it now" control and this
   sweep can never drift apart. */
const composeTelegram = composeReminder;
const sendTelegram = sendTelegramReminder;


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date().toISOString();
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: due, error } = await supabase
      .from("commitments")
      .select("id, user_id, summary, due_at, remind_at, last_reminded_at, priority, metadata, source_note")
      .eq("status", "open")
      .or(`remind_at.lte.${now},and(due_at.lte.${in24h},remind_at.is.null)`)
      .limit(500);
    if (error) throw error;

    // Cache profile + chat + note lookups per sweep.
    const profiles = new Map<string, { tz: string; prefs: Prefs }>();
    const chatIds = new Map<string, number | null>();
    const notesCache = new Map<string, { title: string | null; body: string | null }>();

    let emitted = 0;
    let telegramSent = 0;
    let telegramSkipped = 0;
    let telegramFailed = 0;
    let telegramUnlinked = 0;
    let telegramDisabled = 0;
    let pushSent = 0;
    let pushSkipped = 0;

    for (const c of due ?? []) {
      const lastMs = c.last_reminded_at ? new Date(c.last_reminded_at).getTime() : 0;
      if (lastMs && Date.now() - lastMs < TG_THROTTLE_MS) continue;

      const overdue = !!(c.due_at && new Date(c.due_at).getTime() < Date.now());
      const event = overdue ? "commitment.overdue" : "commitment.due_soon";
      const audit = async (e: string, payload: Record<string, any>) => {
        await supabase.from("audit_log").insert({
          user_id: c.user_id,
          entity_type: "commitment",
          entity_id: c.id,
          event: e,
          payload,
        });
      };

      await audit(event, { summary: c.summary, due_at: c.due_at, priority: c.priority });
      emitted++;

      // Telegram delivery branch ---------------------------------------------
      let prof = profiles.get(c.user_id);
      if (!prof) {
        const { data: p } = await supabase
          .from("profiles")
          .select("timezone, preferences")
          .eq("id", c.user_id)
          .maybeSingle();
        prof = { tz: p?.timezone || "UTC", prefs: ((p?.preferences ?? {}) as Prefs) };
        profiles.set(c.user_id, prof);
      }

      if (prof.prefs.telegram_reminders_enabled) {
        const urgent = c.priority === "urgent";
        if (!urgent && isInQuietHours(prof.tz, prof.prefs.quiet_hours_start, prof.prefs.quiet_hours_end)) {
          telegramSkipped++;
          await audit("reminder.telegram_skipped_quiet_hours", { tz: prof.tz });
        } else {
          // Dedupe: skip if we sent within the throttle window already.
          const meta: any = c.metadata ?? {};
          const lastTgMs = meta.telegram_sent_at ? new Date(meta.telegram_sent_at).getTime() : 0;
          if (lastTgMs && Date.now() - lastTgMs < TG_THROTTLE_MS) {
            telegramSkipped++;
            await audit("reminder.telegram_skipped_throttled", {
              last_sent_at: meta.telegram_sent_at,
              throttle_ms: TG_THROTTLE_MS,
            });
          } else {
            let chatId = chatIds.get(c.user_id) ?? undefined;
            if (chatId === undefined) {
              const { data: link } = await supabase
                .from("telegram_chat_links")
                .select("chat_id")
                .eq("user_id", c.user_id)
                .maybeSingle();
              chatId = link?.chat_id ?? null;
              chatIds.set(c.user_id, chatId);
            }
            if (chatId) {
              let noteTitle: string | null = null;
              let noteBody: string | null = null;
              if (c.source_note) {
                let cached = notesCache.get(c.source_note);
                if (!cached) {
                  const { data: n } = await supabase
                    .from("notes")
                    .select("title, body")
                    .eq("id", c.source_note)
                    .maybeSingle();
                  cached = { title: n?.title ?? null, body: n?.body ?? null };
                  notesCache.set(c.source_note, cached);
                }
                noteTitle = cached.title;
                noteBody = cached.body;
              }
              const composed = composeTelegram(c.summary, overdue, c.due_at, prof.tz, {
                noteTitle, noteSnippet: noteBody, commitmentId: c.id,
              });
              const r = await sendTelegram(supabase, c.user_id, chatId, composed.text, composed.reply_markup, {
                organizationId: (c as { organization_id?: string | null }).organization_id ?? null,
                commitmentId: c.id,
              });
              if (r.ok) {
                telegramSent++;
                await supabase.from("commitments")
                  .update({ metadata: { ...meta, telegram_sent_at: new Date().toISOString() } })
                  .eq("id", c.id);
                await audit("reminder.telegram_sent", { chat_id: chatId, overdue });
              } else {
                telegramFailed++;
                await audit("reminder.telegram_failed", { error: r.err ?? "unknown" });
              }
            } else {
              // Opted in but never linked a chat. Trace it loudly so the UI
              // can surface a "link your Telegram" nudge instead of silence.
              telegramUnlinked++;
              await audit("reminder.telegram_skipped_unlinked", {
                reason: "no_telegram_chat_link",
                user_action: "link_telegram",
              });
            }
          }
        }
      } else {
        telegramDisabled++;
        await audit("reminder.telegram_skipped_disabled", { reason: "telegram_reminders_enabled=false" });
      }
      // ----------------------------------------------------------------------

      // Push delivery branch -------------------------------------------------
      /* One gate for every sender: reach.ts owns the floors, the quiet window,
         the channel toggle, and the receipts. This sweep only decides WHAT is
         due and how often it may speak — never whether it may reach. A hold is
         a receipt (nudge.held_by_settings), never silence. */
      const pushMeta: any = c.metadata ?? {};
      const lastPushMs = pushMeta.push_sent_at ? new Date(pushMeta.push_sent_at).getTime() : 0;
      if (lastPushMs && Date.now() - lastPushMs < PUSH_THROTTLE_MS) {
        pushSkipped++;
        await audit("reminder.push_skipped_throttled", {
          last_sent_at: pushMeta.push_sent_at,
          throttle_ms: PUSH_THROTTLE_MS,
        });
      } else {
        const title = overdue ? "Overdue" : "Heads up";
        const when = c.due_at
          ? new Intl.DateTimeFormat("en-US", {
              timeZone: prof.tz, weekday: "short", month: "short", day: "numeric",
              hour: "numeric", minute: "2-digit",
            }).format(new Date(c.due_at))
          : "";
        const body = overdue
          ? `${c.summary}${when ? ` — was due ${when}` : ""}`
          : `${c.summary}${when ? ` — due ${when}` : ""}`;
        const sentPush = await reachPhone(supabase, {
          userId: c.user_id,
          organizationId: (c as { organization_id?: string | null }).organization_id ?? null,
          title: `Echo · ${title}`,
          detail: body,
          url: `/?commitment=${c.id}`,
          changeKey: `commitment-${c.id}`,
          urgency: "time_sensitive",
          entityType: "commitment",
          entityId: c.id,
          category: "schedule",
          source: "commitment-reminders",
        });
        if (sentPush) {
          pushSent++;
          await supabase.from("commitments")
            .update({ metadata: { ...pushMeta, push_sent_at: new Date().toISOString() } })
            .eq("id", c.id);
        } else {
          pushSkipped++;
        }
      }
      // ----------------------------------------------------------------------

      await supabase.from("commitments").update({ last_reminded_at: now }).eq("id", c.id);
    }

    return new Response(
      JSON.stringify({
        swept: due?.length ?? 0,
        emitted,
        telegramSent, telegramSkipped, telegramFailed, telegramUnlinked, telegramDisabled,
        pushSent, pushSkipped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
