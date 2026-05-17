// awareness-brief: generate a structured VantaSignal for one section of a place.
// Stage 2 refactor — JSON-mode Gemini, Zod validation, safe fallback signal,
// persists both the structured signal and a short prose summary for back-compat.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  AWARENESS_VOICE,
  VantaSignalSchema,
  VANTA_SIGNAL_JSON_SCHEMA,
  fallbackSignal,
  type VantaSignal,
} from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SECTION_VALUES = [
  "transport", "infrastructure", "payments", "etiquette",
  "hazards", "scams", "connectivity", "timing",
] as const;

const Body = z.object({
  place_id: z.string().uuid(),
  section: z.enum(SECTION_VALUES),
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Section-specific operator framing — keeps Gemini grounded in what each
// section actually means without bloating the system prompt.
const SECTION_HINT: Record<typeof SECTION_VALUES[number], string> = {
  transport:     "How people actually move here — taxis/rideshare quirks, road conditions, transit reliability. Real operational notes, not tourist trivia.",
  infrastructure:"Power, water, internet, banking access, what works and what doesn't.",
  payments:      "What payment methods actually work — cash, cards, apps, FX gotchas.",
  etiquette:     "Local norms that affect operating here — what gets you in trouble, what's expected.",
  hazards:       "Concrete operational hazards — not generic warnings. Be honest if you don't have specifics.",
  scams:         "Known scam patterns in this place. Be specific or say you don't have detail.",
  connectivity:  "Mobile data, wifi, eSIM reality, dead zones.",
  timing:        "Time-of-day or seasonal patterns that affect operations — rush hour, siesta, monsoon, etc.",
};

function buildPrompt(section: string, place: { label: string; geo: unknown; country: string | null; region: string | null }) {
  const geo = place.geo as { lat?: number; lon?: number; acc?: number } | null;
  const geoStr = geo?.lat != null && geo?.lon != null
    ? `${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)}${geo.acc != null ? ` (±${Math.round(geo.acc)}m)` : ""}`
    : "unknown";
  return `Place: ${place.label}
Geo: ${geoStr}
Country: ${place.country ?? "unknown"}
Region: ${place.region ?? "unknown"}
Section: ${section}
Section focus: ${SECTION_HINT[section as keyof typeof SECTION_HINT] ?? section}

Return a single VantaSignal JSON object for this section. Rules:
- signal_type must be "${section}".
- short_summary is one or two plain-English sentences. No markdown, no bullets, no asterisks.
- If location data is weak (no country/region, or coordinates look offshore/imprecise), set confidence to "low", set requires_confirmation true, and explain in confirmation_reason. Do not invent local detail.
- source_labels should include "gemini" and "internal" at minimum. Add "memory" if you used prior briefings.
- available_routes: include "refresh_signal" and "ask_vanta" by default; add "send_to_sherlock" when the topic deserves investigation, "create_commitment" when a follow-up action is implied.
- why_it_matters: one sentence on operational impact.
- what_to_do_next: one concrete next step the user can take.
- long_detail: optional 2–4 sentence expansion. Still plain English, no markdown.`;
}

async function callGemini(apiKey: string, system: string, user: string): Promise<unknown> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "VantaSignal", strict: true, schema: VANTA_SIGNAL_JSON_SCHEMA },
      },
    }),
  });
  if (r.status === 429) throw Object.assign(new Error("rate limited"), { status: 429 });
  if (r.status === 402) throw Object.assign(new Error("credits exhausted"), { status: 402 });
  if (!r.ok) throw new Error(`ai gateway ${r.status}`);
  const j = await r.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  try { return JSON.parse(text); } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jsonResp({ error: "unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonResp({ error: parsed.error.flatten() }, 400);
    const { place_id, section } = parsed.data;

    const { data: place, error: pErr } = await supabase
      .from("awareness_places")
      .select("id,label,geo,country,region")
      .eq("id", place_id)
      .maybeSingle();
    if (pErr || !place) return jsonResp({ error: "place not found" }, 404);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Stage 3 — load active user corrections for this signal type. They
    // become evidence in the prompt + can force a confidence downgrade.
    const { data: corrections } = await supabase
      .from("corrections")
      .select("feedback_type, user_note, confidence_impact, created_at")
      .eq("surface", "awareness")
      .eq("target_type", `signal:${section}`)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6);

    const hasInvalidate = (corrections ?? []).some((c: any) => c.confidence_impact === "invalidate");
    const correctionBlock = (corrections ?? []).length
      ? `\n\nUser corrections on past "${section}" signals (treat as authoritative ground truth, respect them):\n` +
        (corrections ?? []).map((c: any) =>
          `- [${c.feedback_type}] ${c.user_note ?? "(no note)"} — said ${new Date(c.created_at).toISOString().slice(0,10)}`
        ).join("\n")
      : "";

    let signal: VantaSignal;
    let usedFallback = false;
    try {
      const raw = await callGemini(LOVABLE_API_KEY, AWARENESS_VOICE, buildPrompt(section, place) + correctionBlock);
      const validated = VantaSignalSchema.safeParse(raw);
      if (validated.success && validated.data.signal_type === section) {
        signal = validated.data;
      } else {
        usedFallback = true;
        signal = fallbackSignal({
          signal_type: section,
          title: `${section[0].toUpperCase()}${section.slice(1)} — couldn't structure`,
          source_labels: ["internal", "gemini"],
          reason: "Gemini returned output that didn't match the signal schema.",
        });
      }
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 429) return jsonResp({ error: "rate limited" }, 429);
      if (status === 402) return jsonResp({ error: "credits exhausted" }, 402);
      usedFallback = true;
      signal = fallbackSignal({
        signal_type: section,
        title: `${section[0].toUpperCase()}${section.slice(1)} — signal unavailable`,
        source_labels: ["internal"],
        reason: "The AI gateway didn't respond cleanly. Cached and internal context preserved.",
      });
    }

    // Deterministic: if the user has invalidated this signal type, force low
    // confidence and surface the conflict — never silently override the user.
    if (hasInvalidate) {
      signal = {
        ...signal,
        confidence: "low",
        requires_confirmation: true,
        confirmation_reason: signal.confirmation_reason
          || "You previously flagged this kind of signal as wrong. Verify before relying on it.",
        source_labels: Array.from(new Set([...(signal.source_labels ?? []), "memory"])),
      };
    }

    // Persist: keep `content` populated (short_summary) for back-compat with
    // existing UI; store full structured signal in the new `signal` column.
    const { error: insErr } = await supabase.from("awareness_briefings").insert({
      user_id: user.id,
      place_id,
      section,
      content: signal.short_summary,
      confidence: signal.confidence,
      sources: signal.source_labels,
      signal,
    });
    if (insErr) throw insErr;

    return jsonResp({ ok: true, signal, used_fallback: usedFallback });
  } catch (e) {
    return jsonResp({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
