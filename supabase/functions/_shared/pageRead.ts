// pageRead — the one place that turns a captured page (a photo of paper, a
// scan, a screenshot) into readable text inside Vanta.
//
// Doctrine:
//   - reading is not acting. This creates a note and leaves the file in a
//     review lane. Nothing routes, nothing executes.
//   - every read writes a receipt: `page.read` when text came back,
//     `page.unreadable` when it did not. Silence is not allowed.
//   - scope travels with the record: the note carries the same
//     organization_id as the file it came from.

/** Gateway failure that still knows its HTTP status, so callers can break the circuit. */
export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GatewayError";
  }
}

/** Extract readable text from an image through the Lovable AI Gateway. */
export async function ocrImage(blob: Blob, mime: string): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new GatewayError(401, "LOVABLE_API_KEY missing");
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const dataUrl = `data:${mime || "image/png"};base64,${btoa(bin)}`;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Extract all readable text from this image, including handwriting. Return plain text only and preserve line breaks. If there is genuinely no text, reply with exactly: NO_TEXT",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new GatewayError(r.status, `vision ${r.status}: ${t.slice(0, 200)}`);
  }
  const j = await r.json();
  const out = String(j.choices?.[0]?.message?.content ?? "").trim();
  return out === "NO_TEXT" ? "" : out;
}

export interface PageFileRecord {
  id: string;
  user_id: string;
  organization_id: string | null;
  filename: string;
  mime_type: string | null;
  storage_path: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
}

export type PageReadResult =
  | { ok: true; noteId: string; chars: number }
  | { ok: false; reason: string; status?: number };

/** True when this file is a page Vanta should try to read. */
export function isPageFile(rec: { mime_type: string | null; filename: string }): boolean {
  const mime = (rec.mime_type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const ext = rec.filename.split(".").pop()?.toLowerCase() ?? "";
  return ["png", "jpg", "jpeg", "webp", "heic", "heif"].includes(ext);
}

/**
 * Read one captured page. Writes a note, files the record for review, and
 * leaves a receipt either way. Never throws for an unreadable page — it
 * reports it — but a gateway circuit break (402/403) is rethrown so a batch
 * runner can stop instead of burning through every remaining page.
 */
export async function readPageFile(
  admin: any,
  rec: PageFileRecord,
): Promise<PageReadResult> {
  const meta = (rec.metadata ?? {}) as Record<string, unknown>;
  const fail = async (reason: string, status?: number): Promise<PageReadResult> => {
    await admin.from("ingested_files").update({
      status: "error",
      error: reason.slice(0, 500),
      review_status: "needs_review",
      metadata: { ...meta, page_read_failed_at: new Date().toISOString() },
    }).eq("id", rec.id);
    await admin.from("audit_log").insert({
      user_id: rec.user_id,
      organization_id: rec.organization_id ?? null,
      entity_type: "ingested_file",
      entity_id: rec.id,
      event: "page.unreadable",
      payload: { source: rec.source, filename: rec.filename, reason: reason.slice(0, 200) },
    });
    return { ok: false, reason, status };
  };

  if (!rec.storage_path) return await fail("The file never finished uploading.");

  await admin.from("ingested_files").update({ status: "processing" }).eq("id", rec.id);

  const { data: blob, error: dlErr } = await admin.storage
    .from("memory-uploads").download(rec.storage_path);
  if (dlErr || !blob) return await fail(dlErr?.message ?? "The file could not be opened.");

  let text = "";
  try {
    text = await ocrImage(blob, (rec.mime_type ?? "image/png").toLowerCase());
  } catch (e) {
    const status = e instanceof GatewayError ? e.status : undefined;
    const msg = e instanceof Error ? e.message : "reading failed";
    await fail(msg, status);
    // 402 / 403 are not this page's fault — let the caller stop the batch.
    if (status === 402 || status === 403) throw e;
    return { ok: false, reason: msg, status };
  }

  const trimmed = text.slice(0, 200_000);
  const body = trimmed
    ? trimmed
    : `Photo of a page: ${rec.filename}. Nothing readable came back, so this is filed as-is.`;

  const { data: note, error: noteErr } = await admin.from("notes").insert({
    user_id: rec.user_id,
    organization_id: rec.organization_id ?? null,
    title: (meta.caption as string | undefined)?.slice(0, 120) || rec.filename,
    body,
    tags: ["page", rec.source ?? "upload", "via:ocr"],
    metadata: {
      ingested_file_id: rec.id,
      source: rec.source,
      mime: rec.mime_type,
      extraction: "ocr",
      page_photo: true,
    },
  }).select("id").single();
  if (noteErr || !note) return await fail(noteErr?.message ?? "The note could not be saved.");

  await admin.from("ingested_files").update({
    status: "done",
    note_id: note.id,
    error: null,
    extracted_text: trimmed || null,
    detected_doc_type: "image",
    /* Read, not routed. It still needs a human to say where it belongs. */
    review_status: "needs_review",
    metadata: { ...meta, extraction: "ocr", chars: trimmed.length, page_read_at: new Date().toISOString() },
  }).eq("id", rec.id);

  await admin.from("audit_log").insert({
    user_id: rec.user_id,
    organization_id: rec.organization_id ?? null,
    entity_type: "ingested_file",
    entity_id: rec.id,
    event: "page.read",
    payload: {
      source: rec.source,
      filename: rec.filename,
      note_id: note.id,
      chars: trimmed.length,
      readable: trimmed.length > 0,
    },
  });

  return { ok: true, noteId: note.id, chars: trimmed.length };
}
