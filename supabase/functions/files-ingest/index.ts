// files-ingest: extract text from an uploaded file (PDF, DOCX, image OCR, text),
// create a note, embed, and trigger memory-autolink. Phase D — Ingestion Hardening.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEXT_EXTS = new Set(["md", "txt", "json", "xml", "csv", "log", "yaml", "yml", "html", "htm"]);

async function extractPdfText(blob: Blob): Promise<string> {
  // unpdf is Deno-compatible and ships a serverless build.
  const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
  const buf = new Uint8Array(await blob.arrayBuffer());
  const doc = await getDocumentProxy(buf);
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : String(text ?? "");
}

async function extractDocxText(blob: Blob): Promise<string> {
  const mammoth = await import("https://esm.sh/mammoth@1.8.0?bundle");
  const arrayBuffer = await blob.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return String(result?.value ?? "");
}

async function ocrImageWithGateway(blob: Blob, mime: string): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
  const buf = new Uint8Array(await blob.arrayBuffer());
  // base64 encode
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const b64 = btoa(bin);
  const dataUrl = `data:${mime || "image/png"};base64,${b64}`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Extract all readable text from this image. Return plain text only, preserve line breaks. If no text is present, describe the image in one short sentence." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`vision ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  return String(j.choices?.[0]?.message?.content ?? "").trim();
}

async function extractText(blob: Blob, mime: string, filename: string): Promise<{ text: string; method: string }> {
  const lower = (mime || "").toLowerCase();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (lower === "application/pdf" || ext === "pdf") {
    return { text: await extractPdfText(blob), method: "pdf" };
  }
  if (
    lower === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return { text: await extractDocxText(blob), method: "docx" };
  }
  if (lower.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) {
    return { text: await ocrImageWithGateway(blob, lower || "image/png"), method: "ocr" };
  }
  if (
    lower.startsWith("text/") ||
    lower.includes("json") ||
    lower.includes("xml") ||
    lower.includes("csv") ||
    TEXT_EXTS.has(ext)
  ) {
    return { text: await blob.text(), method: "text" };
  }
  return { text: "", method: "none" };
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", { _user_id: user.id, _bucket: "files-ingest", _limit: 60, _window_seconds: 60 });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { ingested_file_id } = await req.json();
    if (!ingested_file_id) {
      return new Response(JSON.stringify({ error: "ingested_file_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rec, error: recErr } = await supabase
      .from("ingested_files").select("*").eq("id", ingested_file_id).maybeSingle();
    if (recErr || !rec) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!rec.storage_path) return new Response(JSON.stringify({ error: "no storage_path" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await supabase.from("ingested_files").update({ status: "processing" }).eq("id", rec.id);

    const { data: blob, error: dlErr } = await supabase.storage
      .from("memory-uploads").download(rec.storage_path);
    if (dlErr || !blob) {
      await supabase.from("ingested_files").update({ status: "error", error: dlErr?.message ?? "download failed" }).eq("id", rec.id);
      return new Response(JSON.stringify({ error: dlErr?.message ?? "download failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let text = ""; let method = "none";
    try {
      const r = await extractText(blob, rec.mime_type ?? "", rec.filename);
      text = r.text; method = r.method;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "extract failed";
      await supabase.from("ingested_files").update({ status: "error", error: msg }).eq("id", rec.id);
      return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const trimmed = (text ?? "").slice(0, 200_000);
    const noteBody = trimmed
      ? trimmed
      : `Imported file: ${rec.filename} (${rec.mime_type ?? "unknown"}, ${rec.size_bytes ?? 0} bytes). Text extraction not available.`;

    const { data: note, error: noteErr } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        title: rec.filename,
        body: noteBody,
        tags: ["imported", rec.source ?? "upload", `via:${method}`],
        metadata: { ingested_file_id: rec.id, source: rec.source, mime: rec.mime_type, extraction: method },
      })
      .select("id")
      .single();
    if (noteErr || !note) {
      await supabase.from("ingested_files").update({ status: "error", error: noteErr?.message ?? "note insert failed" }).eq("id", rec.id);
      return new Response(JSON.stringify({ error: noteErr?.message ?? "note insert failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("ingested_files").update({
      status: "done", note_id: note.id, error: null,
      metadata: { ...(rec.metadata ?? {}), extraction: method, chars: trimmed.length },
    }).eq("id", rec.id);

    // Background: embed + autolink (do not block response on these)
    (async () => {
      try { await supabase.functions.invoke("embeddings-generate", { body: { kind: "note", id: note.id } }); } catch (e) { console.warn("embed", e); }
      try { await supabase.functions.invoke("memory-autolink", { body: { note_id: note.id } }); } catch (e) { console.warn("autolink", e); }
    })();

    await supabase.from("audit_log").insert({
      user_id: user.id, entity_type: "ingested_file", entity_id: rec.id,
      event: "ingest.success",
      payload: { method, note_id: note.id, chars: trimmed.length, mime: rec.mime_type },
    });

    // Stage 8 — File Intelligence: emit a low-priority nudge suggesting Sherlock
    // when the extracted text is substantive enough to be worth investigating.
    if (trimmed.length >= 400) {
      const dayKey = new Date().toISOString().slice(0, 10);
      await supabase.from("nudges").upsert([{
        user_id: user.id,
        kind: "file_insight",
        title: `New file ready to investigate`,
        body: `${rec.filename} — ${trimmed.length.toLocaleString()} chars extracted via ${method}. Tap to analyze.`,
        related_entity_type: "note",
        related_entity_id: note.id,
        priority: 45,
        dedupe_key: `file_insight:${rec.id}`,
      }], { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
    }

    return new Response(JSON.stringify({ ok: true, note_id: note.id, method, chars: trimmed.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("files-ingest", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
