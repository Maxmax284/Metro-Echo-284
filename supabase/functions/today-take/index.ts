// today-take — Echo's plain-English read of today's grounded briefing.
// Input is the deterministic briefing only; the model never sees raw rows.
// Rate-limited per user from the audit log: 4 per hour, 12 per day.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { streamAstraText } from "../_shared/aiResponses.ts";

const Body = z.object({
  place: z.string().max(80).nullable(),
  overdue: z.number().int().min(0).max(999),
  waiting: z.number().int().min(0).max(999),
  dueToday: z.number().int().min(0).max(999),
  situations: z.array(z.object({ label: z.string().max(120), count: z.number().int().min(1).max(9999) })).max(12),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const user = await resolveUser(req, client as any);
    if (!user) return json({ error: "Sign in first." }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const [{ count: hour }, { count: day }] = await Promise.all([
      client.from("audit_log").select("id", { count: "exact", head: true }).eq("event", "today_take.composed").gte("created_at", hourAgo),
      client.from("audit_log").select("id", { count: "exact", head: true }).eq("event", "today_take.composed").gte("created_at", dayAgo),
    ]);
    if ((hour ?? 0) >= 4 || (day ?? 0) >= 12) {
      return json({ error: "Echo's take is resting — it refreshes on its own later.", limited: true }, 429);
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "Echo's take isn't set up yet." }, 500);
    const b = parsed.data;
    const facts = [
      b.place ? `Place: ${b.place}` : null,
      `Overdue promises: ${b.overdue}`,
      `Waiting on approval: ${b.waiting}`,
      `Promises due today: ${b.dueToday}`,
      b.situations.length
        ? `What moved today:\n${b.situations.map((s) => `- ${s.label}${s.count > 1 ? ` (${s.count}x)` : ""}`).join("\n")}`
        : "Nothing meaningful moved today.",
    ].filter(Boolean).join("\n");

    const { text } = await streamAstraText({
      apiKey: key,
      incomingRunId: req.headers.get("X-Lovable-AIG-Run-ID") ?? undefined,
      messages: [
        {
          role: "system",
          content:
            "You are Echo, a calm companion. Write a 1-2 sentence read of the user's day, East Coast calm-professional: direct, warm, a little dry. Plain English, under 40 words. Use only the facts given, never invent. No exclamation marks, no jargon, no system words (sync, event, pipeline). If nothing needs them, say so plainly.",
        },
        { role: "user", content: facts },
      ],
    });

    await client.from("audit_log").insert({
      user_id: user.id, event: "today_take.composed", entity_type: "today", payload: { situations: b.situations.length },
    } as any);
    return json({ take: text || "Your day is steady. Nothing needs you right now." });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return json({ error: e instanceof Error ? e.message : "Echo couldn't read the day." }, status);
  }
});
