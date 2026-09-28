import { resolveUser } from "../_shared/authContext.ts";
import { corsHeaders } from "../_shared/http.ts";
import { writeAuditEvent } from "../_shared/auditEvent.ts";
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

// Per-section keyword vocab for slicing snapshot evidence. Items get scored on
// title+snippet; section-relevant ones bubble to the top. Empty score keeps
// original snapshot order as fallback.
const SECTION_KEYWORDS: Record<typeof SECTION_VALUES[number], string[]> = {
  transport:      ["taxi","grab","bolt","uber","tuk","tuktuk","songthaew","baht bus","scooter","moto","motorbike","bike","rental","road","traffic","ferry","longtail","bus","bts","mrt","arl","train","airport","transfer","ride","skytrain","metro"],
  infrastructure: ["power","outage","electric","water","plumbing","internet","wifi","fiber","bank","atm","hospital","clinic","pharmacy","7-eleven","7eleven","family mart","construction","blackout","brownout"],
  payments:       ["atm","cash","card","visa","mastercard","promptpay","truemoney","rabbit","qr","fx","exchange","baht","thb","currency","fee","wise","revolut","stripe","payment","tip","service charge"],
  etiquette:      ["temple","wat","dress","shoes","monk","respect","custom","greeting","wai","tip","gesture","photo","modest","religion","sabai","mai pen rai"],
  hazards:        ["scam","theft","robbery","accident","injury","dengue","snake","jellyfish","rip current","flood","storm","fire","assault","unsafe","warning","stray dog","food poisoning"],
  scams:          ["scam","overcharge","fake","rigged","tout","fraud","fake police","gem","tailor","jet ski","grab scam","meter","closed temple","ping pong"],
  connectivity:   ["sim","esim","ais","dtac","truemove","true 5g","5g","4g","lte","wifi","coverage","dead zone","mbps","signal","network"],
  timing:         ["rush hour","monsoon","rainy","dry season","holiday","songkran","loy krathong","vegetarian festival","festival","closed","opening","siesta","peak","low season","high season"],
};

function scoreItem(text: string, keywords: string[]): number {
  const t = text.toLowerCase();
  let score = 0;
  for (const k of keywords) if (t.includes(k)) score += k.length > 6 ? 2 : 1;
  return score;
}

type SliceMode = "matched" | "thin" | "none";
type SliceResult<T> = { items: T[]; mode: SliceMode; matched_count: number; total: number };

function sliceForSection<T extends { title?: string; snippet?: string; subreddit?: string }>(
  items: T[],
  section: typeof SECTION_VALUES[number],
  limit = 5,
): SliceResult<T> {
  if (!items.length) return { items: [], mode: "none", matched_count: 0, total: 0 };
  const kws = SECTION_KEYWORDS[section] ?? [];
  const scored = items.map((it, i) => ({
    it,
    i,
    score: scoreItem(`${it.title ?? ""} ${it.snippet ?? ""} ${(it as any).subreddit ?? ""}`, kws),
  }));
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  // Strong match: send only matched items, no padding.
  if (matched.length >= 2) {
    return { items: matched.slice(0, limit).map((s) => s.it), mode: "matched", matched_count: matched.length, total: items.length };
  }
  // Thin match: send the single matched item only — do NOT pad with off-topic
  // filler. Empty is better than misleading.
  if (matched.length === 1) {
    return { items: [matched[0].it], mode: "thin", matched_count: 1, total: items.length };
  }
  // No match: return nothing. Prompt will tell the model to lean on tier
  // context + weather instead of fabricating from unrelated chatter.
  return { items: [], mode: "none", matched_count: 0, total: items.length };
}

// Server-side mirror of classifyTier (kept tiny, no shared module yet).
type Tier = "exact" | "saved" | "area" | "city" | "country" | "unknown";
function classifyTierServer(p: { label?: string; geo: any; country: string | null; region: string | null }): Tier {
  const geo = (p.geo ?? {}) as any;
  const city = geo?.city ?? null;
  const acc = Number.isFinite(geo?.acc) ? Number(geo.acc) : null;
  if (!p.country) return "unknown";
  if (!city && !p.region) return "country";
  if (!city) return "city";
  if (acc !== null && acc <= 150) return "exact";
  if (!acc && p.label) return "saved";
  return "area";
}

type Evidence = {
  tier: Tier;
  scope: string;
  place: { label: string; country: string | null; region: string | null; city: string | null };
  geo: { lat: number | null; lon: number | null; acc_m: number | null };
  weather: any;
  local_signals: any[];
  community: any[];
  snapshot_summary: string | null;
  sources_available: string[];
  source_states: Record<string, "used" | "cached" | "off" | "not_called" | "failed">;
  snapshot_age_min: number | null;
};

function buildPrompt(section: typeof SECTION_VALUES[number], ev: Evidence) {
  const geoStr = ev.geo.lat != null && ev.geo.lon != null
    ? `${ev.geo.lat.toFixed(4)}, ${ev.geo.lon.toFixed(4)}${ev.geo.acc_m != null ? ` (±${Math.round(ev.geo.acc_m)}m)` : ""}`
    : "unknown";
  const weatherStr = ev.weather
    ? `${ev.weather.tempC ?? "?"}°C ${ev.weather.condition ?? ""}`.trim()
    : "(none collected)";
  // Section-aware slicing — payments card no longer sees transport chatter, etc.
  const localSlice = sliceForSection(ev.local_signals as any[], section);
  const communitySlice = sliceForSection(ev.community as any[], section);
  const fmtMode = (s: SliceResult<any>, kind: string) => {
    if (s.mode === "none" && s.total === 0) return `(no ${kind} in this snapshot)`;
    if (s.mode === "none") return `(snapshot has ${s.total} ${kind} item${s.total === 1 ? "" : "s"}, but none match "${section}" — ignore this source for this card)`;
    if (s.mode === "thin") return `(only 1 ${kind} item loosely matches "${section}" — treat as weak signal)`;
    return `(${s.matched_count} of ${s.total} ${kind} items match "${section}")`;
  };
  const localStr = localSlice.items.length
    ? `${fmtMode(localSlice, "local")}\n` + localSlice.items.map((s: any) => `- ${s.title}${s.snippet ? `: ${s.snippet}` : ""}`).join("\n")
    : fmtMode(localSlice, "local");
  const communityStr = communitySlice.items.length
    ? `${fmtMode(communitySlice, "community")}\n` + communitySlice.items.map((c: any) => `- r/${c.subreddit ?? "?"}: ${c.title}${c.snippet ? ` — ${c.snippet}` : ""}`).join("\n")
    : fmtMode(communitySlice, "community");
  const stateStr = Object.entries(ev.source_states).map(([k, v]) => `${k}=${v}`).join(", ");

  return `You are summarizing real evidence. Do not invent facts. If a source is missing, say so honestly.

LOCATION TIER: ${ev.tier} (scope: "${ev.scope}")
Place: ${ev.place.label}
Country: ${ev.place.country ?? "unknown"} | Region: ${ev.place.region ?? "unknown"} | City: ${ev.place.city ?? "unknown"}
Geo: ${geoStr}
Snapshot age: ${ev.snapshot_age_min == null ? "no snapshot yet" : `${ev.snapshot_age_min} min`}
Source states: ${stateStr || "(none)"}

EVIDENCE BUNDLE — section "${section}":
Section focus: ${SECTION_HINT[section as keyof typeof SECTION_HINT] ?? section}

Weather: ${weatherStr}

Local web/Places results:
${localStr}

Community chatter (Reddit — unverified, treat as street-signal not truth):
${communityStr}

Prior snapshot summary: ${ev.snapshot_summary ? ev.snapshot_summary.slice(0, 600) : "(none)"}

RULES:
- Use ONLY the evidence above. Never claim a source was checked unless it appears here.
- If tier is "country" or "city" (not exact), say you're using broader area context and explain the limit in one short clause.
- If tier is "unknown", set requires_confirmation true and ask user to confirm a place.
- If no external sources fired (all "off"/"not_called"), say so plainly in short_summary — do not fabricate local detail.
- If a source slice is empty for THIS section (e.g. "none match"), DO NOT pull from unrelated chatter — fall back to weather + tier-level common knowledge for ${ev.place.country ?? "the region"}, and lower confidence to "medium" or "low". Say in short_summary that you don't have section-specific signals yet and suggest a scan.
- If a slice is marked "weak signal" (only 1 loose match), reference it cautiously and keep confidence at "medium" max.
- Tone: human, warm, direct, like a friend giving practical advice. No corporate/report voice. No "geospatial specificity", no "significantly hampered", no "infrastructure effectively zero".
- signal_type must be "${section}".
- short_summary: one or two plain-English sentences. No markdown.
- source_labels: include only sources actually present above. Always add "internal" and "gemini".
- available_routes: include "refresh_signal" and "ask_vanta". Add "send_to_sherlock" or "create_commitment" when warranted.
- why_it_matters: one sentence on operational impact.
- what_to_do_next: one concrete step.
- long_detail: optional 2-4 plain sentences expanding the summary.`;
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
    const user = await resolveUser(req, supabase as any);
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

    // Build evidence bundle from latest snapshot (if any). Never trigger paid calls here.
    const { data: snap } = await supabase
      .from("awareness_snapshots")
      .select("compact, full_data, sources_used, generated_at, expires_at")
      .eq("place_id", place_id)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tier = classifyTierServer(place as any);
    const geoAny = (place.geo ?? {}) as any;
    const scope =
      tier === "exact" || tier === "saved" ? (place.label || "this spot")
      : tier === "area" || tier === "city" ? (geoAny.city ?? place.region ?? place.country ?? "this area")
      : tier === "country" ? (place.country ?? "this country")
      : "unknown";

    const full = (snap?.full_data ?? {}) as any;
    const sourcesUsed: string[] = (snap?.sources_used ?? []) as string[];
    const has = (k: string) => sourcesUsed.some((s) => s.toLowerCase().includes(k));
    const source_states: Evidence["source_states"] = {
      weather: has("open-meteo") ? (has("cached") && has("open-meteo:cached") ? "cached" : "used") : "not_called",
      serpapi: has("serpapi") ? (has("serpapi:cached") ? "cached" : "used") : (Deno.env.get("SERPAPI_KEY") ? "not_called" : "off"),
      community: has("reddit") ? (has("cached") ? "cached" : "used") : "not_called",
      gemini: has("gemini") ? "used" : "not_called",
    };
    const snapshotAgeMin = snap?.generated_at
      ? Math.round((Date.now() - new Date(snap.generated_at).getTime()) / 60000)
      : null;

    const evidence: Evidence = {
      tier,
      scope,
      place: {
        label: place.label,
        country: place.country,
        region: place.region,
        city: geoAny.city ?? null,
      },
      geo: {
        lat: typeof geoAny.lat === "number" ? geoAny.lat : null,
        lon: typeof geoAny.lon === "number" ? geoAny.lon : null,
        acc_m: typeof geoAny.acc === "number" ? geoAny.acc : null,
      },
      weather: full.weather ?? null,
      local_signals: Array.isArray(full.local_signals) ? full.local_signals : [],
      community: Array.isArray(full.community) ? full.community : [],
      snapshot_summary: typeof full.summary === "string" ? full.summary : null,
      sources_available: sourcesUsed,
      source_states,
      snapshot_age_min: snapshotAgeMin,
    };

    let signal: VantaSignal;
    let usedFallback = false;
    try {
      const raw = await callGemini(LOVABLE_API_KEY, AWARENESS_VOICE, buildPrompt(section, evidence) + correctionBlock);
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

    // R6 — structural sanity guard: keep short_summary actually short.
    // If the model overshoots, push the overflow into long_detail so the
    // compact card never renders a wall of prose.
    if (signal.short_summary && signal.short_summary.length > 220) {
      const full = signal.short_summary;
      const firstSentence = full.match(/^[^.!?]{20,200}[.!?]/)?.[0]?.trim();
      signal = {
        ...signal,
        short_summary: firstSentence ?? full.slice(0, 200).trimEnd() + "…",
        long_detail: signal.long_detail
          ? `${signal.long_detail}\n\n${full}`
          : full,
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

    /* Receipt: every refresh is a recorded event. Briefings append, never
       overwrite — and when a correction shaped this version, the receipt says
       so, so "Echo changed its mind" is traceable instead of silent. */
    await writeAuditEvent(supabase as never, {
      actor: user.id,
      organizationId: null,
      entityType: "awareness_place",
      entityId: place_id,
      event: "briefing.regenerated",
      source: "awareness-brief",
      metadata: {
        section,
        corrected: hasInvalidate,
        confidence: signal.confidence,
        fallback: usedFallback,
      },
    });

    return jsonResp({ ok: true, signal, used_fallback: usedFallback });
  } catch (e) {
    return jsonResp({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
