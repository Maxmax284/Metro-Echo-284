// documents-intake: sort one spoken or typed brief into a document template.
//
// The person says the whole thing in one breath — "SOW for Kru Glitch, three
// month trial, twenty hours a week, 48-hour termination" — and Echo answers
// with the template and the fields it could honestly extract. The form opens
// pre-filled at the read-back step; the person edits, fills gaps, and taps
// Draft. This function never creates a document and never drafts — parsing
// is a proposal, the read-back is the approval, documents-draft executes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/http.ts";
import { chatCompletion, MODELS } from "../_shared/aiGateway.ts";
import { INTAKE_TOOL, sanitizeIntake, type IntakeCatalogTemplate } from "../_shared/intakeParse.ts";

const Body = z.object({
  brief: z.string().min(20).max(8_000),
  catalog: z.array(z.object({
    key: z.string().min(1).max(60),
    label: z.string().min(1).max(120),
    fields: z.array(z.object({
      key: z.string().min(1).max(60),
      label: z.string().min(1).max(160),
      kind: z.enum(["text", "textarea", "date", "money", "select"]),
      required: z.boolean().optional(),
      options: z.array(z.object({
        value: z.string().min(1).max(80),
        label: z.string().min(1).max(160),
      })).max(12).optional(),
    })).max(24),
  })).min(1).max(12),
});

const SYSTEM = `You sort one brief into a business-document template. Extraction, not writing.
- Pick the single best-fitting template from the catalog the user provides.
- When the brief names a document type or template (NDA, SOW, statement of work, service agreement, payment agreement, letter), honor that choice.
- Fill only the fields the brief actually states. Never invent parties, dates, money, terms, or names.
- Use the exact field keys from the chosen template's catalog. Omit anything not stated — the person fills gaps themselves.
- For select fields, answer with the option's value, not its label.
- Dates only when stated or unambiguous ("March 3 2027" → 2027-03-03); relative dates ("next Friday") stay out.
- Title: short internal name for the draft, from the brief — not a legal title.
- Tone: warm unless the brief clearly asks for formal or shorter.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: claims } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const user = claims?.user;
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ ok: false, error: "bad_request" }, 400);
    const { brief, catalog } = parsed.data;

    const res = await chatCompletion([
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `TEMPLATE CATALOG:\n${JSON.stringify(catalog)}\n\nBRIEF:\n${brief}`,
      },
    ], {
      model: MODELS.fast,
      tools: [INTAKE_TOOL],
      tool_choice: { type: "function", function: { name: "sort_intake" } },
    });
    if (!res.ok) return json({ ok: false, error: res.kind }, res.status);

    const args = res.data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let raw: unknown = null;
    try { raw = typeof args === "string" ? JSON.parse(args) : args; } catch { raw = null; }
    const result = sanitizeIntake(raw, catalog as IntakeCatalogTemplate[]);
    if (!result) return json({ ok: false, error: "no_match" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await admin.from("audit_log").insert({
      user_id: user.id,
      entity_type: "document",
      entity_id: null,
      event: "document.intake_parsed",
      payload: {
        template_key: result.template_key,
        fields_filled: Object.keys(result.inputs),
        brief_chars: brief.length,
      },
    });

    return json({ ok: true, parsed: result });
  } catch (e) {
    console.error("[documents-intake] error", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
