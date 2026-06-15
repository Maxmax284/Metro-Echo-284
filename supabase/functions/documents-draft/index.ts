// documents-draft: generate (or revise) the body text of a drafted business
// document. Writes a new document_versions row (source='draft' or 'revision'),
// flips documents.status to 'drafted', and emits an audit receipt.
//
// Doctrine: Plan → Approve → Execute. The user explicitly tapped Draft / Revise.
// We never send, sign, or share — we hand back a markdown body for review.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { VANTA_CORE_VOICE } from "../_shared/vantaVoice.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  document_id: z.string().uuid(),
  // free-form template prompt (built on the client from documentTemplates.ts)
  user_message: z.string().min(20).max(20_000),
  template_title: z.string().min(2).max(200),
  // optional follow-up. When present, we are revising the latest draft.
  revision_prompt: z.string().min(1).max(4_000).optional(),
});

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
    const { document_id, user_message, template_title, revision_prompt } = parsed.data;

    const { data: doc } = await supabase
      .from("documents").select("*").eq("id", document_id).maybeSingle();
    if (!doc) return json({ error: "not_found" }, 404);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Pull the most recent version (if any) for revision context.
    const { data: latestVer } = await supabase
      .from("document_versions")
      .select("*")
      .eq("document_id", document_id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isRevision = !!revision_prompt && !!latestVer?.body_text;

    await supabase.from("documents").update({ status: "drafting", failure_reason: null }).eq("id", document_id);

    const sys = `${VANTA_CORE_VOICE}
You draft business documents in plain English for an operator who is not a lawyer.
- Tight, useful, calm. Warm but not chummy. No exclamation marks.
- No legal cosplay. No jurisdiction-specific guarantees. No "as an AI".
- Output Markdown only. Use real headings (##) and short paragraphs.
- Where information is missing, write "[to be supplied]" instead of inventing facts.
- End with a short closing line: "This draft is for review. It is not legal advice."
Template: ${template_title}.`;

    const messages = isRevision
      ? [
          { role: "system", content: sys },
          {
            role: "user",
            content: `Current draft (Markdown):\n\n${(latestVer!.body_text as string).slice(0, 60_000)}`,
          },
          {
            role: "user",
            content: `Revision request:\n${revision_prompt}\n\nReturn the FULL revised document in Markdown. Preserve sections that weren't asked to change.`,
          },
        ]
      : [
          { role: "system", content: sys },
          { role: "user", content: user_message },
        ];

    const model = "google/gemini-2.5-flash";
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });
    if (r.status === 429) {
      await failDoc(supabase, document_id, user.id, "Vanta is over its rate limit just now. Try again in a minute.");
      return json({ ok: false, error: "rate_limited" }, 429);
    }
    if (r.status === 402) {
      await failDoc(supabase, document_id, user.id, "Drafting credits are exhausted. Top up in Settings.");
      return json({ ok: false, error: "credits_exhausted" }, 402);
    }
    if (!r.ok) {
      await failDoc(supabase, document_id, user.id, "Vanta couldn't finish this draft. Try again.");
      return json({ ok: false, error: `ai_gateway_${r.status}` }, 500);
    }

    const j = await r.json();
    const body: string = j.choices?.[0]?.message?.content ?? "";
    if (!body.trim()) {
      await failDoc(supabase, document_id, user.id, "Vanta's draft came back empty. Try again.");
      return json({ ok: false, error: "empty_output" }, 500);
    }

    const nextVersionNo = (latestVer?.version_no ?? 0) + 1;
    const { data: version, error: verErr } = await supabase
      .from("document_versions")
      .insert({
        document_id,
        user_id: user.id,
        version_no: nextVersionNo,
        body_text: body,
        source: isRevision ? "revision" : "draft",
      })
      .select()
      .single();
    if (verErr) throw verErr;

    await supabase.from("documents")
      .update({ status: "drafted", failure_reason: null })
      .eq("id", document_id);

    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "document",
      entity_id: document_id,
      event: isRevision ? "document.draft_revised" : "document.draft_created",
      payload: { version_id: version.id, version_no: nextVersionNo, model },
    });

    return json({ ok: true, version_id: version.id, version_no: nextVersionNo });
  } catch (e) {
    console.error("[documents-draft] error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function failDoc(supabase: any, document_id: string, user_id: string, reason: string) {
  await supabase.from("documents")
    .update({ status: "failed", failure_reason: reason })
    .eq("id", document_id);
  await supabase.from("audit_log").insert({
    user_id, entity_type: "document", entity_id: document_id,
    event: "document.draft_failed", payload: { reason },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
