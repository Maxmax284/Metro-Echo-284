// commitment-reminders: sweep due/overdue commitments, emit audit events,
// and (when opted in) deliver Telegram nudges. Designed for pg_cron.
//
// Doctrine: opt-in only. Respect quiet hours unless urgent. Dedupe by
// stamping metadata.telegram_sent_at on the commitment. Capture never
// executes — this only notifies.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendWebPush } from "../_shared/webpush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TG_GATEWAY = "https://connector-gateway.lovable.dev/telegram";
const TG_THROTTLE_MS = 6 * 60 * 60 * 1000;
const PUSH_THROTTLE_MS = 6 * 60 * 60 * 1000;

type Prefs = {
  telegram_reminders_enabled?: boolean;
  push_reminders_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
};

function isInQuietHours(tz: string, start = "22:00", end = "07:00"): boolean {
  try {
    const now = new Date();
    const hhmm = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now); // "HH:MM"
    const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
    const nowMin = h * 60 + m;
    const [sh, sm] = start.split(":").map((x) => parseInt(x, 10));
    const [eh, em] = end.split(":").map((x) => parseInt(x, 10));
    const sMin = sh * 60 + sm;
    const eMin = eh * 60 + em;
    if (sMin === eMin) return false;
    if (sMin < eMin) return nowMin >= sMin && nowMin < eMin;
    // wraps midnight
    return nowMin >= sMin || nowMin < eMin;
  } catch { return false; }
}

function composeTelegram(summary: string, overdue: boolean, dueAt: string | null, tz: string): string {
  const when = dueAt ? new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(dueAt)) : "";
  if (overdue) return `⏰ Overdue: ${summary}${when ? ` (was due ${when} ${tz})` : ""}`;
  return `Heads up: ${summary}${when ? ` — due ${when} ${tz}` : ""}`;
}

async function sendTelegram(chatId: number, text: string): Promise<{ ok: boolean; err?: string }> {
  try {
    const r = await fetch(`${TG_GATEWAY}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY") ?? ""}`,
        "X-Connection-Api-Key": Deno.env.get("TELEGRAM_API_KEY") ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, err: JSON.stringify(j).slice(0, 200) };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: e instanceof Error ? e.message : "send failed" };
  }
}

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
      .select("id, user_id, summary, due_at, remind_at, last_reminded_at, priority, metadata")
      .eq("status", "open")
      .or(`remind_at.lte.${now},and(due_at.lte.${in24h},remind_at.is.null)`)
      .limit(500);
    if (error) throw error;

    // Cache profile + chat lookups per user across the sweep.
    const profiles = new Map<string, { tz: string; prefs: Prefs }>();
    const chatIds = new Map<string, number | null>();

    let emitted = 0;
    let telegramSent = 0;
    let telegramSkipped = 0;
    let telegramFailed = 0;
    let pushSent = 0;
    let pushSkipped = 0;
    let pushFailed = 0;

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
    const pushConfigured = !!(vapidPublic && vapidPrivate && vapidSubject);

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
              const text = composeTelegram(c.summary, overdue, c.due_at, prof.tz);
              const r = await sendTelegram(chatId, text);
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
            }
          }
        }
      }
      // ----------------------------------------------------------------------

      // Push delivery branch -------------------------------------------------
      if (pushConfigured && prof.prefs.push_reminders_enabled) {
        const urgent = c.priority === "urgent";
        if (!urgent && isInQuietHours(prof.tz, prof.prefs.quiet_hours_start, prof.prefs.quiet_hours_end)) {
          pushSkipped++;
          await audit("reminder.push_skipped_quiet_hours", { tz: prof.tz });
        } else {
          const meta: any = c.metadata ?? {};
          const lastPushMs = meta.push_sent_at ? new Date(meta.push_sent_at).getTime() : 0;
          if (lastPushMs && Date.now() - lastPushMs < PUSH_THROTTLE_MS) {
            pushSkipped++;
          } else {
            const { data: subs } = await supabase
              .from("push_subscriptions")
              .select("id, endpoint, p256dh, auth")
              .eq("user_id", c.user_id);
            if (subs && subs.length > 0) {
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
              const payload = {
                title: `Vanta · ${title}`,
                body,
                tag: `commitment-${c.id}`,
                url: `/?commitment=${c.id}`,
                data: { commitment_id: c.id, overdue },
              };
              let anySent = false;
              for (const s of subs) {
                const r = await sendWebPush(
                  { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
                  payload,
                  { vapidPublicKey: vapidPublic, vapidPrivateKey: vapidPrivate, vapidSubject },
                );
                if (r.ok) {
                  anySent = true;
                  await supabase.from("push_subscriptions")
                    .update({ last_used_at: new Date().toISOString(), failure_count: 0, last_error: null })
                    .eq("id", s.id);
                } else if (r.shouldDelete) {
                  await supabase.from("push_subscriptions").delete().eq("id", s.id);
                  await audit("push.subscription_expired", { status: r.status });
                } else {
                  await supabase.from("push_subscriptions")
                    .update({ last_error: r.error ?? `status ${r.status}`, failure_count: (s as any).failure_count ? (s as any).failure_count + 1 : 1 })
                    .eq("id", s.id);
                }
              }
              if (anySent) {
                pushSent++;
                await supabase.from("commitments")
                  .update({ metadata: { ...meta, push_sent_at: new Date().toISOString() } })
                  .eq("id", c.id);
                await audit("reminder.push_sent", { overdue, sub_count: subs.length });
              } else {
                pushFailed++;
                await audit("reminder.push_failed", { sub_count: subs.length });
              }
            }
          }
        }
      }
      // ----------------------------------------------------------------------

      await supabase.from("commitments").update({ last_reminded_at: now }).eq("id", c.id);
    }

    return new Response(
      JSON.stringify({
        swept: due?.length ?? 0,
        emitted,
        telegramSent, telegramSkipped, telegramFailed,
        pushSent, pushSkipped, pushFailed,
        pushConfigured,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
