// documents-review: read the latest document_versions.body_text and produce
// a plain-English review (summary, parties, dates, money, obligations,
// missing/unclear, questions, verdict, risks). Writes:
//   - one document_reviews row
//   - N document_risks rows
//   - N document_obligations rows
//   - audit events: document.reviewed (+ document.risk_flagged per high risk)
//
// Doctrine: warm but not chummy. No legal cosplay. No jurisdiction claims.
// Surface what could bite the user, in plain English they can act on.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { VANTA_CORE_VOICE } from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  document_id: z.string().uuid(),
  version_id: z.string().uuid().optional(),
});

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary", "parties", "key_dates", "money_terms", "obligations",
    "missing_or_unclear", "questions_to_ask", "verdict", "risks",
  ],
  properties: {
    summary: { type: "string", maxLength: 900 },
    parties: {
      type: "array", maxItems: 10,
      items: {
        type: "object", additionalProperties: false, required: ["name"],
        properties: {
          name: { type: "string", maxLength: 160 },
          role: { type: "string", maxLength: 80 },
        },
      },
    },
    key_dates: {
      type: "array", maxItems: 12,
      items: {
        type: "object", additionalProperties: false, required: ["label", "when"],
        properties: {
          label: { type: "string", maxLength: 80 },
          when: { type: "string", maxLength: 80 },
        },
      },
    },
    money_terms: {
      type: "array", maxItems: 12,
      items: {
        type: "object", additionalProperties: false, required: ["label", "amount"],
        properties: {
          label: { type: "string", maxLength: 120 },
          amount: { type: "string", maxLength: 80 },
        },
      },
    },
    obligations: {
      type: "array", maxItems: 14,
      items: {
        type: "object", additionalProperties: false, required: ["party", "what"],
        properties: {
          party: { type: "string", maxLength: 120 },
          what: { type: "string", maxLength: 240 },
          when: { type: "string", maxLength: 120 },
          conditions: { type: "string", maxLength: 240 },
          source_clause_ref: { type: "string", maxLength: 80 },
        },
      },
    },
    missing_or_unclear: { type: "array", maxItems: 10, items: { type: "string", maxLength: 200 } },
    questions_to_ask:   { type: "array", maxItems: 10, items: { type: "string", maxLength: 200 } },
    verdict: { type: "string", maxLength: 400 },
    risks: {
      type: "array", maxItems: 10,
      items: {
        type: "object", additionalProperties: false,
        required: ["severity", "title", "plain_english"],
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high"] },
          title: { type: "string", maxLength: 120 },
          plain_english: { type: "string", maxLength: 320 },
          clause_ref: { type: "string", maxLength: 80 },
          suggested_question: { type: "string", maxLength: 200 },
        },
      },
    },
  },
} as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const user = claims?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { document_id, version_id } = parsed.data;

    const { data: doc } = await supabase
      .from("documents").select("*").eq("id", document_id).maybeSingle();
    if (!doc) return json({ error: "not_found" }, 404);

    const verQ = supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", document_id);
    const { data: version } = version_id
      ? await verQ.eq("id", version_id).maybeSingle()
      : await verQ.order("version_no", { ascending: false }).limit(1).maybeSingle();
    if (!version || !version.body_text) {
      return json({ error: "no_version_text" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    await supabase.from("documents").update({ status: "reviewing" }).eq("id", document_id);

    const sys = `${VANTA_CORE_VOICE}
You are reading a business document on behalf of an operator who is not a lawyer.
Explain it in plain English they can act on.
- summary: 3–5 sentences. What is this document, who is in it, what does it do.
- parties: every named entity that holds rights or obligations.
- key_dates: start, end, renewal, notice windows, payment dates. Verbatim where possible.
- money_terms: fees, splits, deposits, payment cadence, late fees, refunds.
- obligations: who owes what to whom and when. One row per obligation.
- missing_or_unclear: things a reasonable operator would expect to see and doesn't, or wording so vague it cannot be acted on.
- questions_to_ask: concrete questions the operator should ask before signing.
- verdict: one short paragraph — calm, useful. Not legal advice.
- risks: up to 10. Severity is your honest read (low/medium/high). plain_english explains WHY this could bite them, in operator language. suggested_question is what they should ask to resolve it.
Voice: warm but not chummy. No exclamation marks. No "as an AI". No jurisdiction guarantees. Never claim legal correctness. If something is genuinely unclear, say so — guessing confidently is worse than admitting it.`;

    const docKindHint = doc.kind && doc.kind !== "unknown" ? `\nDocument type hint: ${doc.kind}` : "";
    const userMsg = `Title: ${doc.title}${docKindHint}\n\nFULL TEXT:\n${(version.body_text as string).slice(0, 120_000)}`;

    const model = "google/gemini-2.5-flash";
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "document_review", strict: true, schema: REVIEW_SCHEMA },
        },
      }),
    });

    if (r.status === 429) {
      await failDoc(supabase, document_id, user.id, "Vanta is over its rate limit just now. Try again in a minute.");
      return json({ ok: false, error: "rate_limited" }, 429);
    }
    if (r.status === 402) {
      await failDoc(supabase, document_id, user.id, "Review credits are exhausted. Top up in Settings.");
      return json({ ok: false, error: "credits_exhausted" }, 402);
    }
    if (!r.ok) {
      await failDoc(supabase, document_id, user.id, "Vanta couldn't finish reading this document. Try again, or attach a clearer copy.");
      return json({ ok: false, error: `ai_gateway_${r.status}` }, 500);
    }
    const j = await r.json();
    const raw = j.choices?.[0]?.message?.content ?? "{}";
    let parsedReview: any = null;
    try { parsedReview = JSON.parse(raw); } catch { /* fall through */ }
    if (!parsedReview) {
      await failDoc(supabase, document_id, user.id, "Vanta's review came back unreadable. Try again.");
      return json({ ok: false, error: "bad_model_output" }, 500);
    }

    // Insert review
    const { data: review, error: revErr } = await supabase
      .from("document_reviews")
      .insert({
        document_id,
        version_id: version.id,
        user_id: user.id,
        summary: parsedReview.summary ?? null,
        parties: parsedReview.parties ?? [],
        key_dates: parsedReview.key_dates ?? [],
        money_terms: parsedReview.money_terms ?? [],
        obligations: parsedReview.obligations ?? [],
        missing_or_unclear: parsedReview.missing_or_unclear ?? [],
        questions_to_ask: parsedReview.questions_to_ask ?? [],
        verdict: parsedReview.verdict ?? null,
        model,
      })
      .select()
      .single();
    if (revErr) throw revErr;

    // Insert risks + obligations
    const risks = Array.isArray(parsedReview.risks) ? parsedReview.risks : [];
    if (risks.length) {
      await supabase.from("document_risks").insert(
        risks.map((r: any) => ({
          review_id: review.id,
          document_id,
          user_id: user.id,
          severity: r.severity ?? "medium",
          title: r.title ?? "Risk",
          plain_english: r.plain_english ?? null,
          clause_ref: r.clause_ref ?? null,
          suggested_question: r.suggested_question ?? null,
        })),
      );
    }
    const obligations = Array.isArray(parsedReview.obligations) ? parsedReview.obligations : [];
    if (obligations.length) {
      await supabase.from("document_obligations").insert(
        obligations.map((o: any) => ({
          review_id: review.id,
          document_id,
          user_id: user.id,
          party: o.party ?? null,
          what: o.what ?? null,
          when_text: o.when ?? null,
          conditions: o.conditions ?? null,
          source_clause_ref: o.source_clause_ref ?? null,
        })),
      );
    }

    // Update doc + parties + status
    const parties = parsedReview.parties ?? [];
    await supabase.from("documents")
      .update({
        status: "reviewed",
        latest_review_id: review.id,
        parties,
        failure_reason: null,
      })
      .eq("id", document_id);

    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "document",
      entity_id: document_id,
      event: "document.reviewed",
      payload: {
        review_id: review.id,
        risks: risks.length,
        high_risks: risks.filter((r: any) => r.severity === "high").length,
      },
    });

    const highCount = risks.filter((r: any) => r.severity === "high").length;
    if (highCount > 0) {
      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: "document",
        entity_id: document_id,
        event: "document.risk_flagged",
        payload: { count: highCount, severity: "high" },
      });
    }

    return json({ ok: true, review_id: review.id, risks: risks.length });
  } catch (e) {
    console.error("[documents-review] error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function failDoc(supabase: any, document_id: string, user_id: string, reason: string) {
  await supabase.from("documents")
    .update({ status: "failed", failure_reason: reason })
    .eq("id", document_id);
  await supabase.from("audit_log").insert({
    user_id, entity_type: "document", entity_id: document_id,
    event: "document.review_failed", payload: { reason },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
