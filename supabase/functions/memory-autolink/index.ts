// memory-autolink: for a given note, find related notes via vector similarity and cache as suggestions.
// If `accept: true`, persists a `note_links` row for each suggested note.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  note_id: z.string().uuid(),
  accept_ids: z.array(z.string().uuid()).optional(),
  match_count: z.number().int().min(1).max(20).default(8),
  min_similarity: z.number().min(0).max(1).default(0.55),
});

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

    const { note_id, accept_ids, match_count, min_similarity } = parsed.data;

    // Persist accepted links
    if (accept_ids && accept_ids.length > 0) {
      const rows = accept_ids.map((to) => ({ user_id: user.id, from_note: note_id, to_note: to, kind: "related" }));
      const { error: insErr } = await supabase.from("note_links").insert(rows);
      if (insErr) throw insErr;
      return new Response(JSON.stringify({ linked: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Guard: notes_related requires the source note to have an embedding.
    // Without this check the RPC throws a null-vector error → generic 500.
    const { data: noteRow, error: noteErr } = await supabase
      .from("notes")
      .select("id, embedding")
      .eq("id", note_id)
      .maybeSingle();
    if (noteErr) throw noteErr;
    if (!noteRow) {
      return new Response(JSON.stringify({ error: "note not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!noteRow.embedding) {
      return new Response(JSON.stringify({ suggestions: [], reason: "no_embedding_yet" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data, error } = await supabase.rpc("notes_related", {
      _user_id: user.id,
      _note_id: note_id,
      _match_count: match_count,
      _min_similarity: min_similarity,
    });
    if (error) {
      console.error("notes_related rpc failed", { note_id, message: error.message });
      throw error;
    }

    // Cache suggestions on the note
    await supabase.from("notes").update({ autolink_suggestions: data ?? [] }).eq("id", note_id);

    return new Response(JSON.stringify({ suggestions: data ?? [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
