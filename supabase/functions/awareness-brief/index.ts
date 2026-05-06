// awareness-brief: generate a structured operational briefing for one section of a place.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  place_id: z.string().uuid(),
  section: z.enum(["transport", "infrastructure", "payments", "etiquette", "hazards", "scams", "connectivity", "timing"]),
});

const SYS = `You are an operational awareness analyst. Provide grounded, practical briefings about a place.
Be honest about uncertainty. Avoid tourist trivia. Focus on real operational realities.
Never present speculation as fact. Keep it under 180 words. End with a single line: "confidence: low|medium|high".`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { place_id, section } = parsed.data;

    const { data: place, error: pErr } = await supabase.from("awareness_places").select("*").eq("id", place_id).maybeSingle();
    if (pErr || !place) return new Response(JSON.stringify({ error: "place not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ctx = `Place label: ${place.label}\nGeo: ${JSON.stringify(place.geo)}\nCountry: ${place.country ?? "unknown"}\nRegion: ${place.region ?? "unknown"}\nSection requested: ${section}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: ctx },
        ],
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) throw new Error("AI gateway error");
    const j = await r.json();
    const text = (j.choices?.[0]?.message?.content ?? "").trim();
    const conf = (text.match(/confidence:\s*(low|medium|high)/i)?.[1] ?? "medium").toLowerCase();
    const content = text.replace(/confidence:\s*(low|medium|high)\s*$/i, "").trim();

    const { error: insErr } = await supabase.from("awareness_briefings").insert({
      user_id: user.id,
      place_id,
      section,
      content,
      confidence: conf,
    });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, confidence: conf }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
