import { corsHeaders } from "../_shared/http.ts";
// intake-digest: pre-chew captures and notes into a tiny structured digest.
// Body: { items: Array<{ kind: 'capture'|'note', id: string }> } OR { kind, id }.
// Writes back digest jsonb on messages/notes and returns the digests.
// Voice: short, plain, no invented facts. Source-only. Safe to no-op when input is empty.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { VANTA_CORE_VOICE } from "../_shared/vantaVoice.ts";


const Item = z.object({ kind: z.enum(["capture", "note"]), id: z.string().uuid() });
const Body = z.union([
  z.object({ items: z.array(Item).min(1).max(40) }),
  Item,
]);

const DIGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "gist"],
  properties: {
    intent: { type: "string", enum: ["ask", "update", "decision", "vent", "info", "task"] },
    gist: { type: "string", maxLength: 180 },
    entities: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 8 },
    dates: { type: "array", items: { type: "string", maxLength: 40 }, maxItems: 4 },
    waiting_on: { type: "string", maxLength: 80 },
  },
} as const;

const SYS = `${VANTA_CORE_VOICE}
You read one short capture or note and return a tiny digest.
- intent: ask | update | decision | vent | info | task
- gist: one plain sentence under 25 words. No fluff. No quotes.
- entities: people, places, projects mentioned by name. Max 8. Skip if none.
- dates: any explicit date/time references found in the text (verbatim is fine). Skip if none.
- waiting_on: who or what is blocking action, if obvious. Else empty string.
Do not invent. Only use what is in the text.`;

async function digestOne(text: string, apiKey: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: SYS },
        { role: "user", content: text.slice(0, 4000) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "digest", strict: true, schema: DIGEST_SCHEMA },
      },
    }),
  });
  if (!r.ok) throw new Error(`ai gateway ${r.status}`);
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(raw); } catch { return null; }
}

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
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const items = "items" in parsed.data ? parsed.data.items : [parsed.data];

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const results: Record<string, any> = {};
    for (const it of items) {
      const table = it.kind === "note" ? "notes" : "messages";
      const col = it.kind === "note" ? "body" : "content";
      const { data: row } = await supabase.from(table).select(`id,user_id,${col},digest`).eq("id", it.id).maybeSingle();
      if (!row || row.user_id !== user.id) continue;
      if (row.digest) { results[it.id] = row.digest; continue; }
      const text = (row as any)[col];
      if (!text || String(text).trim().length < 3) continue;
      try {
        const d = await digestOne(String(text), key);
        if (!d) continue;
        await supabase.from(table).update({ digest: d }).eq("id", it.id);
        results[it.id] = d;
      } catch (e) {
        console.error("[intake-digest] one failed", it.id, e);
      }
    }

    return new Response(JSON.stringify({ digests: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
