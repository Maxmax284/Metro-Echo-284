// embeddings-generate: compute embeddings for notes/messages/commitments via Lovable AI Gateway.
// Modes:
//   { mode: "single", kind, id }                — requires user JWT, scoped to caller
//   { mode: "backfill", kind, limit?: number }  — runs as user when JWT present, else service-role across all users
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.union([
  z.object({ mode: z.literal("single"), kind: z.enum(["note", "message", "commitment"]), id: z.string().uuid() }),
  z.object({ mode: z.literal("backfill"), kind: z.enum(["note", "message", "commitment"]), limit: z.number().int().min(1).max(200).default(50) }),
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
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    // Try user-scoped client first
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const __authHeader = req.headers.get("Authorization") ?? "";

    const __token = __authHeader.replace("Bearer ", "");

    const { data: __claimsData } = await userClient.auth.getClaims(__token);

    const user = __claimsData?.claims?.sub ? { id: __claimsData.claims.sub as string } : null;

    const { kind } = parsed.data;
    const def = TABLE_TEXT[kind];
    let processed = 0;

    // Single mode requires a user
    if (parsed.data.mode === "single") {
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: row, error } = await userClient.from(def.table).select(`id, user_id, ${def.textCols.join(", ")}`).eq("id", parsed.data.id).maybeSingle();
      if (error) throw error;
      if (!row || (row as { user_id: string }).user_id !== user.id) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = def.textCols.map((c) => (row as Record<string, unknown>)[c] ?? "").join("\n").trim();
      if (!text) return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const vec = await embed(text, apiKey);
      const { error: upErr } = await userClient.from(def.table).update({ embedding: vec as unknown as string }).eq("id", parsed.data.id);
      if (upErr) throw upErr;
      processed = 1;
    } else {
      // Backfill: prefer service role for cross-user sweeps when no user present
      const client = user
        ? userClient
        : createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const limit = parsed.data.limit;
      const { data: rows, error } = await client
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
          await client.from(def.table).update({ embedding: vec as unknown as string }).eq("id", (row as { id: string }).id);
          processed++;
        } catch (_e) { /* skip per-row failures */ }
      }
    }

    return new Response(JSON.stringify({ processed, scope: user ? "user" : "service" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
