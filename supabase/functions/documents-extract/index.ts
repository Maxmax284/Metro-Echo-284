// documents-extract: turn an uploaded ingested_files row into a
// document_versions row with plain text body. Phase 1 leans on the existing
// `files-ingest` pipeline, which already writes ingested_files.extracted_text
// for supported types. We just copy that into a versioned document body.
//
// Doctrine: capture never executes. The user taps "Treat as document" then
// taps "Read document" — this function runs only behind that explicit tap.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({ document_id: z.string().uuid() });

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
      return json({ error: "unauthorized" }, 401);
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const { document_id } = parsed.data;

    const { data: doc } = await supabase
      .from("documents").select("*").eq("id", document_id).maybeSingle();
    if (!doc) return json({ error: "not_found" }, 404);

    // Move to extracting (best effort; ignore failures)
    await supabase.from("documents").update({ status: "extracting" }).eq("id", document_id);

    let bodyText = "";
    if (doc.source_file_id) {
      const { data: file } = await supabase
        .from("ingested_files")
        .select("filename,extracted_text,detected_doc_type")
        .eq("id", doc.source_file_id)
        .maybeSingle();
      bodyText = (file?.extracted_text ?? "").trim();
    }

    if (!bodyText) {
      await supabase.from("documents")
        .update({
          status: "failed",
          failure_reason: "We couldn't read text from this file yet. Try a PDF, DOCX, or screenshot with clear text.",
        })
        .eq("id", document_id);
      await supabase.from("audit_log").insert({
        user_id: user.id,
        entity_type: "document",
        entity_id: document_id,
        event: "document.extract_failed",
        payload: { reason: "no_text" },
      });
      return json({ ok: false, error: "no_text" }, 200);
    }

    // Determine next version_no
    const { data: lastVer } = await supabase
      .from("document_versions")
      .select("version_no")
      .eq("document_id", document_id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next_no = (lastVer?.version_no ?? 0) + 1;

    const { data: version, error: vErr } = await supabase
      .from("document_versions")
      .insert({
        document_id,
        user_id: user.id,
        version_no: next_no,
        body_text: bodyText.slice(0, 200_000),
        source: "extraction",
      })
      .select()
      .single();
    if (vErr) throw vErr;

    await supabase.from("documents")
      .update({ status: "extracted", failure_reason: null })
      .eq("id", document_id);

    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "document",
      entity_id: document_id,
      event: "document.extracted",
      payload: { version_id: version.id, version_no: next_no, chars: bodyText.length },
    });

    return json({ ok: true, version_id: version.id, chars: bodyText.length });
  } catch (e) {
    console.error("[documents-extract] error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
