import { bearerToken, resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
// files-ingest: extract text from an uploaded file (PDF, DOCX, image OCR, text),
// create a note, embed, and trigger memory-autolink. Phase D — Ingestion Hardening.
// Wave 1 / Phase 3: also runs a single doc-type classifier call against the
// Lovable AI Gateway, persists structured fields (detected_doc_type,
// extracted_entities, suggested_summary, suggested_actions, sensitive,
// confidence, review_status) and writes audit events. Sensitive content is
// forced to a cautious posture and never auto-routed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { detectSensitive } from "../_shared/sensitive.ts";
import { ocrImage } from "../_shared/pageRead.ts";

import {
  DETECTED_DOC_TYPES,
  FILE_SUGGESTED_ACTION_KINDS,
  isSensitiveByType,
  validateFileIntakeUpdate,
  type FileIntakeUpdate,
} from "../_shared/fileIntake.ts";


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

/* One OCR path for the whole platform — see _shared/pageRead.ts. */
const ocrImageWithGateway = ocrImage;


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
    /* A picture is not always a page. Read the words first, because that's what
       a receipt or a scan is for; when there are barely any words, the picture
       was the point, so it gets the same look the chat surface gives it. One
       shared vision path, no second engine. */
    const mime = lower || "image/png";
    const scraped = (await ocrImageWithGateway(blob, mime)).trim();
    if (scraped.replace(/\s+/g, " ").length >= 24) return { text: scraped, method: "ocr" };
    try {
      const look = await lookAtImage(blob, mime, "identify");
      if (look.answer.trim()) return { text: look.answer.trim(), method: "look" };
    } catch {
      /* Looking is a bonus here; the OCR result (even empty) still stands. */
    }
    return { text: scraped, method: "ocr" };
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    /* Two doors, one reader. A person uploads with their own session; a
       background job (a file handed over in chat, the daily sweep) arrives with
       the service key and no session at all. In that case the owner is taken
       from the file itself, never from the caller. */
    const internal = bearerToken(req) === serviceKey;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const supabase = internal
      ? admin
      : createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: auth } } },
      );
    let user = internal ? null : await resolveUser(req, supabase as any);
    if (!internal && !user) return unauthorized();

    if (user) {
      const { data: allowed } = await admin.rpc("rate_limit_hit", { _user_id: user.id, _bucket: "files-ingest", _limit: 60, _window_seconds: 60 });
      if (allowed === false) {
        return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { ingested_file_id } = await req.json();
    if (!ingested_file_id) {
      return new Response(JSON.stringify({ error: "ingested_file_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rec, error: recErr } = await supabase
      .from("ingested_files").select("*").eq("id", ingested_file_id).maybeSingle();
    if (recErr || !rec) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (internal) user = { id: rec.user_id as string };
    if (!user) return unauthorized();

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

    // Track B doctrine: every ingested file lands as a draft needing review.
    // The classifier branch below may upgrade review_status to 'suggested' or
    // hold sensitive content at 'needs_review'. Nothing routes silently.
    await supabase.from("ingested_files").update({
      status: "done", note_id: note.id, error: null,
      extracted_text: trimmed || null,
      review_status: "needs_review",
      metadata: { ...(rec.metadata ?? {}), extraction: method, chars: trimmed.length },
    }).eq("id", rec.id);

    // ----- Wave 1 / Phase 3: doc-type classifier + sensitive gate -----
    // Single Lovable AI Gateway call, strict JSON tool schema. Never blocks
    // the rest of ingestion. Sensitive content forces a cautious posture and
    // never produces suggested_actions. Everything is a draft — nothing
    // executes downstream.
    let classifierUpdate: FileIntakeUpdate | null = null;
    let classifierAudit: Record<string, unknown> | null = null;
    if (trimmed.length >= 40) {
      const sens = detectSensitive(`${rec.filename}\n${trimmed.slice(0, 4000)}`);
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      let classified: any = null;
      if (apiKey) {
        try {
          const SYSTEM = `You are Echo's file intake classifier. Read the extracted text from one file and return strict JSON. You never execute actions, never speculate, and always cap confidence at low when unsure. Suggested actions are drafts only — they will be reviewed by a human before anything runs.`;
          const SCHEMA = {
            type: "object",
            additionalProperties: false,
            required: ["detected_doc_type", "confidence", "suggested_summary"],
            properties: {
              detected_doc_type: { type: "string", enum: DETECTED_DOC_TYPES as unknown as string[] },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              suggested_summary: { type: "string", maxLength: 600 },
              extracted_entities: {
                type: "object",
                additionalProperties: false,
                properties: {
                  dates: { type: "array", items: { type: "string", maxLength: 64 }, maxItems: 32 },
                  people: { type: "array", items: { type: "string", maxLength: 160 }, maxItems: 32 },
                  locations: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 16 },
                  amounts: {
                    type: "array", maxItems: 32,
                    items: {
                      type: "object", additionalProperties: false, required: ["value"],
                      properties: {
                        value: { type: "number" },
                        currency: { type: "string", maxLength: 8 },
                        label: { type: "string", maxLength: 120 },
                      },
                    },
                  },
                  payment_refs: { type: "array", items: { type: "string", maxLength: 120 }, maxItems: 16 },
                },
              },
              suggested_actions: {
                type: "array", maxItems: 6,
                items: {
                  type: "object", additionalProperties: false, required: ["kind", "label"],
                  properties: {
                    kind: { type: "string", enum: FILE_SUGGESTED_ACTION_KINDS as unknown as string[] },
                    label: { type: "string", maxLength: 160 },
                    rationale: { type: "string", maxLength: 280 },
                  },
                },
              },
            },
          };
          const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: `FILE: ${rec.filename}\nMIME: ${rec.mime_type ?? "?"}\n\nEXTRACTED TEXT (first 6000 chars):\n${trimmed.slice(0, 6000)}` },
              ],
              tools: [{
                type: "function",
                function: { name: "classify_file", description: "Return structured file intake.", parameters: SCHEMA },
              }],
              tool_choice: { type: "function", function: { name: "classify_file" } },
            }),
          });
          if (r.ok) {
            const j = await r.json();
            const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
            if (args) classified = JSON.parse(args);
          } else {
            console.warn("classifier non-200", r.status);
          }
        } catch (e) {
          console.warn("classifier error", e);
        }
      }

      const detected = classified?.detected_doc_type ?? "unknown";
      const sensitiveDetected = sens.sensitive || isSensitiveByType(detected);
      const draft: FileIntakeUpdate = {
        detected_doc_type: detected,
        confidence: sensitiveDetected ? "low" : (classified?.confidence ?? "medium"),
        suggested_summary: sensitiveDetected
          ? `This file looks sensitive (${[...new Set([...(sens.categories ?? []), detected])].join(", ")}). Held for review — nothing routed.`
          : (classified?.suggested_summary ?? null),
        extracted_entities: classified?.extracted_entities ?? undefined,
        // Sensitive files never carry auto-drafted actions; the user must opt in.
        suggested_actions: sensitiveDetected ? [] : (classified?.suggested_actions ?? []),
        sensitive: sensitiveDetected,
        // Doctrine: even when the classifier is confident, the file remains a
        // draft until the operator confirms. 'suggested' surfaces it in the
        // Inbox; 'needs_review' is the hold lane for sensitive content.
        review_status: sensitiveDetected ? "needs_review" : (classified ? "suggested" : "needs_review"),
      };
      try {
        classifierUpdate = validateFileIntakeUpdate(draft);
        await supabase.from("ingested_files").update(classifierUpdate as any).eq("id", rec.id);
        classifierAudit = {
          detected_doc_type: classifierUpdate.detected_doc_type,
          confidence: classifierUpdate.confidence,
          sensitive: classifierUpdate.sensitive,
          sensitive_categories: sens.categories,
          had_classifier: !!classified,
        };
      } catch (e) {
        console.warn("classifier update invalid", e);
      }

      if (sensitiveDetected) {
        await supabase.from("audit_log").insert({
          user_id: user.id, entity_type: "ingested_file", entity_id: rec.id,
          event: "file.sensitive_flagged",
          payload: { categories: sens.categories, detected_doc_type: detected },
        });
      }
    }

    // Background: embed + autolink (do not block response on these)
    (async () => {
      try { await supabase.functions.invoke("embeddings-generate", { body: { kind: "note", id: note.id } }); } catch (e) { console.warn("embed", e); }
      try { await supabase.functions.invoke("memory-autolink", { body: { note_id: note.id } }); } catch (e) { console.warn("autolink", e); }
    })();

    await supabase.from("audit_log").insert({
      user_id: user.id, entity_type: "ingested_file", entity_id: rec.id,
      event: "ingest.success",
      payload: { method, note_id: note.id, chars: trimmed.length, mime: rec.mime_type, classifier: classifierAudit },
    });
    if (classifierUpdate) {
      await supabase.from("audit_log").insert({
        user_id: user.id, entity_type: "ingested_file", entity_id: rec.id,
        event: "file.classified",
        payload: classifierAudit ?? {},
      });
    }

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
