// files-ingest: takes a previously-uploaded object in the memory-uploads bucket,
// extracts text, creates a note, and queues an embedding.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractText(blob: Blob, mime: string, filename: string): Promise<string> {
  const lower = (mime || "").toLowerCase();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (
    lower.startsWith("text/") ||
    lower.includes("json") ||
    lower.includes("xml") ||
    lower.includes("csv") ||
    ["md", "txt", "json", "xml", "csv", "log", "yaml", "yml"].includes(ext)
  ) {
    return await blob.text();
  }
  // Best-effort fallback for unknown binary: keep filename only.
  return "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { ingested_file_id } = await req.json();
    if (!ingested_file_id) {
      return new Response(JSON.stringify({ error: "ingested_file_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rec, error: recErr } = await supabase
      .from("ingested_files")
      .select("*")
      .eq("id", ingested_file_id)
      .maybeSingle();
    if (recErr || !rec) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!rec.storage_path) return new Response(JSON.stringify({ error: "no storage_path" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await supabase.from("ingested_files").update({ status: "processing" }).eq("id", rec.id);

    const { data: blob, error: dlErr } = await supabase.storage
      .from("memory-uploads")
      .download(rec.storage_path);
    if (dlErr || !blob) {
      await supabase.from("ingested_files").update({ status: "error", error: dlErr?.message ?? "download failed" }).eq("id", rec.id);
      return new Response(JSON.stringify({ error: dlErr?.message ?? "download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const text = await extractText(blob, rec.mime_type ?? "", rec.filename);
    const trimmed = text.slice(0, 200_000); // cap

    const noteBody = trimmed
      ? trimmed
      : `Imported file: ${rec.filename} (${rec.mime_type ?? "unknown"}, ${rec.size_bytes ?? 0} bytes). Text extraction not available.`;

    const { data: note, error: noteErr } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        title: rec.filename,
        body: noteBody,
        tags: ["imported", rec.source ?? "upload"],
        metadata: { ingested_file_id: rec.id, source: rec.source, mime: rec.mime_type },
      })
      .select("id")
      .single();
    if (noteErr || !note) {
      await supabase.from("ingested_files").update({ status: "error", error: noteErr?.message ?? "note insert failed" }).eq("id", rec.id);
      return new Response(JSON.stringify({ error: noteErr?.message ?? "note insert failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("ingested_files").update({ status: "done", note_id: note.id, error: null }).eq("id", rec.id);

    // Fire-and-forget embedding
    try {
      await supabase.functions.invoke("embeddings-generate", {
        body: { kind: "note", id: note.id },
      });
    } catch (e) {
      console.warn("embedding invoke failed", e);
    }

    return new Response(JSON.stringify({ ok: true, note_id: note.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("files-ingest", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
