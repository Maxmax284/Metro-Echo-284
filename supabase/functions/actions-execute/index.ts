// actions-execute: dispatch an approved action via a configured executor (webhook or telegram).
// Transitions: approved -> executed (on success) and writes audit_log with result.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  action_id: z.string().uuid(),
  executor_id: z.string().uuid().optional(),
});

async function runWebhook(config: any, action: any) {
  const url = config?.url;
  if (!url || typeof url !== "string") throw new Error("webhook executor missing config.url");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config?.headers && typeof config.headers === "object") {
    for (const [k, v] of Object.entries(config.headers)) headers[k] = String(v);
  }
  const res = await fetch(url, {
    method: config?.method ?? "POST",
    headers,
    body: JSON.stringify({
      action_id: action.id,
      title: action.title,
      description: action.description,
      payload: action.payload,
      risk: action.risk,
    }),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`webhook ${res.status}: ${text.slice(0, 300)}`);
  return { status: res.status, body: text.slice(0, 1000) };
}

async function runEmail(config: any, action: any) {
  // config: { to: string|string[], from?: string, subject?: string, html?: string, text?: string }
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey || !resendKey) throw new Error("email executor requires Resend connector (RESEND_API_KEY) — link Resend in Connectors");
  const to = Array.isArray(config?.to) ? config.to : (config?.to ? [String(config.to)] : null);
  if (!to || to.length === 0) throw new Error("email executor missing config.to");
  const from = config?.from ?? "Vanta <onboarding@resend.dev>";
  const subject = config?.subject ?? action.title ?? "Vanta action";
  const html = config?.html ?? `<p>${(action.description ?? action.title ?? "").replace(/</g, "&lt;")}</p>`;
  const text = config?.text;
  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": resendKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { provider: "resend", id: data?.id, to };
}

async function runGoogleCalendar(config: any, action: any) {
  // config: { calendar_id?, timeZone?, start_field?, end_field?, default_duration_minutes?,
  //           summary_template?, description_template?, attendees? }
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const calKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  if (!apiKey || !calKey) throw new Error("calendar executor requires Google Calendar connector — link Google Calendar in Connectors");
  const payload = action.payload ?? {};
  const pick = (path?: string) => {
    if (!path) return undefined;
    return path.split(".").reduce((acc: any, key) => (acc == null ? acc : acc[key]), payload);
  };
  const startField = config?.start_field ?? "start";
  const endField = config?.end_field ?? "end";
  let start = config?.start ?? pick(startField) ?? payload.start;
  let end = config?.end ?? pick(endField) ?? payload.end;
  if (start && !end && Number.isFinite(config?.default_duration_minutes)) {
    end = new Date(new Date(start).getTime() + Number(config.default_duration_minutes) * 60_000).toISOString();
  }
  if (!start || !end) throw new Error(`calendar executor needs start and end (looked at config + payload.${startField}/${endField})`);
  const calendarId = encodeURIComponent(config?.calendar_id ?? "primary");
  const tz = config?.timeZone ?? payload.timeZone ?? "UTC";
  const fill = (tpl?: string, fallback?: string) =>
    typeof tpl === "string" && tpl
      ? tpl.replace(/\{\{\s*(title|description)\s*\}\}/g, (_, k) => String((action as any)[k] ?? ""))
      : fallback;
  const event: Record<string, unknown> = {
    summary: fill(config?.summary_template, action.title ?? "Vanta event"),
    description: fill(config?.description_template, action.description ?? undefined),
    location: config?.location ?? payload.location ?? undefined,
    start: { dateTime: start, timeZone: tz },
    end: { dateTime: end, timeZone: tz },
  };
  const attendees = config?.attendees ?? payload.attendees;
  if (Array.isArray(attendees) && attendees.length) {
    event.attendees = attendees.map((email: string) => ({ email }));
  }
  const res = await fetch(`https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars/${calendarId}/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": calKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`google_calendar ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { provider: "google_calendar", event_id: data?.id, html_link: data?.htmlLink, calendar_id: config?.calendar_id ?? "primary" };
}

async function runTelegram(config: any, action: any) {
  const chat_id = config?.chat_id;
  if (!chat_id) throw new Error("telegram executor missing config.chat_id");
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const tgKey = Deno.env.get("TELEGRAM_API_KEY");
  if (!apiKey || !tgKey) throw new Error("telegram credentials missing");
  const text = `<b>${action.title}</b>${action.description ? `\n${action.description}` : ""}`;
  const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": tgKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`telegram ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return { message_id: data?.result?.message_id };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const __authHeader = req.headers.get("Authorization") ?? "";

    const __token = __authHeader.replace("Bearer ", "");

    const { data: __claimsData } = await supabase.auth.getClaims(__token);

    const user = __claimsData?.claims?.sub ? { id: __claimsData.claims.sub as string } : null;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { action_id, executor_id } = parsed.data;

    const { data: action, error: aErr } = await supabase.from("actions").select("*").eq("id", action_id).maybeSingle();
    if (aErr || !action) return new Response(JSON.stringify({ error: "action not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (action.status !== "approved") {
      return new Response(JSON.stringify({ error: `action must be approved (is ${action.status})` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const targetId = executor_id ?? action.payload?.executor_id;
    if (!targetId) return new Response(JSON.stringify({ error: "no executor specified" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: executor, error: eErr } = await supabase.from("action_executors").select("*").eq("id", targetId).maybeSingle();
    if (eErr || !executor || !executor.enabled) {
      return new Response(JSON.stringify({ error: "executor not found or disabled" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let result: any;
    try {
      if (executor.kind === "webhook") result = await runWebhook(executor.config, action);
      else if (executor.kind === "telegram") result = await runTelegram(executor.config, action);
      else if (executor.kind === "email") result = await runEmail(executor.config, action);
      else if (executor.kind === "google_calendar" || executor.kind === "calendar") result = await runGoogleCalendar(executor.config, action);
      else throw new Error(`unknown executor kind: ${executor.kind}`);
    } catch (execErr) {
      const msg = execErr instanceof Error ? execErr.message : "executor failed";
      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: "action",
        entity_id: action_id,
        event: "execute.failed",
        payload: { executor_id: executor.id, kind: executor.kind, error: msg },
      });
      return new Response(JSON.stringify({ error: msg }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rollback_available = executor.kind === "telegram" && !!result?.message_id;
    await supabase.from("actions").update({
      status: "executed",
      result,
      executed_at: new Date().toISOString(),
      rollback_available,
      rollback_token: rollback_available ? String(result?.message_id ?? "") : null,
    }).eq("id", action_id);
    await supabase.from("action_events").insert({
      user_id: user.id, action_id, from_status: "approved", to_status: "executed", actor: "executor",
      reason: `${executor.kind}:${executor.name}`,
    });
    await supabase.from("audit_log").insert({
      user_id: user.id, entity_type: "action", entity_id: action_id,
      event: "execute.success",
      payload: { executor_id: executor.id, kind: executor.kind, result },
    });

    return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
