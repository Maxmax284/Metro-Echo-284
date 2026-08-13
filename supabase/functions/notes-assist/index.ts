import { resolveUser } from "../_shared/authContext.ts";
import { failure, unauthorized } from "../_shared/errors.ts";
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { chatText, MODELS } from "../_shared/aiGateway.ts";
// notes-assist: summarize or extract action items from a note using Lovable AI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { MEMORY_VOICE } from "../_shared/vantaVoice.ts";


const Body = z.object({
  action: z.enum(["summarize", "extract"]),
  note_id: z.string().uuid(),
  body: z.string().min(1).max(20000),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { action, body } = parsed.data;

    const sys = action === "summarize"
      ? `${MEMORY_VOICE}\n\nSummarize the user's note in 3-5 tight bullet points. Plain text, no fluff.`
      : `${MEMORY_VOICE}\n\nExtract concrete action items from the note as a short numbered list. Each item must be actionable and specific. Plain text.`;

    const res = await chatText(
      [{ role: "system", content: sys }, { role: "user", content: body }],
      { model: MODELS.fast },
    );
    if (!res.ok) return failure(res.kind);
    const heading = action === "summarize" ? "## Summary" : "## Actions";
    return jsonResponse({ appended: `${heading}\n${res.data}` });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
