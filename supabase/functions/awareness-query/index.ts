import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// awareness-query: answer a free-form location/place question grounded in the
// user's most recent awareness_place plus any recent briefings. Returns text +
// confidence + sources. Phase C of Sherlock & Core Gap Closure.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { AWARENESS_VOICE } from "../_shared/vantaVoice.ts";


const Body = z.object({
  question: z.string().min(1).max(2000),
  section: z.string().optional(),
});

const SYS = `${AWARENESS_VOICE}

You are answering one short, practical place-based question. Cite specifics from the provided place context where relevant.
If you do not actually know, say so plainly. Never invent specific addresses, prices, or times.
Hard cap: 140 words. Final line must be: confidence: low|medium|high`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _user_id: user.id, _bucket: "awareness-query", _limit: 20, _window_seconds: 60,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { question, section } = parsed.data;

    // Pull the user's live place + last few briefings as grounding.
    // Mirror of LIVE_FIX_SOURCES in src/lib/placeMove.ts — the exact list the
    // app's own active-place read accepts. A named/saved place is never the
    // live ground: editing one bumps updated_at, and ordering by that alone
    // teleported every answer to a place the user had left.
    // A stamped row outranks a newer unstamped fix — the stamp is the user's
    // deliberate "this is my ground", and a real move lifts it (placeMove).
    const { data: place } = await supabase
      .from("awareness_places")
      .select("id,label,country,region,geo,stamped_at")
      .filter("geo->>source", "in", '("device","map_picker","manual_search","nearby_suggestion","manual_fix")')
      .order("stamped_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: briefings } = place?.id
      ? await supabase
          .from("awareness_briefings")
          .select("section,content,confidence,generated_at")
          .eq("place_id", place.id)
          .order("generated_at", { ascending: false })
          .limit(6)
      : { data: [] as any[] };

    const placeCtx = place
      ? `Active place: ${place.label} (${place.country ?? "?"}/${place.region ?? "?"}).`
      : "No active place set. Be explicit that the user has not configured one.";
    const briefCtx = (briefings ?? []).length
      ? "\nRecent briefings:\n" + (briefings as any[])
          .map((b) => `- [${b.section}] ${String(b.content).slice(0, 240)}`).join("\n")
      : "";

    const userPrompt = `${placeCtx}${briefCtx}\n\nQuestion${section ? ` (section hint: ${section})` : ""}: ${question}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`AI gateway: ${r.status} ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    const raw = String(j.choices?.[0]?.message?.content ?? "").trim();
    const conf = (raw.match(/confidence:\s*(low|medium|high)/i)?.[1] ?? "medium").toLowerCase();
    const answer = raw.replace(/confidence:\s*(low|medium|high)\s*$/i, "").trim();

    const sources = (briefings ?? []).map((b: any) => ({
      kind: "briefing", section: b.section, generated_at: b.generated_at,
    }));

    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "awareness",
      entity_id: place?.id ?? null,
      event: "awareness.query",
      payload: { question, section: section ?? null, confidence: conf, place_label: place?.label ?? null },
    });

    return new Response(JSON.stringify({
      answer,
      confidence: conf,
      place: place ? { id: place.id, label: place.label } : null,
      sources,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
