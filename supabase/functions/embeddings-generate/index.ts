// embeddings-generate: compute embeddings for notes/messages/commitments via Lovable AI Gateway.
// Usage modes:
//   { mode: "single", kind: "note"|"message"|"commitment", id: uuid }
//   { mode: "backfill", kind: "note"|"message"|"commitment", limit?: number }  (processes rows where embedding is null)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.union([
  z.object({ mode: z.literal("single"), kind: z.enum(["note", "message", "commitment"]), id: z.string().uuid() }),
  z.object({ mode: z.literal("backfill"), kind: z.enum(["note", "message", "commitment"]), limit: z.number().int().min(1).max(100).default(25) }),
]);

const TABLE_TEXT: Record<string, { table: string; textCols: string[] }> = {
  note:       { table: "notes",       textCols: ["title", "body"] },
  message:    { table: "messages",    textCols: ["content"] },
  commitment: { table: "commitments", textCols: ["summary"] },
};

async function embed(text: string, apiKey: string): Promise<number[]> {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: text.slice(0, 8000) }),
  });
  if (!r.ok) throw new Error(`embedding gateway: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.data?.[0]?.embedding ?? [];
}

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

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { kind } = parsed.data;
    const def = TABLE_TEXT[kind];
    let processed = 0;

    if (parsed.data.mode === "single") {
      const { data: row, error } = await supabase.from(def.table).select(`id, user_id, ${def.textCols.join(", ")}`).eq("id", parsed.data.id).maybeSingle();
      if (error) throw error;
      if (!row || row.user_id !== user.id) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = def.textCols.map((c) => (row as Record<string, unknown>)[c] ?? "").join("\n").trim();
      if (!text) return new Response(JSON.stringify({ processed: 0, reason: "empty" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const vec = await embed(text, apiKey);
      const { error: upErr } = await supabase.from(def.table).update({ embedding: vec as unknown as string }).eq("id", parsed.data.id);
      if (upErr) throw upErr;
      processed = 1;
    } else {
      const limit = parsed.data.limit;
      const { data: rows, error } = await supabase
        .from(def.table)
        .select(`id, ${def.textCols.join(", ")}`)
        .is("embedding", null)
        .limit(limit);
      if (error) throw error;
      for (const row of rows ?? []) {
        const text = def.textCols.map((c) => (row as Record<string, unknown>)[c] ?? "").join("\n").trim();
        if (!text) continue;
        try {
          const vec = await embed(text, apiKey);
          await supabase.from(def.table).update({ embedding: vec as unknown as string }).eq("id", (row as { id: string }).id);
          processed++;
        } catch (_e) { /* skip on per-row failures */ }
      }
    }

    return new Response(JSON.stringify({ processed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
